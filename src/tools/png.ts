/**
 * A minimal PNG writer.
 *
 * The MCP server runs on a Worker, where there is no canvas and no image
 * library, but a model's chat window will only display an image it is handed
 * as PNG, JPEG, GIF or WebP — an SVG string is text. PNG is the only one of
 * those a few dozen lines can produce honestly: deflate comes from the
 * platform's CompressionStream, and the rest is headers and a checksum.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length + 12);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(data.length + 8, crc32(out.subarray(4, data.length + 8)));
  return out;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  // "deflate" is the zlib-wrapped form, which is what a PNG's IDAT holds.
  const stream = new CompressionStream("deflate");
  const writer = stream.writable.getWriter();
  // Writing and reading run together: awaiting the write first would deadlock
  // on backpressure once the data is larger than the stream's buffer.
  // A copy backed by a plain ArrayBuffer: the stream will not accept a view
  // that might sit on shared memory.
  const chunk = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  chunk.set(bytes);
  const written = writer.write(chunk).then(() => writer.close());
  const compressed = new Uint8Array(await new Response(stream.readable).arrayBuffer());
  await written;
  return compressed;
}

/** Writes 8-bit RGB pixels as a PNG. */
export async function encodePng(
  rgb: Uint8Array,
  width: number,
  height: number,
): Promise<Uint8Array> {
  if (rgb.length !== width * height * 3) {
    throw new Error(`Expected ${width * height * 3} bytes of RGB, got ${rgb.length}`);
  }

  // Every scanline is prefixed with its filter type; 0 means "stored as is".
  const raw = new Uint8Array(height * (width * 3 + 1));
  for (let row = 0; row < height; row += 1) {
    const from = row * width * 3;
    raw[row * (width * 3 + 1)] = 0;
    raw.set(rgb.subarray(from, from + width * 3), row * (width * 3 + 1) + 1);
  }

  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [
    signature,
    chunk("IHDR", header),
    chunk("IDAT", await deflate(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
