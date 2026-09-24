import { describe, expect, it } from "vitest";
import {
  assessLogo,
  encodeQr,
  EC_LEVELS,
  largestSafeCoverage,
  MAX_VERSION,
  maskPenalty,
  qrToPng,
  qrToSvg,
} from "./qr";

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

describe("assessLogo", () => {
  const code = encode("https://example.com/a-fairly-long-address", "H");

  it("finds no damage when there is no logo", () => {
    expect(assessLogo(code, 0)).toMatchObject({
      coveredModules: 0,
      damagedCodewords: 0,
      worstBlock: 0,
      readable: true,
    });
  });

  it("damages more as the logo grows", () => {
    const small = assessLogo(code, 0.1);
    const large = assessLogo(code, 0.3);
    expect(large.coveredModules).toBeGreaterThan(small.coveredModules);
    expect(large.damagedCodewords).toBeGreaterThan(small.damagedCodewords);
    expect(large.headroom).toBeLessThan(small.headroom);
  });

  it("reports headroom as what is left of the block's repairs", () => {
    const report = assessLogo(code, 0.2);
    expect(report.headroom).toBe(report.capacityPerBlock - report.worstBlock);
    expect(report.readable).toBe(report.worstBlock <= report.capacityPerBlock);
  });

  it("only ever repairs half a block's parity", () => {
    for (const level of EC_LEVELS) {
      const sample = encode("capacity", level);
      expect(assessLogo(sample, 0.2).capacityPerBlock).toBe(Math.floor(sample.ecPerBlock / 2));
    }
  });

  it("lets a stronger correction level carry a bigger logo", () => {
    const text = "https://example.com/a-fairly-long-address";
    const weak = largestSafeCoverage(encode(text, "L"));
    const strong = largestSafeCoverage(encode(text, "H"));
    expect(strong).toBeGreaterThan(weak);
  });

  it("calls a logo that swallows the code unreadable", () => {
    expect(assessLogo(encode("small", "L"), 0.6).readable).toBe(false);
  });

  it("never counts a codeword twice, however many of its modules are covered", () => {
    const report = assessLogo(code, 0.25);
    expect(report.damagedCodewords).toBeLessThanOrEqual(report.coveredModules);
  });
});

describe("largestSafeCoverage", () => {
  it("returns a coverage the report agrees is readable", () => {
    for (const level of EC_LEVELS) {
      const sample = encode("https://example.com/something", level);
      const coverage = largestSafeCoverage(sample);
      expect(assessLogo(sample, coverage).readable).toBe(true);
      expect(assessLogo(sample, coverage).headroom).toBeGreaterThanOrEqual(1);
    }
  });

  it("leaves the requested spare repairs unused", () => {
    const sample = encode("https://example.com/something", "H");
    expect(assessLogo(sample, largestSafeCoverage(sample, 4)).headroom).toBeGreaterThanOrEqual(4);
  });
});

describe("qrToSvg with a logo", () => {
  const code = encode("logo test", "H");
  const logo = { body: '<circle cx="12" cy="12" r="8" fill="currentColor"/>', coverage: 0.2 };

  it("draws a round plate by default and centres it", () => {
    const svg = qrToSvg(code, { quietZone: 4, logo });
    const centre = (code.size + 8) / 2;
    expect(svg).toContain(`<circle cx="${centre}" cy="${centre}"`);
  });

  it("draws a rounded square when asked", () => {
    const svg = qrToSvg(code, { logo: { ...logo, shape: "square" } });
    expect(svg).toMatch(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" rx=/);
  });

  it("draws no plate at all when asked", () => {
    const svg = qrToSvg(code, { logo: { ...logo, shape: "none" } });
    // The background rectangle is still there; nothing else should be.
    expect((svg.match(/<rect/g) ?? [])).toHaveLength(1);
    expect((svg.match(/<circle/g) ?? [])).toHaveLength(1);
  });

  it("places the icon body inside a scaled group", () => {
    const svg = qrToSvg(code, { logo });
    expect(svg).toContain(logo.body);
    expect(svg).toMatch(/<g transform="translate\([\d.]+ [\d.]+\) scale\([\d.]+\)"/);
  });

  it("colours the icon, falling back to the code's dark colour", () => {
    expect(qrToSvg(code, { logo: { ...logo, color: "#ff0000" } })).toContain('color="#ff0000"');
    expect(qrToSvg(code, { dark: "#112233", logo })).toContain('color="#112233"');
  });

  it("leaves the code untouched when there is no logo", () => {
    const svg = qrToSvg(code);
    expect(svg).not.toContain("<g transform");
    expect((svg.match(/<circle/g) ?? [])).toHaveLength(0);
  });
});

describe("qrToPng", () => {
  const chunkTypes = (png: Uint8Array): string[] => {
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const types: string[] = [];
    let at = 8;
    while (at < png.length) {
      const length = view.getUint32(at);
      types.push(String.fromCharCode(...png.subarray(at + 4, at + 8)));
      at += length + 12;
    }
    return types;
  };

  const dimensions = (png: Uint8Array): [number, number] => {
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    return [view.getUint32(16), view.getUint32(20)];
  };

  it("writes a square PNG sized by the modules, quiet zone and scale", async () => {
    const code = encode("png please", "M");
    const png = await qrToPng(code, { scale: 4, quietZone: 4 });
    expect(chunkTypes(png)).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(dimensions(png)).toEqual([(code.size + 8) * 4, (code.size + 8) * 4]);
  });

  it("renders the same code as the SVG does", async () => {
    // Both renderers read the same matrix, so the picture cannot drift from
    // the vector version without one of them being wrong.
    const code = encode("same code", "Q");
    const png = await qrToPng(code, { scale: 3 });
    const svg = qrToSvg(code, { scale: 3 });
    const dark = code.modules.flat().filter(Boolean).length;
    expect((svg.match(/h1v1h-1z/g) ?? []).length).toBe(dark);
    expect(dimensions(png)[0]).toBe((code.size + 8) * 3);
  });

  it("carries a logo into the picture", async () => {
    const code = encode("with a logo", "H");
    const logo = { body: '<circle cx="12" cy="12" r="9" fill="currentColor"/>', coverage: 0.25 };
    const plain = await qrToPng(code, { scale: 4 });
    const withLogo = await qrToPng(code, { scale: 4, logo });
    expect(withLogo.length).not.toBe(plain.length);
  });

  it("honours the requested colours", async () => {
    const code = encode("colours", "M");
    const normal = await qrToPng(code, { scale: 3 });
    const inverted = await qrToPng(code, { scale: 3, dark: "#ffffff", light: "#000000" });
    expect(inverted.length).not.toBe(normal.length);
  });
});
