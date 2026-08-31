import { describe, expect, it } from "vitest";
import { csvToJson, detectDelimiter, jsonToCsv, parseCsv } from "./csv";

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

describe("parseCsv", () => {
  it("keeps separators and newlines inside quoted fields", () => {
    const rows = unwrap(parseCsv('name,note\n"Meier, Anna","line one\nline two"'));
    expect(rows).toEqual([
      ["name", "note"],
      ["Meier, Anna", "line one\nline two"],
    ]);
  });

  it("unescapes doubled quotes", () => {
    expect(unwrap(parseCsv('a\n"He said ""hi"""'))[1]).toEqual(['He said "hi"']);
  });

  it("handles CRLF and a trailing newline", () => {
    expect(unwrap(parseCsv("a,b\r\n1,2\r\n"))).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("keeps empty cells", () => {
    expect(unwrap(parseCsv("a,b,c\n1,,3"))[1]).toEqual(["1", "", "3"]);
  });

  it("reports an unterminated quote", () => {
    const result = parseCsv('a\n"unclosed');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/quote/i);
  });
});

describe("detectDelimiter", () => {
  it("picks the most common separator outside quotes", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\n1\t2")).toBe("\t");
    expect(detectDelimiter('a,b\n"x;y;z",2')).toBe(",");
  });
});

describe("csvToJson", () => {
  it("builds objects from the header row", () => {
    const json = JSON.parse(unwrap(csvToJson("name,age\nAnna,30\nBeat,41")));
    expect(json).toEqual([
      { name: "Anna", age: 30 },
      { name: "Beat", age: 41 },
    ]);
  });

  it("converts booleans and blanks when typing is on", () => {
    const json = JSON.parse(unwrap(csvToJson("a,b,c\ntrue,,7")));
    expect(json[0]).toEqual({ a: true, b: null, c: 7 });
  });

  it("keeps values that would lose their form as numbers", () => {
    const json = JSON.parse(unwrap(csvToJson("id\n007")));
    expect(json[0].id).toBe("007");
  });

  it("keeps everything a string when typing is off", () => {
    const json = JSON.parse(unwrap(csvToJson("a\n7", { typed: false })));
    expect(json[0].a).toBe("7");
  });

  it("emits arrays when there is no header row", () => {
    const json = JSON.parse(unwrap(csvToJson("1,2\n3,4", { header: false })));
    expect(json).toEqual([[1, 2], [3, 4]]);
  });

  it("names blank header columns", () => {
    const json = JSON.parse(unwrap(csvToJson("a,,c\n1,2,3")));
    expect(Object.keys(json[0])).toEqual(["a", "column2", "c"]);
  });
});

describe("jsonToCsv", () => {
  it("writes a header from the union of keys", () => {
    const csv = unwrap(jsonToCsv('[{"a":1,"b":2},{"a":3,"c":4}]'));
    expect(csv).toBe("a,b,c\n1,2,\n3,,4");
  });

  it("quotes cells containing the delimiter, quotes or newlines", () => {
    const csv = unwrap(jsonToCsv('[{"a":"x,y","b":"say \\"hi\\""}]'));
    expect(csv).toBe('a,b\n"x,y","say ""hi"""');
  });

  it("accepts an array of arrays", () => {
    expect(unwrap(jsonToCsv("[[1,2],[3,4]]"))).toBe("1,2\n3,4");
  });

  it("serialises nested values as JSON", () => {
    expect(unwrap(jsonToCsv('[{"a":{"deep":1}}]'))).toBe('a\n"{""deep"":1}"');
  });

  it("round-trips through csvToJson", () => {
    const original = '[{"name":"Meier, Anna","age":30}]';
    const csv = unwrap(jsonToCsv(original));
    expect(JSON.parse(unwrap(csvToJson(csv)))).toEqual(JSON.parse(original));
  });

  it("rejects values that are not objects or arrays", () => {
    expect(jsonToCsv('["a","b"]').ok).toBe(false);
    expect(jsonToCsv("not json").ok).toBe(false);
  });
});
