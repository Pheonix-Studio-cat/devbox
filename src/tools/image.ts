export interface Size {
  width: number;
  height: number;
}

/** Scales a size down to fit inside `maxEdge`, keeping its proportions. */
export function fitWithin({ width, height }: Size, maxEdge: number): Size & { scaled: boolean } {
  const longest = Math.max(width, height);
  if (maxEdge <= 0 || longest <= maxEdge) return { width, height, scaled: false };

  const factor = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
    scaled: true,
  };
}

const UNITS = ["B", "kB", "MB", "GB"] as const;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const places = unit === 0 ? 0 : value < 10 ? 2 : 1;
  return `${value.toFixed(places)} ${UNITS[unit]}`;
}

/** Describes a size change as a percentage, e.g. "62% smaller". */
export function describeChange(before: number, after: number): string {
  if (before <= 0) return "—";
  const ratio = after / before;
  const percent = Math.round(Math.abs(1 - ratio) * 100);
  if (percent === 0) return "same size";
  return ratio < 1 ? `${percent}% smaller` : `${percent}% larger`;
}
