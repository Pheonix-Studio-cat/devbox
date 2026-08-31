import { describe, expect, it } from "vitest";
import { buildPalette, quantize, type Pixels } from "./quantize";
import { embedAsSvg, vectorize } from "./vectorize";

/** Builds pixels from an ASCII picture with a colour key. */
const image = (rows: string[], key: Record<string, [number, number, number, number]>): Pixels => {
  const width = rows[0]!.length;
  const height = rows.length;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) => {
    [...row].forEach((char, x) => {
      const colour = key[char];
      if (!colour) throw new Error(`no colour for "${char}"`);
      data.set(colour, (y * width + x) * 4);
    });
  });
  return { width, height, data };
};

const RED: [number, number, number, number] = [255, 0, 0, 255];
const BLUE: [number, number, number, number] = [0, 0, 255, 255];
const WHITE: [number, number, number, number] = [255, 255, 255, 255];
const CLEAR: [number, number, number, number] = [0, 0, 0, 0];

describe("buildPalette", () => {
  it("finds the exact colours of a flat image", () => {
    const pixels = image(["rb", "rb"], { r: RED, b: BLUE });
    // Swatch order follows the split, so compare as a set.
    expect(buildPalette(pixels, 2)).toEqual(
      expect.arrayContaining([
        { r: 255, g: 0, b: 0 },
        { r: 0, g: 0, b: 255 },
      ]),
    );
  });

  it("returns fewer swatches than asked when the image holds fewer colours", () => {
    const pixels = image(["rr", "rr"], { r: RED });
    expect(buildPalette(pixels, 8)).toHaveLength(1);
  });

  it("ignores transparent pixels", () => {
    const pixels = image([".r", "r."], { r: RED, ".": CLEAR });
    expect(buildPalette(pixels, 4)).toEqual([{ r: 255, g: 0, b: 0 }]);
  });

  it("returns nothing for a fully transparent image", () => {
    expect(buildPalette(image(["..", ".."], { ".": CLEAR }), 4)).toEqual([]);
  });
});

describe("quantize", () => {
  it("maps every opaque pixel to a swatch and marks transparency", () => {
    const { indices, palette } = quantize(image(["r.", "bb"], { r: RED, b: BLUE, ".": CLEAR }), 2);
    expect(palette).toHaveLength(2);
    expect(indices[1]).toBe(-1);
    expect(indices[0]).not.toBe(indices[2]);
    expect(indices[2]).toBe(indices[3]);
  });

  it("sends near-identical colours to the same swatch", () => {
    const almost: [number, number, number, number] = [254, 1, 1, 255];
    // Three distinct colours, two swatches: the two reds have to share one.
    const { indices } = quantize(image(["rab"], { r: RED, a: almost, b: BLUE }), 2);
    expect(indices[0]).toBe(indices[1]);
    expect(indices[2]).not.toBe(indices[0]);
  });

  it("keeps a rare colour instead of averaging it away", () => {
    // One red pixel among white ones. Splitting at the median pixel would put
    // the red in a box with eleven whites and average them into pink.
    const speck = image(
      ["wwwww", "wwwww", "wwrww", "wwwww", "wwwww"],
      { w: WHITE, r: RED },
    );
    expect(buildPalette(speck, 2)).toEqual(
      expect.arrayContaining([{ r: 255, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }]),
    );
  });
});

describe("vectorize", () => {
  const flag = image(
    ["rrrr", "rrrr", "bbbb", "bbbb"],
    { r: RED, b: BLUE },
  );

  it("produces a valid SVG document sized to the image", () => {
    const { svg } = vectorize(flag, { colours: 2 });
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 4 4"');
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("emits the image's actual colours", () => {
    const { svg } = vectorize(flag, { colours: 2 });
    expect(svg).toContain("#ff0000");
    expect(svg).toContain("#0000ff");
  });

  it("lays the largest colour down as a background rectangle", () => {
    const mostlyWhite = image(
      ["wwww", "wrrw", "wrrw", "wwww"],
      { w: WHITE, r: RED },
    );
    const { svg } = vectorize(mostlyWhite, { colours: 2 });
    expect(svg).toContain('<rect width="4" height="4" fill="#ffffff"/>');
    expect(svg.match(/<path/g)).toHaveLength(1);
  });

  it("skips the background rectangle when the image has transparency", () => {
    const withHole = image([".r", "r."], { r: RED, ".": CLEAR });
    const { svg } = vectorize(withHole, { colours: 2, minArea: 0 });
    expect(svg).not.toContain("<rect");
  });

  it("uses the even-odd rule so holes stay open", () => {
    const ring = image(
      ["rrrrr", "rwwwr", "rwwwr", "rwwwr", "rrrrr"],
      { r: RED, w: WHITE },
    );
    const { svg } = vectorize(ring, { colours: 2, tolerance: 0 });
    expect(svg).toContain('fill-rule="evenodd"');
  });

  it("drops specks below the minimum area", () => {
    const speckled = image(
      ["wwwww", "wwwww", "wwrww", "wwwww", "wwwww"],
      { w: WHITE, r: RED },
    );
    expect(vectorize(speckled, { colours: 2, tolerance: 0, minArea: 4 }).shapes).toBe(0);
    expect(vectorize(speckled, { colours: 2, tolerance: 0, minArea: 1 }).shapes).toBe(1);
  });

  it("counts the shapes it emitted", () => {
    const dots = image(
      ["rwwwr", "wwwww", "wwwww", "wwwww", "rwwwr"],
      { r: RED, w: WHITE },
    );
    expect(vectorize(dots, { colours: 2, tolerance: 0, minArea: 1 }).shapes).toBe(4);
  });

  it("lets simplification erase pixel-sized specks", () => {
    // A one-pixel square has no detail left once its corners are within
    // tolerance of the diagonal, so smoothing away tiny noise is expected.
    const dot = image(["www", "wrw", "www"], { w: WHITE, r: RED });
    expect(vectorize(dot, { colours: 2, tolerance: 0, minArea: 1 }).shapes).toBe(1);
    expect(vectorize(dot, { colours: 2, tolerance: 1, minArea: 1 }).shapes).toBe(0);
  });

  it("produces smaller output at a higher tolerance", () => {
    const staircase = image(
      ["rwwww", "rrwww", "rrrww", "rrrrw", "rrrrr"],
      { r: RED, w: WHITE },
    );
    const detailed = vectorize(staircase, { colours: 2, tolerance: 0, smooth: false });
    const coarse = vectorize(staircase, { colours: 2, tolerance: 3, smooth: false });
    expect(coarse.bytes).toBeLessThan(detailed.bytes);
  });

  it("emits curves when smoothing is on and lines when it is off", () => {
    expect(vectorize(flag, { colours: 2, smooth: true }).svg).toContain("Q");
    expect(vectorize(flag, { colours: 2, smooth: false }).svg).not.toContain("Q");
  });

  it("returns an empty drawing for a fully transparent image", () => {
    const result = vectorize(image(["..", ".."], { ".": CLEAR }), { colours: 4 });
    expect(result.shapes).toBe(0);
    expect(result.svg).not.toContain("<path");
  });

  it("reports its own byte size", () => {
    const result = vectorize(flag, { colours: 2 });
    expect(result.bytes).toBe(new TextEncoder().encode(result.svg).length);
  });
});

describe("embedAsSvg", () => {
  it("wraps a data URI at the image's size", () => {
    const svg = embedAsSvg("data:image/png;base64,AAAA", 320, 200);
    expect(svg).toContain('href="data:image/png;base64,AAAA"');
    expect(svg).toContain('viewBox="0 0 320 200"');
  });
});
