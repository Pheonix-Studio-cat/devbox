export interface Pixels {
  width: number;
  height: number;
  /** RGBA, four bytes per pixel — the shape of a canvas ImageData. */
  data: Uint8ClampedArray;
}

export interface Swatch {
  r: number;
  g: number;
  b: number;
}

export interface Quantized {
  palette: Swatch[];
  /** One palette index per pixel, or -1 where the pixel is transparent. */
  indices: Int16Array;
  width: number;
  height: number;
}

interface Box {
  offsets: number[];
  min: Swatch;
  max: Swatch;
}

const CHANNELS = ["r", "g", "b"] as const;

function bounds(data: Uint8ClampedArray, offsets: number[]): { min: Swatch; max: Swatch } {
  const min: Swatch = { r: 255, g: 255, b: 255 };
  const max: Swatch = { r: 0, g: 0, b: 0 };
  for (const offset of offsets) {
    for (let channel = 0; channel < 3; channel += 1) {
      const value = data[offset + channel]!;
      const key = CHANNELS[channel]!;
      if (value < min[key]) min[key] = value;
      if (value > max[key]) max[key] = value;
    }
  }
  return { min, max };
}

/** The channel a box spans most widely — the one worth splitting on. */
function widestChannel(box: Box): 0 | 1 | 2 {
  const spans = [box.max.r - box.min.r, box.max.g - box.min.g, box.max.b - box.min.b];
  const widest = Math.max(...spans);
  return spans.indexOf(widest) as 0 | 1 | 2;
}

function averageOf(data: Uint8ClampedArray, offsets: number[]): Swatch {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const offset of offsets) {
    r += data[offset]!;
    g += data[offset + 1]!;
    b += data[offset + 2]!;
  }
  const count = Math.max(1, offsets.length);
  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count),
  };
}

/**
 * Median cut: repeatedly split the box with the widest colour spread at its
 * median, then average each final box. Deterministic, and it keeps small but
 * distinct colours alive better than a plain histogram would.
 */
export function buildPalette(pixels: Pixels, colours: number): Swatch[] {
  const { data } = pixels;
  const opaque: number[] = [];
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3]! >= 128) opaque.push(offset);
  }
  if (opaque.length === 0) return [];

  const wanted = Math.max(2, Math.min(64, Math.trunc(colours)));
  let boxes: Box[] = [{ offsets: opaque, ...bounds(data, opaque) }];

  while (boxes.length < wanted) {
    // Split the box that spans the most colour; once none can be split, the
    // image simply holds fewer distinct colours than requested.
    let target = -1;
    let widestSpan = 0;
    boxes.forEach((box, index) => {
      if (box.offsets.length < 2) return;
      const channel = widestChannel(box);
      const span = [box.max.r - box.min.r, box.max.g - box.min.g, box.max.b - box.min.b][channel]!;
      if (span > widestSpan) {
        widestSpan = span;
        target = index;
      }
    });
    if (target === -1 || widestSpan === 0) break;

    const box = boxes[target]!;
    const channel = widestChannel(box);
    const sorted = [...box.offsets].sort((a, b) => data[a + channel]! - data[b + channel]!);

    // Split where the colours actually part, not at the middle pixel. Cutting
    // at the median pixel drags a rare colour into the dominant cluster — one
    // red pixel among white ones averages out to pink and the red is lost.
    let total = 0;
    for (const offset of sorted) total += data[offset + channel]!;
    const mean = total / sorted.length;
    let cut = sorted.findIndex((offset) => data[offset + channel]! >= mean);
    if (cut <= 0 || cut >= sorted.length) cut = sorted.length >> 1;

    const left = sorted.slice(0, cut);
    const right = sorted.slice(cut);
    if (left.length === 0 || right.length === 0) break;

    boxes = [
      ...boxes.slice(0, target),
      { offsets: left, ...bounds(data, left) },
      { offsets: right, ...bounds(data, right) },
      ...boxes.slice(target + 1),
    ];
  }

  return boxes.map((box) => averageOf(data, box.offsets));
}

const distanceTo = (data: Uint8ClampedArray, offset: number, swatch: Swatch): number => {
  const dr = data[offset]! - swatch.r;
  const dg = data[offset + 1]! - swatch.g;
  const db = data[offset + 2]! - swatch.b;
  return dr * dr + dg * dg + db * db;
};

/** Reduces an image to `colours` swatches and records which one each pixel took. */
export function quantize(pixels: Pixels, colours: number): Quantized {
  const palette = buildPalette(pixels, colours);
  const { data, width, height } = pixels;
  const indices = new Int16Array(width * height).fill(-1);

  if (palette.length === 0) return { palette, indices, width, height };

  const cache = new Map<number, number>();
  for (let pixel = 0; pixel < indices.length; pixel += 1) {
    const offset = pixel * 4;
    if (data[offset + 3]! < 128) continue;

    // Colours repeat heavily in real images, so remembering the nearest swatch
    // per exact colour saves most of the palette scans.
    const key = (data[offset]! << 16) | (data[offset + 1]! << 8) | data[offset + 2]!;
    const cached = cache.get(key);
    if (cached !== undefined) {
      indices[pixel] = cached;
      continue;
    }

    let best = 0;
    let bestDistance = Infinity;
    for (let index = 0; index < palette.length; index += 1) {
      const distance = distanceTo(data, offset, palette[index]!);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    cache.set(key, best);
    indices[pixel] = best;
  }

  return { palette, indices, width, height };
}
