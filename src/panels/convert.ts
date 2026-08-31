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
  blurb: "Convert between PNG, JPEG and WebP, resize, or embed as a data URI.",
  render() {
    let format: FormatName = "WebP";
    let quality = 85;
    let maxEdge = 0;

    const bench = createImageWorkbench(4000);

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

      const type = FORMATS[format];
      canvas.toBlob(
        (blob) => {
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
