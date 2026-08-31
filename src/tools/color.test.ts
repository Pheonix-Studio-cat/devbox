import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  describeColor,
  rateContrast,
  formatHex,
  hslToRgb,
  parseColor,
  rgbToHsl,
  rgbToOklch,
  type Rgb,
} from "./color";

const colour = (input: string): Rgb => {
  const result = parseColor(input);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

const WHITE: Rgb = { r: 255, g: 255, b: 255, a: 1 };
const BLACK: Rgb = { r: 0, g: 0, b: 0, a: 1 };

describe("parseColor", () => {
  it("reads three, four, six and eight digit hex", () => {
    expect(colour("#f00")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(colour("#ff0000")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(colour("#f00f")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(colour("#ff000080").a).toBeCloseTo(0.502, 2);
  });

  it("reads rgb() with commas, spaces and percentages", () => {
    expect(colour("rgb(59, 130, 246)")).toEqual({ r: 59, g: 130, b: 246, a: 1 });
    expect(colour("rgb(59 130 246)")).toEqual({ r: 59, g: 130, b: 246, a: 1 });
    expect(colour("rgb(100% 0% 0%)")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it("reads hsl() and the slash alpha form", () => {
    expect(colour("hsl(0 100% 50%)")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(colour("rgb(0 0 0 / 50%)").a).toBeCloseTo(0.5, 5);
  });

  it("rejects nonsense with a readable message", () => {
    const result = parseColor("bright reddish");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/#3b82f6/i);
    expect(parseColor("#12345").ok).toBe(false);
    expect(parseColor("").ok).toBe(false);
  });
});

describe("hsl round-trip", () => {
  it.each(["#3b82f6", "#ff0000", "#808080", "#0f766e"])("survives %s", (hex) => {
    const original = colour(hex);
    const { h, s, l } = rgbToHsl(original);
    expect({ ...hslToRgb({ h, s, l }), a: 1 }).toEqual(original);
  });
});

describe("rgbToOklch", () => {
  it("puts white at lightness 1 and black at 0, both without chroma", () => {
    expect(rgbToOklch(WHITE).l).toBeCloseTo(1, 5);
    expect(rgbToOklch(WHITE).c).toBeCloseTo(0, 5);
    expect(rgbToOklch(BLACK).l).toBeCloseTo(0, 5);
  });

  it("matches the published Oklab values for pure red", () => {
    const { l, c, h } = rgbToOklch(colour("#ff0000"));
    expect(l).toBeCloseTo(0.6279, 3);
    expect(c).toBeCloseTo(0.2577, 3);
    expect(h).toBeCloseTo(29.23, 1);
  });

  it("keeps greys free of chroma", () => {
    expect(rgbToOklch(colour("#808080")).c).toBeCloseTo(0, 5);
  });
});

describe("contrastRatio", () => {
  it("puts black on white at the maximum of 21", () => {
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 5);
  });

  it("puts a colour against itself at the minimum of 1", () => {
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5);
  });

  it("does not depend on argument order", () => {
    const blue = colour("#3b82f6");
    expect(contrastRatio(blue, WHITE)).toBeCloseTo(contrastRatio(WHITE, blue), 10);
  });
});

describe("formatHex", () => {
  it("appends alpha only when the colour is translucent", () => {
    expect(formatHex({ r: 59, g: 130, b: 246, a: 1 })).toBe("#3B82F6");
    expect(formatHex({ r: 0, g: 0, b: 0, a: 0.5 })).toBe("#00000080");
  });
});

describe("describeColor", () => {
  it("renders every notation for one colour", () => {
    expect(describeColor(colour("#3b82f6"))).toMatchObject({
      hex: "#3B82F6",
      rgb: "rgb(59 130 246)",
      hsl: "hsl(217 91% 60%)",
      oklch: "oklch(62.3% 0.188 259.8)",
    });
  });

  it("rates each background on its own", () => {
    expect(describeColor(colour("#000000"))).toMatchObject({
      onWhiteRating: "AAA",
      onBlackRating: "fails",
    });
    expect(describeColor(colour("#ffffff"))).toMatchObject({
      onWhiteRating: "fails",
      onBlackRating: "AAA",
    });
  });

  it("marks a mid-tone that only carries large text", () => {
    // Around 4.58:1 is the best any colour can manage against its better
    // background, so a mid grey lands short of AA on the other one.
    const view = describeColor(colour("#949494"));
    expect(view.onWhiteRating).toBe("large text only");
    expect(view.onBlackRating).toBe("AA");
  });

  it("carries alpha into every notation", () => {
    const view = describeColor(colour("#3b82f680"));
    expect(view.rgb).toContain("/");
    expect(view.hsl).toContain("/");
  });
});

describe("rateContrast", () => {
  it("maps ratios onto the WCAG bands", () => {
    expect(rateContrast(21)).toBe("AAA");
    expect(rateContrast(7)).toBe("AAA");
    expect(rateContrast(4.5)).toBe("AA");
    expect(rateContrast(3)).toBe("large text only");
    expect(rateContrast(2.9)).toBe("fails");
  });
});
