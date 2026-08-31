import { quantize, type Pixels, type Swatch } from "./quantize";
import { simplifyLoop, signedArea, toPathData, traceRegions } from "./trace";

export interface VectorizeOptions {
  /** Palette size, 2–64. */
  colours?: number;
  /** Douglas–Peucker tolerance in pixels; 0 keeps every step. */
  tolerance?: number;
  /** Round the corners instead of emitting straight edges. */
  smooth?: boolean;
  /** Drop shapes smaller than this many pixels of area. */
  minArea?: number;
}

export interface VectorizeResult {
  svg: string;
  shapes: number;
  colours: number;
  bytes: number;
}

const hex = ({ r, g, b }: Swatch): string =>
  `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;

/**
 * Turns pixels into real SVG paths: reduce to a palette, walk the outline of
 * every resulting region, then simplify those outlines.
 *
 * Flat artwork — logos, screenshots, line drawings — comes out clean. A
 * photograph does not become vector art; it becomes a heap of colour blobs,
 * because that is what tracing continuous tone can produce.
 */
export function vectorize(pixels: Pixels, options: VectorizeOptions = {}): VectorizeResult {
  const { colours = 8, tolerance = 1, smooth = true, minArea = 4 } = options;
  const { width, height } = pixels;
  const { palette, indices } = quantize(pixels, colours);

  const counts = new Array<number>(palette.length).fill(0);
  let transparent = 0;
  for (const index of indices) {
    if (index < 0) transparent += 1;
    else counts[index] = (counts[index] ?? 0) + 1;
  }

  // With no transparency the largest colour can be one rectangle behind
  // everything else, which removes the biggest path in the file.
  const background =
    transparent === 0 && counts.length > 0 ? counts.indexOf(Math.max(...counts)) : -1;

  const parts: string[] = [];
  let shapes = 0;
  let used = 0;

  if (background !== -1) {
    parts.push(`<rect width="${width}" height="${height}" fill="${hex(palette[background]!)}"/>`);
    used += 1;
  }

  for (let index = 0; index < palette.length; index += 1) {
    if (index === background || counts[index] === 0) continue;

    const loops = traceRegions(indices, width, height, index)
      .map((loop) => simplifyLoop(loop, tolerance))
      .filter((loop) => loop.length >= 3 && Math.abs(signedArea(loop)) >= minArea);
    if (loops.length === 0) continue;

    parts.push(
      `<path fill="${hex(palette[index]!)}" fill-rule="evenodd" d="${toPathData(loops, smooth)}"/>`,
    );
    shapes += loops.length;
    used += 1;
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `width="${width}" height="${height}">\n  ${parts.join("\n  ")}\n</svg>`;

  return { svg, shapes, colours: used, bytes: new TextEncoder().encode(svg).length };
}

/** Wraps the image itself in an SVG, for when tracing is not what you want. */
export function embedAsSvg(dataUri: string, width: number, height: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `width="${width}" height="${height}">\n` +
    `  <image href="${dataUri}" width="${width}" height="${height}"/>\n</svg>`
  );
}
