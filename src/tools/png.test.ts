import { describe, expect, it } from "vitest";
import { encodePng, toBase64 } from "./png";

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** Walks the chunk list, which also proves every length and name is sane. */
const chunksOf = (png: Uint8Array): Array<{ type: string; data: Uint8Array }> => {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: Array<{ type: string; data: Uint8Array }> = [];
  let at = 8;
  while (at < png.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    chunks.push({ type, data: png.subarray(at + 8, at + 8 + length) });
    at += length + 12;
  }
  return chunks;
};

const inflate = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const stream = new DecompressionStream("deflate");
  const writer = stream.writable.getWriter();
  const chunk = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  chunk.set(bytes);
  const written = writer.write(chunk).then(() => writer.close());
  const out = new Uint8Array(await new Response(stream.readable).arrayBuffer());
  await written;
  return out;
};

const solid = (width: number, height: number, colour: [number, number, number]): Uint8Array => {
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i += 1) rgb.set(colour, i * 3);
  return rgb;
};

describe("encodePng", () => {
  it("starts with the PNG signature", async () => {
    const png = await encodePng(solid(2, 2, [0, 0, 0]), 2, 2);
    expect([...png.subarray(0, 8)]).toEqual(SIGNATURE);
  });

  it("writes the chunks a decoder expects, in order", async () => {
    const chunks = chunksOf(await encodePng(solid(4, 3, [1, 2, 3]), 4, 3));
    expect(chunks.map((chunk) => chunk.type)).toEqual(["IHDR", "IDAT", "IEND"]);
  });

  it("records the size and format in the header", async () => {
    const [header] = chunksOf(await encodePng(solid(7, 5, [0, 0, 0]), 7, 5));
    const view = new DataView(header!.data.buffer, header!.data.byteOffset);
    expect(view.getUint32(0)).toBe(7);
    expect(view.getUint32(4)).toBe(5);
    expect(header!.data[8]).toBe(8); // eight bits per channel
    expect(header!.data[9]).toBe(2); // truecolour
  });

  it("round-trips the pixels through its own compression", async () => {
    const width = 5;
    const height = 4;
    const rgb = new Uint8Array(width * height * 3);
    for (let i = 0; i < rgb.length; i += 1) rgb[i] = (i * 7) % 256;

    const idat = chunksOf(await encodePng(rgb, width, height)).find((c) => c.type === "IDAT")!;
    const raw = await inflate(idat.data);

    // Each scanline carries a leading filter byte, which must be 0 here.
    expect(raw.length).toBe(height * (width * 3 + 1));
    for (let row = 0; row < height; row += 1) {
      expect(raw[row * (width * 3 + 1)]).toBe(0);
      const line = raw.subarray(row * (width * 3 + 1) + 1, (row + 1) * (width * 3 + 1));
      expect([...line]).toEqual([...rgb.subarray(row * width * 3, (row + 1) * width * 3)]);
    }
  });

  it("refuses a buffer that is not the size it claims", async () => {
    await expect(encodePng(new Uint8Array(10), 4, 4)).rejects.toThrow(/48 bytes/);
  });
});

describe("toBase64", () => {
  it("encodes bytes the way a data URI needs", () => {
    expect(toBase64(new Uint8Array([72, 101, 108, 108, 111]))).toBe("SGVsbG8=");
  });

  it("handles a buffer larger than one chunk", () => {
    const big = new Uint8Array(100_000).fill(65);
    expect(toBase64(big).length).toBe(Math.ceil(big.length / 3) * 4);
  });
});
