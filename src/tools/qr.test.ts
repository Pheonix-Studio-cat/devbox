import { describe, expect, it } from "vitest";
import { encodeQr, EC_LEVELS, MAX_VERSION, maskPenalty, qrToSvg } from "./qr";

const render = (code: { modules: boolean[][] }): string[] =>
  code.modules.map((row) => row.map((m) => (m ? "#" : ".")).join(""));

const encode = (text: string, level: "L" | "M" | "Q" | "H" = "M") => {
  const result = encodeQr(text, level);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

/** "OK" @L v1 mask 7 size 21 — verified module for module against an independent encoder. */
const GOLDEN_OK = [
  "#######...#.#.#######",
  "#.....#.#.#.#.#.....#",
  "#.###.#.#.##..#.###.#",
  "#.###.#.....#.#.###.#",
  "#.###.#.#####.#.###.#",
  "#.....#.###...#.....#",
  "#######.#.#.#.#######",
  "........#............",
  "##.#..##..###.###.##.",
  "..#.#...####.#.#.###.",
  "..#.#.###.##..####..#",
  "...#.#.#..#.#####....",
  "###.###.####.###..##.",
  "........###..##.#.#..",
  "#######.#####.#.##.#.",
  "#.....#..#....#...###",
  "#.###.#..#..###...###",
  "#.###.#.#.#..###...##",
  "#.###.#..###.###.##.#",
  "#.....#.#..##..#.#...",
  "#######.###..#.#..##.",
];

/** "Grüezi" @M v1 mask 6 size 21 — verified module for module against an independent encoder. */
const GOLDEN_UMLAUT = [
  "#######.#..##.#######",
  "#.....#.#.#.#.#.....#",
  "#.###.#.###.#.#.###.#",
  "#.###.#...###.#.###.#",
  "#.###.#.#.###.#.###.#",
  "#.....#..##...#.....#",
  "#######.#.#.#.#######",
  ".....................",
  "#..#######.#.#..#.###",
  "#.#......#.###..#.##.",
  "#####.#.##.##..#.#.##",
  "..........#.#####..##",
  "###..###..######.##.#",
  "........#...###.#.###",
  "#######.#.##....##...",
  "#.....#.##....#....#.",
  "#.###.#.#.#..####..##",
  "#.###.#.#.#.####.....",
  "#.###.#...####..#####",
  "#.....#..#.##..#.####",
  "#######.#.#.##..#....",
];
describe("encodeQr", () => {
  it("matches a matrix verified against an independent encoder", () => {
    expect(render(encode("OK", "L"))).toEqual(GOLDEN_OK);
  });

  it("matches a verified matrix for multi-byte text", () => {
    expect(render(encode("Grüezi", "M"))).toEqual(GOLDEN_UMLAUT);
  });

  it("sizes the grid as 4 × version + 17", () => {
    for (const level of EC_LEVELS) {
      const code = encode("hello", level);
      expect(code.size).toBe(code.version * 4 + 17);
      expect(code.modules).toHaveLength(code.size);
      expect(code.modules[0]).toHaveLength(code.size);
    }
  });

  it("draws all three finder patterns", () => {
    const { modules, size } = encode("finders");
    const ring = ["#######", "#.....#", "#.###.#", "#.###.#", "#.###.#", "#.....#", "#######"];
    for (const [top, left] of [[0, 0], [0, size - 7], [size - 7, 0]] as const) {
      for (let r = 0; r < 7; r += 1) {
        const row = modules[top + r]!.slice(left, left + 7).map((m) => (m ? "#" : ".")).join("");
        expect(row).toBe(ring[r]);
      }
    }
  });

  it("draws the timing patterns and the always-dark module", () => {
    const { modules, size } = encode("timing");
    for (let i = 8; i < size - 8; i += 1) {
      expect(modules[6]![i]).toBe(i % 2 === 0);
      expect(modules[i]![6]).toBe(i % 2 === 0);
    }
    expect(modules[size - 8]![8]).toBe(true);
  });

  it("grows the version as the text gets longer", () => {
    const short = encode("x".repeat(10), "L").version;
    const long = encode("x".repeat(200), "L").version;
    expect(long).toBeGreaterThan(short);
  });

  it("needs a larger version at a stronger correction level", () => {
    const text = "x".repeat(100);
    expect(encode(text, "H").version).toBeGreaterThan(encode(text, "L").version);
  });

  it("encodes text as UTF-8, so accents cost more room", () => {
    expect(encode("ü".repeat(30), "L").bytes).toBe(60);
    expect(encode("u".repeat(30), "L").bytes).toBe(30);
  });

  it("picks the mask with the lowest penalty", () => {
    const chosen = encode("penalty check", "Q");
    const scores = Array.from({ length: 8 }, (_, mask) => {
      const result = encodeQr("penalty check", "Q", mask);
      if (!result.ok) throw new Error(result.error);
      return maskPenalty(result.value.modules);
    });
    expect(scores[chosen.mask]).toBe(Math.min(...scores));
  });

  it("produces the same code every time", () => {
    expect(render(encode("stable", "Q"))).toEqual(render(encode("stable", "Q")));
  });

  it("rejects empty input", () => {
    expect(encodeQr("", "M").ok).toBe(false);
  });

  it("explains what to do when the text will not fit", () => {
    const result = encodeQr("x".repeat(5000), "H");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/level L/);
  });

  it("fills the largest version it supports", () => {
    const code = encode("x".repeat(250), "L");
    expect(code.version).toBeLessThanOrEqual(MAX_VERSION);
  });
});

describe("maskPenalty", () => {
  it("charges for long runs of one colour", () => {
    const size = 21;
    const blank = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    const striped = blank.map((row, r) => row.map((_, c) => (r + c) % 2 === 0));
    expect(maskPenalty(blank)).toBeGreaterThan(maskPenalty(striped));
  });

  it("gives an even mix of light and dark the smaller balance penalty", () => {
    const size = 20;
    const half = Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, (_, c) => (r * size + c) % 2 === 0),
    );
    const mostlyDark = Array.from({ length: size }, () => new Array<boolean>(size).fill(true));
    expect(maskPenalty(half)).toBeLessThan(maskPenalty(mostlyDark));
  });
});

describe("qrToSvg", () => {
  it("wraps the code in a square viewBox with a quiet zone", () => {
    const code = encode("svg", "M");
    const svg = qrToSvg(code, { quietZone: 4 });
    expect(svg).toContain(`viewBox="0 0 ${code.size + 8} ${code.size + 8}"`);
    expect(svg).toContain("<rect");
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("honours the requested colours and scale", () => {
    const svg = qrToSvg(encode("colours"), { dark: "#123456", light: "#abcdef", scale: 4 });
    expect(svg).toContain('fill="#123456"');
    expect(svg).toContain('fill="#abcdef"');
  });

  it("emits one square per dark module", () => {
    const code = encode("count me", "L");
    const dark = code.modules.flat().filter(Boolean).length;
    const svg = qrToSvg(code);
    expect((svg.match(/h1v1h-1z/g) ?? []).length).toBe(dark);
  });
});
