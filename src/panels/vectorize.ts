import { el } from "../dom";
import { describeChange, formatBytes } from "../tools/image";
import { embedAsSvg, vectorize } from "../tools/vectorize";
import { action, createImageWorkbench, number, pairs, toggle } from "../workbench";
import type { Panel } from "./types";

/** Renders SVG source as a picture without handing markup to the DOM. */
const previewOf = (svg: string): HTMLImageElement =>
  el("img", {
    class: "svg-preview",
    alt: "Traced result",
    src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  });

function downloadButton(name: string, svg: string): HTMLAnchorElement {
  const blob = new Blob([svg], { type: "image/svg+xml" });
  return el(
    "a",
    { class: "download", href: URL.createObjectURL(blob), download: name },
    "Download .svg",
  );
}

export const vectorizePanel: Panel = {
  id: "vectorize",
  name: "Image to SVG",
  blurb: "Trace a picture into real vector shapes you can scale.",
  render() {
    let colours = 8;
    let tolerance = 1;
    let smooth = true;
    let minArea = 4;

    const bench = createImageWorkbench();

    const pixelsOf = (canvas: HTMLCanvasElement) => {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return null;
      const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
      return { data, width, height };
    };

    const trace = () => {
      const image = bench.current();
      if (!image) {
        bench.setError("Load an image first — drop one on the left.");
        return;
      }
      const pixels = pixelsOf(image.canvas);
      if (!pixels) {
        bench.setError("This browser will not give us the image data to trace.");
        return;
      }

      const started = performance.now();
      const result = vectorize(pixels, { colours, tolerance, smooth, minArea });
      const elapsed = Math.round(performance.now() - started);

      const name = image.name.replace(/\.[^.]+$/, "") || "traced";
      bench.setContent(
        previewOf(result.svg),
        pairs([
          ["Shapes", result.shapes.toLocaleString()],
          ["Colours used", String(result.colours)],
          ["SVG size", `${formatBytes(result.bytes)} (${describeChange(image.bytes, result.bytes)})`],
          ["Traced in", `${elapsed} ms`],
        ]),
        el("div", { class: "pane-actions spread" }, downloadButton(`${name}.svg`, result.svg)),
        el("pre", { class: "source" }, result.svg),
      );
    };

    const embed = () => {
      const image = bench.current();
      if (!image) {
        bench.setError("Load an image first — drop one on the left.");
        return;
      }
      const svg = embedAsSvg(image.canvas.toDataURL("image/png"), image.width, image.height);
      const name = image.name.replace(/\.[^.]+$/, "") || "embedded";
      bench.setContent(
        el(
          "p",
          { class: "muted" },
          "The picture is wrapped in an SVG unchanged. The file ends in .svg, but it is " +
            "still made of pixels and will blur when enlarged.",
        ),
        previewOf(svg),
        pairs([["File size", formatBytes(new TextEncoder().encode(svg).length)]]),
        el("div", { class: "pane-actions spread" }, downloadButton(`${name}.svg`, svg)),
      );
    };

    bench.onRun(trace);
    bench.onImage(() => undefined);
    bench.toolbar.append(
      action("Trace", trace, true),
      action("Wrap unchanged", embed),
      number("Colours", colours, 2, 32, (value) => {
        colours = value;
      }),
      number("Smoothing", tolerance, 0, 8, (value) => {
        tolerance = value;
      }, 0.5),
      number("Min. area", minArea, 0, 200, (value) => {
        minArea = value;
      }),
      toggle("Rounded corners", smooth, (value) => {
        smooth = value;
      }),
    );

    return bench.root;
  },
};
