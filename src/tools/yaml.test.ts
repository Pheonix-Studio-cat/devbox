import { describe, expect, it } from "vitest";
import { jsonToYaml, parseYaml, yamlToJson } from "./yaml";

const parse = (source: string): unknown => {
  const result = parseYaml(source);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

const toYaml = (json: string): string => {
  const result = jsonToYaml(json);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

describe("parseYaml", () => {
  it("reads a flat mapping", () => {
    expect(parse("name: devbox\ntools: 16\noffline: true")).toEqual({
      name: "devbox",
      tools: 16,
      offline: true,
    });
  });

  it("reads a sequence of scalars", () => {
    expect(parse("- one\n- two\n- 3")).toEqual(["one", "two", 3]);
  });

  it("reads nested mappings by indentation", () => {
    expect(parse("server:\n  host: localhost\n  port: 8080")).toEqual({
      server: { host: "localhost", port: 8080 },
    });
  });

  it("reads a sequence of mappings", () => {
    expect(parse("- name: a\n  size: 1\n- name: b\n  size: 2")).toEqual([
      { name: "a", size: 1 },
      { name: "b", size: 2 },
    ]);
  });

  it("reads a sequence nested under a key", () => {
    expect(parse("tags:\n  - json\n  - yaml")).toEqual({ tags: ["json", "yaml"] });
  });

  it("recognises nulls, booleans and numbers", () => {
    expect(parse("a: null\nb: ~\nc:\nd: true\ne: -12\nf: 1.5")).toEqual({
      a: null, b: null, c: null, d: true, e: -12, f: 1.5,
    });
  });

  it("keeps quoted values as strings", () => {
    expect(parse('a: "123"\nb: \'true\'')).toEqual({ a: "123", b: "true" });
  });

  it("unescapes double-quoted strings", () => {
    expect(parse('a: "line\\nbreak"')).toEqual({ a: "line\nbreak" });
  });

  it("strips comments but not hashes inside quotes", () => {
    expect(parse('a: 1 # trailing\n# whole line\nb: "x # y"')).toEqual({ a: 1, b: "x # y" });
  });

  it("reads flow collections", () => {
    expect(parse("a: [1, 2, 3]\nb: {x: 1, y: 2}")).toEqual({ a: [1, 2, 3], b: { x: 1, y: 2 } });
  });

  it("keeps commas inside quoted flow entries", () => {
    expect(parse('a: ["x,y", "z"]')).toEqual({ a: ["x,y", "z"] });
  });

  it("reads literal and folded block scalars", () => {
    expect(parse("text: |\n  one\n  two")).toEqual({ text: "one\ntwo\n" });
    expect(parse("text: >\n  one\n  two")).toEqual({ text: "one two\n" });
    expect(parse("text: |-\n  one\n  two")).toEqual({ text: "one\ntwo" });
  });

  it("ignores a leading document marker", () => {
    expect(parse("---\na: 1")).toEqual({ a: 1 });
  });

  it("declines what it cannot read, rather than guessing", () => {
    for (const [source, hint] of [
      ["a: &anchor 1", /anchor/i],
      ["a: *ref", /alias/i],
      ["a: !!str 1", /tag/i],
      ["a: 1\n---\nb: 2", /single document/i],
    ] as const) {
      const result = parseYaml(source);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error).toMatch(hint);
    }
  });

  it("names the line when the indentation does not line up", () => {
    const result = parseYaml("a:\n  b: 1\n   c: 2");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/line \d+/);
  });

  it("rejects tabs used for indentation", () => {
    const result = parseYaml("a:\n\tb: 1");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/tab/i);
  });

  it("rejects empty input", () => {
    expect(parseYaml("   ").ok).toBe(false);
  });
});

describe("jsonToYaml", () => {
  it("writes a flat object", () => {
    expect(toYaml('{"name":"devbox","tools":16}')).toBe("name: devbox\ntools: 16");
  });

  it("writes nested objects with indentation", () => {
    expect(toYaml('{"server":{"host":"localhost","port":8080}}')).toBe(
      "server:\n  host: localhost\n  port: 8080",
    );
  });

  it("writes arrays as sequences", () => {
    expect(toYaml('{"tags":["a","b"]}')).toBe("tags:\n  - a\n  - b");
  });

  it("quotes strings that would otherwise read as another type", () => {
    expect(toYaml('{"a":"123","b":"true","c":"x: y"}')).toContain('a: "123"');
    expect(toYaml('{"b":"true"}')).toContain('b: "true"');
    expect(toYaml('{"c":"x: y"}')).toContain('c: "x: y"');
  });

  it("writes empty collections inline", () => {
    expect(toYaml('{"a":[],"b":{}}')).toBe("a: []\nb: {}");
  });

  it("rejects invalid JSON", () => {
    expect(jsonToYaml("{nope}").ok).toBe(false);
  });
});

describe("round trip", () => {
  it.each([
    '{"name":"devbox","tools":16,"offline":true}',
    '{"server":{"host":"localhost","port":8080},"tags":["a","b"]}',
    '{"list":[{"id":1,"name":"one"},{"id":2,"name":"two"}]}',
    '{"empty":null,"quoted":"123"}',
  ])("survives JSON → YAML → JSON for %s", (json) => {
    const yaml = toYaml(json);
    const back = yamlToJson(yaml, 0);
    expect(back.ok && JSON.parse(back.value)).toEqual(JSON.parse(json));
  });
});
