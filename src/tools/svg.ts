import { err, ok, type Result } from "./result";

export interface SvgSize {
  width: number;
  height: number;
  /** True when the size came from the viewBox rather than an explicit size. */
  fromViewBox: boolean;
}

/** Absolute CSS units, in pixels. Percentages are not a size at all. */
const UNITS: Record<string, number> = {
  "": 1,
  px: 1,
  pt: 96 / 72,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
};

function toPixels(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const match = /^\s*(-?[\d.]+)\s*([a-z%]*)\s*$/i.exec(raw);
  if (!match) return null;

  const value = Number.parseFloat(match[1]!);
  const factor = UNITS[match[2]!.toLowerCase()];
  if (!Number.isFinite(value) || value <= 0 || factor === undefined) return null;
  return value * factor;
}

const attribute = (tag: string, name: string): string | undefined =>
  new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag)?.[1] ??
  new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, "i").exec(tag)?.[1];

/**
 * Reads the size an SVG asks to be drawn at.
 *
 * An SVG has no pixels of its own. It may state a width and height, or only a
 * viewBox giving its proportions, or neither — and a width in percent is a
 * share of something else, not a size. Anything rasterising one has to decide,
 * so this says what the file actually specifies and leaves the choice to the
 * caller.
 */
export function readSvgSize(source: string): Result<SvgSize> {
  const tag = /<svg\b[^>]*>/i.exec(source)?.[0];
  if (!tag) return err("That does not look like an SVG — no <svg> element found.");

  const width = toPixels(attribute(tag, "width"));
  const height = toPixels(attribute(tag, "height"));
  if (width !== null && height !== null) return ok({ width, height, fromViewBox: false });

  const viewBox = attribute(tag, "viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (viewBox?.length === 4 && viewBox.every(Number.isFinite)) {
    const [, , boxWidth, boxHeight] = viewBox as [number, number, number, number];
    if (boxWidth > 0 && boxHeight > 0) {
      return ok({ width: boxWidth, height: boxHeight, fromViewBox: true });
    }
  }

  // One dimension alone still fixes nothing without proportions to go on.
  return err(
    "This SVG states no size: it has no usable width and height, and no viewBox. " +
      "Pick the output size yourself.",
  );
}

/** Scales a size so its longest edge matches `longEdge`, keeping proportions. */
export function renderSize(size: SvgSize, longEdge: number): { width: number; height: number } {
  const target = Math.max(1, Math.round(longEdge));
  const longest = Math.max(size.width, size.height);
  const factor = target / longest;
  return {
    width: Math.max(1, Math.round(size.width * factor)),
    height: Math.max(1, Math.round(size.height * factor)),
  };
}

/** SVG files arrive with an empty type often enough to check the name too. */
export function isSvg(name: string, type: string): boolean {
  return type === "image/svg+xml" || name.toLowerCase().endsWith(".svg");
}
