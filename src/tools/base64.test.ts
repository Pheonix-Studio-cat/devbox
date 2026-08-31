import { describe, expect, it } from "vitest";
import { decodeBase64, decodeBase64ToHex, encodeBase64 } from "./base64";

describe("base64 round-trip", () => {
  it.each([
    "hello world",
    "Grüezi mitenand",
    "emoji: 🧰",
    "line\nbreak\ttab",
    "",
  ])("survives %j", (text) => {
    const encoded = encodeBase64(text);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    if (text === "") {
      expect(encoded.value).toBe("");
      return;
    }
    const decoded = decodeBase64(encoded.value);
    expect(decoded.ok && decoded.value).toBe(text);
  });
});

describe("encodeBase64", () => {
  it("encodes UTF-8 multi-byte characters correctly", () => {
    const result = encodeBase64("ü");
    expect(result.ok && result.value).toBe("w7w=");
  });

  it("uses the URL-safe alphabet and drops padding when asked", () => {
    const standard = encodeBase64("ÿþý");
    const urlSafe = encodeBase64("ÿþý", true);
    expect(standard.ok && standard.value).toMatch(/[+/=]/);
    expect(urlSafe.ok && urlSafe.value).not.toMatch(/[+/=]/);
  });

  it("handles inputs larger than one chunk", () => {
    const big = "a".repeat(100_000);
    const encoded = encodeBase64(big);
    expect(encoded.ok).toBe(true);
    expect(encoded.ok && decodeBase64(encoded.value)).toMatchObject({ value: big });
  });
});

describe("decodeBase64", () => {
  it("accepts URL-safe input without padding", () => {
    const result = decodeBase64("SGVsbG8gd29ybGQ");
    expect(result.ok && result.value).toBe("Hello world");
  });

  it("ignores surrounding whitespace and newlines", () => {
    const result = decodeBase64(" SGVs\nbG8= ");
    expect(result.ok && result.value).toBe("Hello");
  });

  it("rejects characters outside the alphabet", () => {
    const result = decodeBase64("not base64!!");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/alphabet/i);
  });

  it("explains when the bytes are not UTF-8 text", () => {
    const result = decodeBase64("//4=");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/UTF-8/);
  });

  it("rejects empty input", () => {
    expect(decodeBase64("").ok).toBe(false);
  });
});

describe("decodeBase64ToHex", () => {
  it("renders raw bytes for non-text payloads", () => {
    const result = decodeBase64ToHex("//4=");
    expect(result.ok && result.value).toBe("ff fe");
  });
});
