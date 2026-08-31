import { err, ok, type Result } from "./result";

export interface Rgb {
  r: number;
  g: number;
  b: number;
  /** 0–1 */
  a: number;
}

export interface ColorView {
  hex: string;
  rgb: string;
  hsl: string;
  oklch: string;
  onWhite: number;
  onBlack: number;
  /** WCAG verdict per background — the two can differ sharply. */
  onWhiteRating: string;
  onBlackRating: string;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const round = (value: number, places = 0): number => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

function parseHex(value: string): Rgb | null {
  const digits = value.slice(1);
  const expand = (pair: string): number => parseInt(pair, 16);

  if (/^[0-9a-f]{3,4}$/i.test(digits)) {
    const parts = [...digits].map((digit) => expand(digit + digit));
    return { r: parts[0]!, g: parts[1]!, b: parts[2]!, a: (parts[3] ?? 255) / 255 };
  }
  if (/^[0-9a-f]{6}$/i.test(digits) || /^[0-9a-f]{8}$/i.test(digits)) {
    const parts: number[] = [];
    for (let i = 0; i < digits.length; i += 2) parts.push(expand(digits.slice(i, i + 2)));
    return { r: parts[0]!, g: parts[1]!, b: parts[2]!, a: (parts[3] ?? 255) / 255 };
  }
  return null;
}

function parseFunctional(value: string): Rgb | null {
  const match = /^(rgba?|hsla?)\(([^)]+)\)$/i.exec(value);
  if (!match) return null;

  const kind = match[1]!.toLowerCase();
  const parts = match[2]!.split(/[\s,/]+/).filter((part) => part !== "");
  if (parts.length < 3) return null;

  const numeric = parts.map((part) => Number.parseFloat(part));
  if (numeric.slice(0, 3).some((n) => Number.isNaN(n))) return null;

  const alphaRaw = parts[3];
  const alpha = alphaRaw === undefined
    ? 1
    : alphaRaw.endsWith("%")
      ? Number.parseFloat(alphaRaw) / 100
      : Number.parseFloat(alphaRaw);
  if (Number.isNaN(alpha)) return null;

  if (kind.startsWith("rgb")) {
    const channel = (index: number): number => {
      const part = parts[index]!;
      const raw = numeric[index]!;
      return clamp(part.endsWith("%") ? (raw / 100) * 255 : raw, 0, 255);
    };
    return { r: round(channel(0)), g: round(channel(1)), b: round(channel(2)), a: clamp(alpha, 0, 1) };
  }

  const rgb = hslToRgb({
    h: numeric[0]!,
    s: clamp(numeric[1]!, 0, 100) / 100,
    l: clamp(numeric[2]!, 0, 100) / 100,
  });
  return { ...rgb, a: clamp(alpha, 0, 1) };
}

/** Accepts #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba() and hsl()/hsla(). */
export function parseColor(input: string): Result<Rgb> {
  const value = input.trim().toLowerCase();
  if (value === "") return err("Nothing to convert — the input is empty.");

  const parsed = value.startsWith("#") ? parseHex(value) : parseFunctional(value);
  if (!parsed) {
    return err("Unrecognised colour. Try #3b82f6, rgb(59 130 246) or hsl(217 91% 60%).");
  }
  return ok(parsed);
}

export function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === red) h = ((green - blue) / delta) % 6;
  else if (max === green) h = (blue - red) / delta + 2;
  else h = (red - green) / delta + 4;

  return { h: ((h * 60) % 360 + 360) % 360, s, l };
}

export function hslToRgb({ h, s, l }: { h: number; s: number; l: number }): Omit<Rgb, "a"> {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;

  const sector = Math.floor(hue / 60) % 6;
  const table: ReadonlyArray<readonly [number, number, number]> = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ];
  const [r, g, b] = table[sector]!;
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

/** sRGB channel to linear light. */
const linearise = (channel: number): number => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

/** Oklch, via Björn Ottosson's Oklab matrices. */
export function rgbToOklch({ r, g, b }: Rgb): { l: number; c: number; h: number } {
  const red = linearise(r);
  const green = linearise(g);
  const blue = linearise(b);

  const long = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const medium = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const short = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);

  const lightness = 0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short;
  const a = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short;
  const bAxis = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short;

  const chroma = Math.hypot(a, bAxis);
  const hue = chroma < 1e-6 ? 0 : ((Math.atan2(bAxis, a) * 180) / Math.PI + 360) % 360;
  return { l: lightness, c: chroma, h: hue };
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/** WCAG 2.1 contrast ratio, between 1 and 21. */
export function contrastRatio(first: Rgb, second: Rgb): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

export function formatHex({ r, g, b, a }: Rgb): string {
  const pair = (value: number): string => Math.round(value).toString(16).padStart(2, "0");
  const alpha = a >= 1 ? "" : pair(a * 255);
  return `#${pair(r)}${pair(g)}${pair(b)}${alpha}`.toUpperCase();
}

/**
 * WCAG 2.1 thresholds for body text. Comparing against the better of two
 * backgrounds is useless — that value never drops below 4.58 — so each
 * background is rated on its own.
 */
export function rateContrast(ratio: number): string {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "large text only";
  return "fails";
}

const WHITE: Rgb = { r: 255, g: 255, b: 255, a: 1 };
const BLACK: Rgb = { r: 0, g: 0, b: 0, a: 1 };

/** Every representation of one colour, plus its contrast against black and white. */
export function describeColor(colour: Rgb): ColorView {
  const { h, s, l } = rgbToHsl(colour);
  const { l: lightness, c, h: hue } = rgbToOklch(colour);
  const alpha = colour.a >= 1 ? "" : ` / ${round(colour.a, 3)}`;

  const onWhite = contrastRatio(colour, WHITE);
  const onBlack = contrastRatio(colour, BLACK);

  return {
    hex: formatHex(colour),
    rgb: `rgb(${Math.round(colour.r)} ${Math.round(colour.g)} ${Math.round(colour.b)}${alpha})`,
    hsl: `hsl(${round(h)} ${round(s * 100)}% ${round(l * 100)}%${alpha})`,
    oklch: `oklch(${round(lightness * 100, 1)}% ${round(c, 3)} ${round(hue, 1)}${alpha})`,
    onWhite: round(onWhite, 2),
    onBlack: round(onBlack, 2),
    onWhiteRating: rateContrast(onWhite),
    onBlackRating: rateContrast(onBlack),
  };
}
