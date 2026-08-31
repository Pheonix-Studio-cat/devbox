import { describe, expect, it } from "vitest";
import { describeNumber, parseNumber } from "./numbers";

const value = (input: string): bigint => {
  const result = parseNumber(input);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

describe("parseNumber", () => {
  it("reads every prefix", () => {
    expect(value("255")).toBe(255n);
    expect(value("0xff")).toBe(255n);
    expect(value("0b1111_1111")).toBe(255n);
    expect(value("0o377")).toBe(255n);
  });

  it("keeps precision beyond 2^53", () => {
    expect(value("9007199254740993")).toBe(9007199254740993n);
  });

  it("reads negative values", () => {
    expect(value("-0x10")).toBe(-16n);
  });

  it("rejects digits outside the base", () => {
    expect(parseNumber("0b12").ok).toBe(false);
    expect(parseNumber("0o99").ok).toBe(false);
    expect(parseNumber("12abc").ok).toBe(false);
  });

  it("rejects empty input", () => {
    expect(parseNumber("  ").ok).toBe(false);
  });
});

describe("describeNumber", () => {
  it("renders every base", () => {
    const view = describeNumber(255n, 8);
    expect(view).toMatchObject({
      decimal: "255",
      hexadecimal: "0xFF",
      octal: "0o377",
      binary: "0b1111 1111",
    });
  });

  it("reads the top bit as a sign at the chosen width", () => {
    expect(describeNumber(255n, 8).signed).toBe("-1");
    expect(describeNumber(255n, 16).signed).toBe("255");
    expect(describeNumber(128n, 8).signed).toBe("-128");
  });

  it("pads the bit pattern to the chosen width", () => {
    expect(describeNumber(5n, 16).bytes).toBe("00000000 00000101");
  });

  it("reports the narrowest width that holds the value", () => {
    expect(describeNumber(255n, 8).fitsIn).toBe(8);
    expect(describeNumber(256n, 16).fitsIn).toBe(16);
    expect(describeNumber(1n << 70n, 64).fitsIn).toBeNull();
  });

  it("leaves signed empty when the value does not fit the width", () => {
    expect(describeNumber(256n, 8).signed).toBeNull();
  });
});
