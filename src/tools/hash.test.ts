import { describe, expect, it } from "vitest";
import { HASH_ALGORITHMS, hashAll, hashText } from "./hash";

describe("hashText", () => {
  it("matches the published SHA-256 digest of 'abc'", async () => {
    const result = await hashText("abc", "SHA-256");
    expect(result.ok && result.value).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("matches the published SHA-1 digest of 'abc'", async () => {
    const result = await hashText("abc", "SHA-1");
    expect(result.ok && result.value).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
  });

  it("hashes the empty string", async () => {
    const result = await hashText("", "SHA-256");
    expect(result.ok && result.value).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("hashes UTF-8 bytes, so accents change the digest", async () => {
    const plain = await hashText("uber", "SHA-256");
    const accented = await hashText("über", "SHA-256");
    expect(plain.ok && accented.ok && plain.value).not.toBe(accented.ok && accented.value);
  });

  it("produces the documented digest length per algorithm", async () => {
    const lengths: Record<string, number> = {
      "SHA-1": 40,
      "SHA-256": 64,
      "SHA-384": 96,
      "SHA-512": 128,
    };
    for (const algorithm of HASH_ALGORITHMS) {
      const result = await hashText("devbox", algorithm);
      expect(result.ok && result.value.length).toBe(lengths[algorithm]);
    }
  });
});

describe("hashAll", () => {
  it("returns one digest per algorithm", async () => {
    const digests = await hashAll("abc");
    expect(Object.keys(digests)).toEqual([...HASH_ALGORITHMS]);
    expect(digests["SHA-256"]).toMatch(/^[0-9a-f]{64}$/);
  });
});
