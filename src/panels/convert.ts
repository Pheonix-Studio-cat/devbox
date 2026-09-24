import { el } from "../dom";
import { describeChange, fitWithin, formatBytes } from "../tools/image";
import { action, choice, createImageWorkbench, number, pairs } from "../workbench";
import type { Panel } from "./types";

const FORMATS = { PNG: "image/png", JPEG: "image/jpeg", WebP: "image/webp" } as const;
type FormatName = keyof typeof FORMATS;

const EXTENSIONS: Record<FormatName, string> = { PNG: "png", JPEG: "jpg", WebP: "webp" };

export const convertPanel: Panel = {
  id: "convert",
  name: "Image formats",
  blurb: "Convert between PNG, JPEG, WebP and SVG-to-pixels, resize, or embed as a data URI.",
  render() {
    let format: FormatName = "WebP";
    let quality = 85;
    let maxEdge = 0;
    let svgEdge = 1024;

    const bench = createImageWorkbench(4000, svgEdge);

    // Encoding is asynchronous and two conversions can finish out of order, so
    // an older one must not paint over a newer one, nor over the error from a
    // file that would not open. Without this the caption names the file just
    // dropped while the result still describes the last.
    let job = 0;
    const stale = (mine: number, revision: number): boolean =>
      mine !== job || revision !== bench.revision();

    const redraw = (): HTMLCanvasElement | null => {
      const image = bench.current();
      if (!image) return null;
      const target = fitWithin({ width: image.width, height: image.height }, maxEdge);
      if (!target.scaled) return image.canvas;

      const canvas = document.createElement("canvas");
      canvas.width = target.width;
      canvas.height = target.height;
      const context = canvas.getContext("2d");
      if (!context) return image.canvas;
      context.drawImage(image.canvas, 0, 0, target.width, target.height);
      return canvas;
    };

    const convert = (): void => {
      const image = bench.current();
      const canvas = redraw();
      if (!image || !canvas) {
        bench.setError("Load an image first — drop one on the left.");
        return;
      }

      const mine = ++job;
      const revision = bench.revision();
      const type = FORMATS[format];
      canvas.toBlob(
        (blob) => {
          if (stale(mine, revision)) return;
          if (!blob) {
            bench.setError(`This browser cannot write ${format}. Try PNG.`);
            return;
          }
          const name = `${image.name.replace(/\.[^.]+$/, "") || "image"}.${EXTENSIONS[format]}`;
          const url = URL.createObjectURL(blob);
          bench.setContent(
            el("img", { class: "svg-preview", alt: "Converted image", src: url }),
            pairs([
              ["Format", `${image.type || "unknown"} → ${type}`],
              ["Dimensions", `${image.width}×${image.height} → ${canvas.width}×${canvas.height}`],
              [
                "File size",
                `${formatBytes(image.bytes)} → ${formatBytes(blob.size)} ` +
                  `(${describeChange(image.bytes, blob.size)})`,
              ],
            ]),
            el(
              "div",
              { class: "pane-actions spread" },
              el("a", { class: "download", href: url, download: name }, `Download .${EXTENSIONS[format]}`),
            ),
          );
        },
        type,
        quality / 100,
      );
    };

    const asDataUri = (): void => {
      const canvas = redraw();
      if (!canvas) {
        bench.setError("Load an image first — drop one on the left.");
        return;
      }

      // Same ordering guard: a pending conversion must not land on top of this.
      job += 1;
      const uri = canvas.toDataURL(FORMATS[format], quality / 100);
      bench.setContent(
        el("p", { class: "muted" }, "Paste this straight into CSS or an <img> tag."),
        pairs([["Length", `${uri.length.toLocaleString()} characters`]]),
        el("pre", { class: "source" }, uri),
      );
    };

    bench.onRun(convert);
    bench.onImage(() => undefined);
    bench.toolbar.append(
      action("Convert", convert, true),
      action("As data URI", asDataUri),
      number("SVG at px", svgEdge, 16, 4096, (value) => {
        svgEdge = value;
        // Only an SVG can be redrawn larger: pixels do not grow back.
        void bench.redrawSvg(value).then((redrawn) => {
          if (!redrawn) return;
          convert();
        });
      }, 64),
      choice("Format", Object.keys(FORMATS), (value) => {
        format = value as FormatName;
      }),
      number("Quality %", quality, 1, 100, (value) => {
        quality = value;
      }),
      number("Max edge px", maxEdge, 0, 8000, (value) => {
        maxEdge = value;
      }, 100),
    );

    return bench.root;
  },
};
