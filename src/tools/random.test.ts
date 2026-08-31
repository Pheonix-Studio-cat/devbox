import { describe, expect, it } from "vitest";
import { generateMany, randomToken, uuidV4 } from "./random";

describe("uuidV4", () => {
  it("has the version 4 shape", () => {
    expect(uuidV4()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("does not repeat across a large batch", () => {
    const batch = generateMany(500, uuidV4);
    expect(new Set(batch).size).toBe(500);
  });
});

describe("randomToken", () => {
  it("renders hex at two characters per byte", () => {
    expect(randomToken(16, "hex")).toMatch(/^[0-9a-f]{32}$/);
  });

  it("renders base64url without padding or unsafe characters", () => {
    expect(randomToken(32, "base64url")).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("renders exactly `bytes` alphanumeric characters", () => {
    expect(randomToken(24, "alphanumeric")).toMatch(/^[A-Za-z0-9]{24}$/);
  });

  it("clamps the requested size into a sane range", () => {
    expect(randomToken(0, "hex").length).toBe(2);
    expect(randomToken(99_999, "hex").length).toBe(2048);
  });

  it("produces a different value on each call", () => {
    expect(new Set(generateMany(100, () => randomToken(16))).size).toBe(100);
  });
});

describe("generateMany", () => {
  it("returns the requested count", () => {
    expect(generateMany(7, () => "x")).toHaveLength(7);
  });

  it("clamps the count to the supported range", () => {
    expect(generateMany(0, () => "x")).toHaveLength(1);
    expect(generateMany(10_000, () => "x")).toHaveLength(500);
  });
});
