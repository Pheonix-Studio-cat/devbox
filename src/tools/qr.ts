import { err, ok, type Result } from "./result";

export const EC_LEVELS = ["L", "M", "Q", "H"] as const;
export type EcLevel = (typeof EC_LEVELS)[number];

export interface QrCode {
  version: number;
  ecLevel: EcLevel;
  size: number;
  /** Row-major grid; true is a dark module. */
  modules: boolean[][];
  mask: number;
  bytes: number;
}

/**
 * Error-correction layout per version, as [ecCodewordsPerBlock, blocks in
 * group 1, data codewords each, blocks in group 2, data codewords each].
 * Versions 1–10, which hold 271 bytes at level L — enough for a URL.
 */
const BLOCKS: Record<EcLevel, ReadonlyArray<readonly number[]>> = {
  L: [
    [7, 1, 19], [10, 1, 34], [15, 1, 55], [20, 1, 80], [26, 1, 108],
    [18, 2, 68], [20, 2, 78], [24, 2, 97], [30, 2, 116], [18, 2, 68, 2, 69],
  ],
  M: [
    [10, 1, 16], [16, 1, 28], [26, 1, 44], [18, 2, 32], [24, 2, 43],
    [16, 4, 27], [18, 4, 31], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44],
  ],
  Q: [
    [13, 1, 13], [22, 1, 22], [18, 2, 17], [26, 2, 24], [18, 2, 15, 2, 16],
    [24, 4, 19], [18, 2, 14, 4, 15], [22, 4, 18, 2, 19], [20, 4, 16, 4, 17], [24, 6, 19, 2, 20],
  ],
  H: [
    [17, 1, 9], [28, 1, 16], [22, 2, 13], [16, 4, 9], [22, 2, 11, 2, 12],
    [28, 4, 15], [26, 4, 13, 1, 14], [26, 4, 14, 2, 15], [24, 4, 12, 4, 13], [28, 6, 15, 2, 16],
  ],
};

/** Centre coordinates of the alignment patterns, by version. */
const ALIGNMENT: ReadonlyArray<readonly number[]> = [
  [], [6, 18], [6, 22], [6, 26], [6, 30],
  [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

/** Unused bits left over after the codewords, by version. */
const REMAINDER = [0, 7, 7, 7, 7, 7, 0, 0, 0, 0];

const EC_BITS: Record<EcLevel, number> = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };

export const MAX_VERSION = BLOCKS.L.length;

// --- Galois field GF(256), primitive polynomial 0x11D ---

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let value = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = value;
    LOG[value] = i;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255]!;
}

const multiply = (a: number, b: number): number =>
  a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!;

/** The generator polynomial for `degree` error-correction codewords. */
function generatorPolynomial(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    // Multiplying by (x + α^i): the shifted term keeps its coefficient, and
    // the scaled term moves one place down. Swapping these two still divides
    // cleanly by its own generator, so only a foreign encoder catches it.
    for (let j = 0; j < poly.length; j += 1) {
      next[j] = (next[j] ?? 0) ^ poly[j]!;
      next[j + 1] = (next[j + 1] ?? 0) ^ multiply(poly[j]!, EXP[i]!);
    }
    poly = next;
  }
  return poly;
}

/** Polynomial long division; the remainder is the error correction. */
function errorCorrection(data: readonly number[], degree: number): number[] {
  const generator = generatorPolynomial(degree);
  const remainder = new Array<number>(degree).fill(0);

  for (const byte of data) {
    const factor = byte ^ remainder[0]!;
    remainder.shift();
    remainder.push(0);
    if (factor !== 0) {
      for (let i = 0; i < degree; i += 1) {
        remainder[i] = remainder[i]! ^ multiply(generator[i + 1]!, factor);
      }
    }
  }
  return remainder;
}

// --- Bit stream ---

class BitBuffer {
  readonly bits: number[] = [];

  put(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i -= 1) this.bits.push((value >>> i) & 1);
  }

  get length(): number {
    return this.bits.length;
  }

  toBytes(): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j += 1) byte = (byte << 1) | (this.bits[i + j] ?? 0);
      bytes.push(byte);
    }
    return bytes;
  }
}

const dataCapacity = (version: number, level: EcLevel): number => {
  const [, g1, d1, g2 = 0, d2 = 0] = BLOCKS[level][version - 1]!;
  return g1! * d1! + g2 * d2;
};

/** Byte mode carries an 8-bit length below version 10, 16 bits from there. */
const countBits = (version: number): number => (version < 10 ? 8 : 16);

// --- Module placement ---

const FINDER_OFFSETS: ReadonlyArray<readonly [number, number]> = [[0, 0], [1, 0], [0, 1]];

function blankMatrix(size: number): { modules: (boolean | null)[][]; reserved: boolean[][] } {
  const modules = Array.from({ length: size }, () => new Array<boolean | null>(size).fill(null));
  const reserved = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  return { modules, reserved };
}

function placeFunctionPatterns(
  modules: (boolean | null)[][],
  reserved: boolean[][],
  version: number,
): void {
  const size = modules.length;

  const set = (row: number, column: number, dark: boolean): void => {
    if (row < 0 || column < 0 || row >= size || column >= size) return;
    modules[row]![column] = dark;
    reserved[row]![column] = true;
  };

  // Finder patterns plus their separators, in three corners.
  for (const [dx, dy] of FINDER_OFFSETS) {
    const originRow = dy === 0 ? 0 : size - 7;
    const originColumn = dx === 0 ? 0 : size - 7;
    for (let row = -1; row <= 7; row += 1) {
      for (let column = -1; column <= 7; column += 1) {
        const inRing =
          (row >= 0 && row <= 6 && (column === 0 || column === 6)) ||
          (column >= 0 && column <= 6 && (row === 0 || row === 6));
        const inCore = row >= 2 && row <= 4 && column >= 2 && column <= 4;
        set(originRow + row, originColumn + column, inRing || inCore);
      }
    }
  }

  // Timing patterns.
  for (let i = 8; i < size - 8; i += 1) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }

  // Alignment patterns, except where they would cover a finder.
  const centres = ALIGNMENT[version - 1]!;
  for (const row of centres) {
    for (const column of centres) {
      const nearFinder =
        (row === 6 && column === 6) ||
        (row === 6 && column === size - 7) ||
        (row === size - 7 && column === 6);
      if (nearFinder) continue;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const edge = Math.max(Math.abs(dx), Math.abs(dy));
          set(row + dy, column + dx, edge !== 1);
        }
      }
    }
  }

  // The always-dark module, and the areas the format bits will occupy.
  set(size - 8, 8, true);
  for (let i = 0; i < 9; i += 1) {
    if (!reserved[8]![i]) set(8, i, false);
    if (!reserved[i]![8]) set(i, 8, false);
  }
  for (let i = 0; i < 8; i += 1) {
    if (!reserved[8]![size - 1 - i]) set(8, size - 1 - i, false);
    if (!reserved[size - 1 - i]![8]) set(size - 1 - i, 8, false);
  }

  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      const row = Math.floor(i / 3);
      const column = i % 3;
      set(size - 11 + column, row, false);
      set(row, size - 11 + column, false);
    }
  }
}

/** Walks the zigzag pattern from the bottom right, skipping the timing column. */
function placeData(
  modules: (boolean | null)[][],
  reserved: boolean[][],
  bits: readonly number[],
): void {
  const size = modules.length;
  let index = 0;
  let upward = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    // The vertical timing pattern occupies column 6, so the pairs to its left
    // shift by one: ..., (8,7), (5,4), (3,2), (1,0).
    if (right === 6) right = 5;
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (const column of [right, right - 1]) {
        if (reserved[row]![column]) continue;
        modules[row]![column] = (bits[index] ?? 0) === 1;
        index += 1;
      }
    }
    upward = !upward;
  }
}

const MASKS: ReadonlyArray<(row: number, column: number) => boolean> = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** The four penalty rules that decide which mask reads most reliably. */
export function maskPenalty(grid: readonly boolean[][]): number {
  const size = grid.length;
  let penalty = 0;

  const runPenalty = (run: number): number => (run >= 5 ? 3 + (run - 5) : 0);

  for (let i = 0; i < size; i += 1) {
    for (const horizontal of [true, false]) {
      let run = 1;
      for (let j = 1; j < size; j += 1) {
        const current = horizontal ? grid[i]![j]! : grid[j]![i]!;
        const previous = horizontal ? grid[i]![j - 1]! : grid[j - 1]![i]!;
        if (current === previous) {
          run += 1;
        } else {
          penalty += runPenalty(run);
          run = 1;
        }
      }
      penalty += runPenalty(run);
    }
  }

  for (let row = 0; row < size - 1; row += 1) {
    for (let column = 0; column < size - 1; column += 1) {
      const first = grid[row]![column]!;
      if (
        first === grid[row]![column + 1] &&
        first === grid[row + 1]![column] &&
        first === grid[row + 1]![column + 1]
      ) {
        penalty += 3;
      }
    }
  }

  // The finder-like sequence, which must not appear in the data.
  const pattern = [true, false, true, true, true, false, true];
  const hasPatternAt = (line: readonly boolean[], start: number): boolean =>
    pattern.every((value, offset) => line[start + offset] === value);
  const quiet = (line: readonly boolean[], start: number, end: number): boolean => {
    for (let i = start; i < end; i += 1) if (line[i] !== false) return false;
    return true;
  };

  for (let i = 0; i < size; i += 1) {
    const row = grid[i]!;
    const column = grid.map((line) => line[i]!);
    for (const line of [row, column]) {
      for (let start = 0; start + 7 <= size; start += 1) {
        if (!hasPatternAt(line, start)) continue;
        const before = start - 4 >= 0 && quiet(line, start - 4, start);
        const after = start + 11 <= size && quiet(line, start + 7, start + 11);
        if (before || after) penalty += 40;
      }
    }
  }

  const dark = grid.flat().filter(Boolean).length;
  const percent = (dark * 100) / (size * size);
  penalty += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return penalty;
}

/** BCH(15,5) for the format bits, and BCH(18,6) for the version bits. */
function bch(value: number, generator: number, totalBits: number, dataBits: number): number {
  let remainder = value << (totalBits - dataBits);
  const generatorBits = 32 - Math.clz32(generator);
  while (32 - Math.clz32(remainder) >= generatorBits) {
    remainder ^= generator << (32 - Math.clz32(remainder) - generatorBits);
  }
  return ((value << (totalBits - dataBits)) | remainder) >>> 0;
}

function placeFormatInfo(grid: boolean[][], level: EcLevel, mask: number): void {
  const size = grid.length;
  const format = (bch((EC_BITS[level] << 3) | mask, 0x537, 15, 5) ^ 0x5412) >>> 0;
  const bit = (index: number): boolean => ((format >> index) & 1) === 1;

  // The low bits run down column 8 and along row 8 from the right; the two
  // copies mirror each other. Getting row and column the wrong way round here
  // still reads back consistently, so only a foreign decoder catches it.
  for (let i = 0; i <= 5; i += 1) grid[i]![8] = bit(i);
  grid[7]![8] = bit(6);
  grid[8]![8] = bit(7);
  grid[8]![7] = bit(8);
  for (let i = 9; i <= 14; i += 1) grid[8]![14 - i] = bit(i);

  for (let i = 0; i <= 7; i += 1) grid[8]![size - 1 - i] = bit(i);
  for (let i = 8; i <= 14; i += 1) grid[size - 15 + i]![8] = bit(i);
}

function placeVersionInfo(grid: boolean[][], version: number): void {
  if (version < 7) return;
  const size = grid.length;
  const info = bch(version, 0x1f25, 18, 6);

  for (let i = 0; i < 18; i += 1) {
    const dark = ((info >> i) & 1) === 1;
    const row = Math.floor(i / 3);
    const column = i % 3;
    grid[size - 11 + column]![row] = dark;
    grid[row]![size - 11 + column] = dark;
  }
}

/** Encodes text as a QR code in byte mode. */
export function encodeQr(
  text: string,
  ecLevel: EcLevel = "M",
  forcedMask?: number,
): Result<QrCode> {
  if (text === "") return err("Nothing to encode — the input is empty.");

  const data = [...new TextEncoder().encode(text)];
  // Mode indicator, character count, then the bytes themselves.
  const bitsNeeded = (candidate: number): number => 4 + countBits(candidate) + data.length * 8;
  const version = Array.from({ length: MAX_VERSION }, (_, i) => i + 1).find(
    (candidate) => bitsNeeded(candidate) <= dataCapacity(candidate, ecLevel) * 8,
  );
  if (version === undefined) {
    const largest = dataCapacity(MAX_VERSION, ecLevel) - 3;
    return err(
      `Too long for a version-${MAX_VERSION} code at level ${ecLevel}: ` +
        `${data.length} bytes, and the limit is about ${largest}. ` +
        "Shorten the text, or drop to level L for more room.",
    );
  }

  const capacity = dataCapacity(version, ecLevel);
  const buffer = new BitBuffer();
  buffer.put(0b0100, 4);
  buffer.put(data.length, countBits(version));
  for (const byte of data) buffer.put(byte, 8);

  buffer.put(0, Math.min(4, capacity * 8 - buffer.length));
  while (buffer.length % 8 !== 0) buffer.put(0, 1);

  // Pad bytes alternate starting with 0xEC, counted from the first pad byte
  // rather than from the start of the stream.
  const codewords = buffer.toBytes();
  const padding = [0xec, 0x11];
  for (let pad = 0; codewords.length < capacity; pad += 1) {
    codewords.push(padding[pad % 2]!);
  }

  // Split into blocks, error-correct each, then interleave both halves.
  const [ecPerBlock, g1, d1, g2 = 0, d2 = 0] = BLOCKS[ecLevel][version - 1]!;
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;
  for (const [count, size] of [[g1!, d1!], [g2, d2]] as const) {
    for (let i = 0; i < count; i += 1) {
      const block = codewords.slice(offset, offset + size);
      offset += size;
      dataBlocks.push(block);
      ecBlocks.push(errorCorrection(block, ecPerBlock!));
    }
  }

  const interleaved: number[] = [];
  const longest = Math.max(...dataBlocks.map((block) => block.length));
  for (let i = 0; i < longest; i += 1) {
    for (const block of dataBlocks) if (i < block.length) interleaved.push(block[i]!);
  }
  for (let i = 0; i < ecPerBlock!; i += 1) {
    for (const block of ecBlocks) interleaved.push(block[i]!);
  }

  const bits: number[] = [];
  for (const byte of interleaved) {
    for (let i = 7; i >= 0; i -= 1) bits.push((byte >> i) & 1);
  }
  for (let i = 0; i < REMAINDER[version - 1]!; i += 1) bits.push(0);

  const size = version * 4 + 17;
  const { modules, reserved } = blankMatrix(size);
  placeFunctionPatterns(modules, reserved, version);
  placeData(modules, reserved, bits);

  // Try every mask and keep the one the penalty rules like best.
  let best: boolean[][] | null = null;
  let bestMask = 0;
  let bestPenalty = Infinity;

  const candidates =
    forcedMask === undefined ? MASKS.map((_, i) => i) : [forcedMask];
  for (const mask of candidates) {
    const candidate = modules.map((row, r) =>
      row.map((value, c) => (value ?? false) !== (!reserved[r]![c] && MASKS[mask]!(r, c))),
    );
    placeFormatInfo(candidate, ecLevel, mask);
    placeVersionInfo(candidate, version);

    const penalty = maskPenalty(candidate);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
      best = candidate;
    }
  }

  return ok({
    version,
    ecLevel,
    size,
    modules: best!,
    mask: bestMask,
    bytes: data.length,
  });
}

export interface QrSvgOptions {
  /** Blank margin in modules; the standard asks for four. */
  quietZone?: number;
  /** Pixels per module in the rendered size. */
  scale?: number;
  dark?: string;
  light?: string;
}

export function qrToSvg(code: QrCode, options: QrSvgOptions = {}): string {
  const { quietZone = 4, scale = 8, dark = "#000000", light = "#ffffff" } = options;
  const span = code.size + quietZone * 2;
  const pixels = span * scale;

  // One path for every dark module keeps the file small and crisp at any size.
  const parts: string[] = [];
  for (let row = 0; row < code.size; row += 1) {
    for (let column = 0; column < code.size; column += 1) {
      if (code.modules[row]![column]) {
        parts.push(`M${column + quietZone} ${row + quietZone}h1v1h-1z`);
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}" ` +
    `width="${pixels}" height="${pixels}" shape-rendering="crispEdges">\n` +
    `  <rect width="${span}" height="${span}" fill="${light}"/>\n` +
    `  <path fill="${dark}" d="${parts.join("")}"/>\n</svg>`
  );
}
