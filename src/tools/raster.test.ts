import { describe, expect, it } from "vitest";
import { flattenPath, parseFragment, rasteriseIcon } from "./raster";
import { ICONS } from "./icons";

/** Coverage at a point in a size×size mask, in 24-grid coordinates. */
const at = (mask: Float32Array, size: number, x: number, y: number): number => {
  const column = Math.min(size - 1, Math.floor((x / 24) * size));
  const row = Math.min(size - 1, Math.floor((y / 24) * size));
  return mask[row * size + column]!;
};

describe("flattenPath", () => {
  it("turns a closed triangle into a ring that returns to its start", () => {
    const [ring] = flattenPath("M0 0L10 0L10 10Z");
    expect(ring![0]).toEqual({ x: 0, y: 0 });
    expect(ring![ring!.length - 1]).toEqual({ x: 0, y: 0 });
  });

  it("reads relative commands against the cursor", () => {
    const [ring] = flattenPath("M5 5l5 0l0 5");
    expect(ring).toEqual([{ x: 5, y: 5 }, { x: 10, y: 5 }, { x: 10, y: 10 }]);
  });

  it("reads horizontal and vertical shorthands", () => {
    const [ring] = flattenPath("M2 2H8V6");
    expect(ring).toEqual([{ x: 2, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 6 }]);
  });

  it("treats extra pairs after a moveto as linetos", () => {
    const [ring] = flattenPath("M0 0 5 0 5 5");
    expect(ring).toHaveLength(3);
  });

  it("samples curves into many points that end where told", () => {
    const [ring] = flattenPath("M0 0C0 10 10 10 10 0");
    expect(ring!.length).toBeGreaterThan(10);
    expect(ring![ring!.length - 1]).toEqual({ x: 10, y: 0 });
  });

  it("samples arcs and lands on the endpoint", () => {
    const [ring] = flattenPath("M0 10A10 10 0 0 1 20 10");
    const last = ring![ring!.length - 1]!;
    expect(last.x).toBeCloseTo(20, 4);
    expect(last.y).toBeCloseTo(10, 4);
  });

  it("keeps separate subpaths apart", () => {
    expect(flattenPath("M0 0L1 0M5 5L6 5")).toHaveLength(2);
  });

  it("returns nothing for empty data", () => {
    expect(flattenPath("")).toEqual([]);
  });
});

describe("parseFragment", () => {
  it("reads a filled shape as a fill", () => {
    const [shape] = parseFragment('<circle cx="12" cy="12" r="6" fill="currentColor"/>');
    expect(shape).toMatchObject({ filled: true, width: 0 });
    expect(shape!.rings[0]!.length).toBeGreaterThan(8);
  });

  it("reads a stroked shape as a stroke of the right width", () => {
    const [shape] = parseFragment('<path d="M0 0L10 10" fill="none" stroke="currentColor" stroke-width="2.5"/>');
    expect(shape).toMatchObject({ filled: false, width: 2.5 });
  });

  it("reads a shape that is both filled and stroked as two shapes", () => {
    const shapes = parseFragment('<rect x="1" y="1" width="8" height="8" fill="currentColor" stroke="currentColor" stroke-width="2"/>');
    expect(shapes.map((shape) => shape.filled)).toEqual([true, false]);
  });

  it("rounds a rectangle's corners when asked", () => {
    const [square] = parseFragment('<rect x="0" y="0" width="10" height="10" fill="currentColor"/>');
    const [rounded] = parseFragment('<rect x="0" y="0" width="10" height="10" rx="3" fill="currentColor"/>');
    expect(rounded!.rings[0]!.length).toBeGreaterThan(square!.rings[0]!.length);
  });

  it("reads every icon in the library without dropping a shape", () => {
    for (const icon of ICONS) {
      const shapes = parseFragment(icon.body);
      const elements = [...icon.body.matchAll(/<(path|circle|ellipse|rect)\b/g)].length;
      expect(shapes.length, icon.id).toBeGreaterThanOrEqual(elements);
      for (const shape of shapes) expect(shape.rings.length, icon.id).toBeGreaterThan(0);
    }
  });
});

describe("rasteriseIcon", () => {
  it("fills the inside of a shape and leaves the outside clear", () => {
    const size = 48;
    const mask = rasteriseIcon('<circle cx="12" cy="12" r="8" fill="currentColor"/>', size);
    expect(at(mask, size, 12, 12)).toBeCloseTo(1, 1);
    expect(at(mask, size, 1, 1)).toBeCloseTo(0, 1);
  });

  it("leaves the middle of a stroked outline empty", () => {
    const size = 48;
    const mask = rasteriseIcon(
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/>',
      size,
    );
    expect(at(mask, size, 12, 12)).toBeCloseTo(0, 1);
    expect(at(mask, size, 12, 4)).toBeGreaterThan(0.5);
  });

  it("softens edges rather than stair-stepping them", () => {
    const size = 64;
    const mask = rasteriseIcon('<circle cx="12" cy="12" r="8" fill="currentColor"/>', size);
    const partial = [...mask].filter((value) => value > 0.05 && value < 0.95);
    expect(partial.length).toBeGreaterThan(20);
  });

  it("puts ink somewhere for every icon in the library", () => {
    for (const icon of ICONS) {
      const mask = rasteriseIcon(icon.body, 32, 2);
      const ink = [...mask].reduce((sum, value) => sum + value, 0);
      expect(ink, icon.id).toBeGreaterThan(8);
      // An icon that filled its whole box would be a parsing failure, not art.
      expect(ink, icon.id).toBeLessThan(32 * 32 * 0.9);
    }
  });

  it("returns an empty mask for a fragment with nothing in it", () => {
    expect([...rasteriseIcon("", 8)].every((value) => value === 0)).toBe(true);
  });
});
