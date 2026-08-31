import { err, ok, type Result } from "./result";

export const BIT_WIDTHS = [8, 16, 32, 64] as const;
export type BitWidth = (typeof BIT_WIDTHS)[number];

export interface NumberView {
  decimal: string;
  hexadecimal: string;
  binary: string;
  octal: string;
  /** Two's-complement reading at the chosen width, or null if it does not fit. */
  signed: string | null;
  bytes: string;
  fitsIn: BitWidth | null;
}

/**
 * Reads decimal, or hex/binary/octal with the usual 0x/0b/0o prefixes.
 * Underscores and spaces are allowed as digit separators.
 */
export function parseNumber(input: string): Result<bigint> {
  const trimmed = input.trim().replace(/[_\s]/g, "");
  if (trimmed === "") return err("Nothing to convert — the input is empty.");

  const negative = trimmed.startsWith("-");
  const body = negative ? trimmed.slice(1) : trimmed;

  const bases: ReadonlyArray<readonly [RegExp, RegExp, string]> = [
    [/^0x/i, /^0x[0-9a-f]+$/i, "hexadecimal"],
    [/^0b/i, /^0b[01]+$/i, "binary"],
    [/^0o/i, /^0o[0-7]+$/i, "octal"],
  ];

  for (const [prefix, valid, name] of bases) {
    if (!prefix.test(body)) continue;
    if (!valid.test(body)) return err(`That is not a valid ${name} number.`);
    const value = BigInt(body.toLowerCase());
    return ok(negative ? -value : value);
  }

  if (!/^\d+$/.test(body)) {
    return err("Unrecognised number. Use decimal, or a 0x, 0b or 0o prefix.");
  }
  const value = BigInt(body);
  return ok(negative ? -value : value);
}

/** Groups a string from the right, e.g. binary into bytes. */
function groupFromRight(value: string, size: number, separator = " "): string {
  const groups: string[] = [];
  for (let end = value.length; end > 0; end -= size) {
    groups.unshift(value.slice(Math.max(0, end - size), end));
  }
  return groups.join(separator);
}

function smallestWidth(value: bigint): BitWidth | null {
  for (const width of BIT_WIDTHS) {
    const limit = 1n << BigInt(width);
    if (value >= 0n ? value < limit : value >= -(limit >> 1n)) return width;
  }
  return null;
}

/** Renders one value in every base, plus its two's-complement reading. */
export function describeNumber(value: bigint, width: BitWidth): NumberView {
  const magnitude = value < 0n ? -value : value;
  const sign = value < 0n ? "-" : "";
  const binary = magnitude.toString(2);

  const bits = BigInt(width);
  const fits = value >= 0n ? value < 1n << bits : value >= -(1n << (bits - 1n));
  // Reading the raw bits as a signed integer: anything with the top bit set
  // counts as negative.
  const wrapped = ((value % (1n << bits)) + (1n << bits)) % (1n << bits);
  const signed = fits
    ? (wrapped >= 1n << (bits - 1n) ? wrapped - (1n << bits) : wrapped).toString()
    : null;

  return {
    decimal: value.toString(),
    hexadecimal: `${sign}0x${magnitude.toString(16).toUpperCase()}`,
    binary: `${sign}0b${groupFromRight(binary, 4)}`,
    octal: `${sign}0o${magnitude.toString(8)}`,
    signed,
    bytes: groupFromRight(wrapped.toString(2).padStart(width, "0"), 8),
    fitsIn: smallestWidth(value),
  };
}
