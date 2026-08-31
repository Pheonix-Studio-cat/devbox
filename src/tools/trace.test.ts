import { describe, expect, it } from "vitest";
import { signedArea, simplifyLoop, toPathData, traceRegions, type Point } from "./trace";

/** Builds an index map from an ASCII picture: '.' is -1, digits are indices. */
const picture = (rows: string[]): { indices: Int16Array; width: number; height: number } => {
  const width = rows[0]!.length;
  const height = rows.length;
  const indices = new Int16Array(width * height);
  rows.forEach((row, y) => {
    [...row].forEach((char, x) => {
      indices[y * width + x] = char === "." ? -1 : Number(char);
    });
  });
  return { indices, width, height };
};

const trace = (rows: string[], target: number): Point[][] => {
  const { indices, width, height } = picture(rows);
  return traceRegions(indices, width, height, target);
};

describe("traceRegions", () => {
  it("walks a single pixel as a unit square", () => {
    const loops = trace([".....", ".....", "..0..", ".....", "....."], 0);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(4);
    expect(Math.abs(signedArea(loops[0]!))).toBe(1);
  });

  it("walks a rectangle as four corners", () => {
    const loops = trace(["....", ".00.", ".00.", "...."], 0);
    expect(loops).toHaveLength(1);
    expect(Math.abs(signedArea(loops[0]!))).toBe(4);
  });

  it("returns one loop per separate region", () => {
    const loops = trace(["0..0", "....", "0..0"], 0);
    expect(loops).toHaveLength(4);
  });

  it("emits a hole as its own loop, wound the other way", () => {
    const loops = trace(["00000", "0...0", "0.1.0", "0...0", "00000"], 0);
    expect(loops).toHaveLength(2);

    const areas = loops.map(signedArea).sort((a, b) => a - b);
    // Outer clockwise, hole counter-clockwise: opposite signs, so evenodd
    // fill leaves the middle empty.
    expect(Math.sign(areas[0]!)).toBe(-Math.sign(areas[1]!));
    expect(Math.abs(areas[1]!) - Math.abs(areas[0]!)).toBe(16);
  });

  it("covers the whole canvas when every pixel matches", () => {
    const loops = trace(["00", "00"], 0);
    expect(loops).toHaveLength(1);
    expect(Math.abs(signedArea(loops[0]!))).toBe(4);
  });

  it("returns nothing for a colour that is absent", () => {
    expect(trace(["00", "00"], 5)).toEqual([]);
  });

  it("refuses to trace transparency", () => {
    // -1 marks transparent pixels, which are an absence of region rather than
    // a colour to outline.
    expect(trace(["..", ".."], -1)).toEqual([]);
    expect(trace(["0.", ".0"], -1)).toEqual([]);
  });

  it("splits a diagonal touch into two loops rather than crossing", () => {
    const loops = trace(["0.", ".0"], 0);
    expect(loops).toHaveLength(2);
    for (const loop of loops) expect(Math.abs(signedArea(loop))).toBe(1);
  });

  it("keeps total area equal to the pixel count", () => {
    const rows = ["0110", "0110", "0000", "1001"];
    const area = (target: number) =>
      trace(rows, target).reduce((sum, loop) => sum + signedArea(loop), 0);
    expect(Math.abs(area(0))).toBe(10);
    expect(Math.abs(area(1))).toBe(6);
  });
});

describe("signedArea", () => {
  it("reports the shoelace area with a direction", () => {
    const clockwise: Point[] = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];
    expect(signedArea(clockwise)).toBe(4);
    expect(signedArea([...clockwise].reverse())).toBe(-4);
  });
});

describe("simplifyLoop", () => {
  it("drops points that sit on a straight edge", () => {
    const loop: Point[] = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
      { x: 2, y: 2 }, { x: 0, y: 2 },
    ];
    expect(simplifyLoop(loop, 0.5)).toHaveLength(4);
  });

  it("keeps the shape when the tolerance is zero", () => {
    const loop: Point[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    expect(simplifyLoop(loop, 0)).toEqual(loop);
  });

  it("never reduces a loop below three points", () => {
    const staircase: Point[] = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 },
      { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 0, y: 2 },
    ];
    expect(simplifyLoop(staircase, 100).length).toBeGreaterThanOrEqual(3);
  });

  it("drops a point that lies on the line between its neighbours", () => {
    // (5,5) is the midpoint of the closing edge from (10,10) back to (0,0).
    const collinear: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 5, y: 5 }];
    expect(simplifyLoop(collinear, 0.5)).toHaveLength(3);
  });

  it("keeps every genuine corner", () => {
    // Every point sits well off the line between its neighbours, so a small
    // tolerance must keep all four.
    const quad: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 2, y: 6 }];
    expect(simplifyLoop(quad, 0.5)).toHaveLength(4);
  });
});

describe("toPathData", () => {
  const square: Point[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

  it("emits straight edges as move, lines and close", () => {
    expect(toPathData([square], false)).toBe("M0 0L1 0L1 1L0 1Z");
  });

  it("emits rounded corners as quadratic curves", () => {
    const data = toPathData([square], true);
    expect(data.startsWith("M")).toBe(true);
    expect(data.endsWith("Z")).toBe(true);
    expect((data.match(/Q/g) ?? [])).toHaveLength(4);
  });

  it("concatenates several loops into one path", () => {
    expect(toPathData([square, square], false).match(/M/g)).toHaveLength(2);
  });

  it("rounds coordinates to the requested precision", () => {
    expect(toPathData([[{ x: 0.126, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]], false, 2))
      .toContain("M0.13 0");
  });
});
