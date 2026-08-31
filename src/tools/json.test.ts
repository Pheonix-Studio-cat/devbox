import { describe, expect, it } from "vitest";
import { formatJson, inspectJson, minifyJson, sortJsonKeys } from "./json";

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result.value;
};

describe("formatJson", () => {
  it("pretty-prints with the requested indent", () => {
    expect(unwrap(formatJson('{"a":1}', 2))).toBe('{\n  "a": 1\n}');
    expect(unwrap(formatJson('{"a":1}', 4))).toBe('{\n    "a": 1\n}');
  });

  it("preserves nested structures", () => {
    expect(unwrap(formatJson('{"a":[1,{"b":null}]}'))).toContain('"b": null');
  });

  it("rejects empty input with a readable message", () => {
    const result = formatJson("   ");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/empty/i);
  });

  it("reports the line and column of a syntax error", () => {
    const result = formatJson('{\n  "a": 1,\n  bad\n}');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/line \d+, column \d+/);
  });
});

describe("minifyJson", () => {
  it("strips insignificant whitespace", () => {
    expect(unwrap(minifyJson('{\n  "a": [1, 2]\n}'))).toBe('{"a":[1,2]}');
  });
});

describe("sortJsonKeys", () => {
  it("sorts keys recursively", () => {
    const sorted = unwrap(sortJsonKeys('{"b":1,"a":{"d":2,"c":3}}', 0));
    expect(sorted.replace(/\s/g, "")).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("leaves array order untouched", () => {
    expect(unwrap(sortJsonKeys('[3,1,2]', 0)).replace(/\s/g, "")).toBe("[3,1,2]");
  });
});

describe("inspectJson", () => {
  it("counts keys, items and depth", () => {
    const stats = unwrap(inspectJson('{"a":{"b":[1,2,3]}}'));
    expect(stats).toMatchObject({ type: "object", keys: 2, arrayItems: 3, maxDepth: 3 });
  });

  it("measures size in UTF-8 bytes, not characters", () => {
    expect(unwrap(inspectJson('"ü"')).bytes).toBe(4);
  });

  it("reports null and arrays as distinct types", () => {
    expect(unwrap(inspectJson("null")).type).toBe("null");
    expect(unwrap(inspectJson("[]")).type).toBe("array");
  });
});

describe("inspectJson depth", () => {
  it("counts nested containers, not scalar leaves", () => {
    expect(unwrap(inspectJson("5")).maxDepth).toBe(0);
    expect(unwrap(inspectJson("{}")).maxDepth).toBe(1);
    expect(unwrap(inspectJson('[[["deep"]]]')).maxDepth).toBe(3);
  });
});
