import { describe, expect, it } from "vitest";
import { describeChange, fitWithin, formatBytes } from "./image";

describe("fitWithin", () => {
  it("leaves a size that already fits untouched", () => {
    expect(fitWithin({ width: 800, height: 600 }, 1000)).toEqual({
      width: 800,
      height: 600,
      scaled: false,
    });
  });

  it("scales the longest edge down and keeps the proportions", () => {
    expect(fitWithin({ width: 4000, height: 3000 }, 1000)).toEqual({
      width: 1000,
      height: 750,
      scaled: true,
    });
  });

  it("works on portrait images too", () => {
    expect(fitWithin({ width: 3000, height: 4000 }, 1000)).toMatchObject({
      width: 750,
      height: 1000,
    });
  });

  it("never scales an edge below one pixel", () => {
    expect(fitWithin({ width: 1000, height: 2 }, 10).height).toBe(1);
  });

  it("treats a limit of zero as no limit", () => {
    expect(fitWithin({ width: 50, height: 50 }, 0).scaled).toBe(false);
  });
});

describe("formatBytes", () => {
  it("uses whole bytes below a kilobyte", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
  });

  it("steps up through the units", () => {
    expect(formatBytes(1000)).toBe("1.00 kB");
    expect(formatBytes(25_400)).toBe("25.4 kB");
    expect(formatBytes(2_500_000)).toBe("2.50 MB");
  });

  it("returns a dash for nonsense", () => {
    expect(formatBytes(Number.NaN)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
  });
});

describe("describeChange", () => {
  it("names the direction of a size change", () => {
    expect(describeChange(1000, 380)).toBe("62% smaller");
    expect(describeChange(1000, 1500)).toBe("50% larger");
    expect(describeChange(1000, 1000)).toBe("same size");
  });

  it("returns a dash when there is nothing to compare", () => {
    expect(describeChange(0, 100)).toBe("—");
  });
});
