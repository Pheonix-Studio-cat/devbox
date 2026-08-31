import { describe, expect, it } from "vitest";
import { compile, findMatches, replaceMatches, segment } from "./regex";

const find = (pattern: string, flags: string, text: string) => {
  const result = findMatches(pattern, flags, text);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

describe("compile", () => {
  const flagsOf = (pattern: string, flags: string): string => {
    const result = compile(pattern, flags);
    if (!result.ok) throw new Error(result.error);
    return result.value.flags;
  };

  it("always searches globally so every match is found", () => {
    expect(flagsOf("a", "")).toContain("g");
    expect(flagsOf("a", "gi")).toBe("gi");
  });

  it("explains an invalid pattern instead of throwing", () => {
    const result = compile("(unclosed", "");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/not valid/i);
  });

  it("rejects an empty pattern", () => {
    expect(compile("", "").ok).toBe(false);
  });
});

describe("findMatches", () => {
  it("returns every match with its position", () => {
    const { matches } = find("\\d+", "", "a1 bb22 c333");
    expect(matches.map((m) => [m.text, m.index])).toEqual([["1", 1], ["22", 5], ["333", 9]]);
  });

  it("collects numbered capture groups", () => {
    const { matches } = find("(\\w+)@(\\w+)", "", "ada@example");
    expect(matches[0]?.captures).toEqual([
      { name: "1", value: "ada" },
      { name: "2", value: "example" },
    ]);
  });

  it("collects named capture groups", () => {
    const { matches } = find("(?<year>\\d{4})-(?<month>\\d{2})", "", "2026-08");
    expect(matches[0]?.captures).toContainEqual({ name: "year", value: "2026" });
    expect(matches[0]?.captures).toContainEqual({ name: "month", value: "08" });
  });

  it("reports a group that did not participate as undefined", () => {
    const { matches } = find("a(x)?", "", "a");
    expect(matches[0]?.captures).toEqual([{ name: "1", value: undefined }]);
  });

  it("honours the case-insensitive flag", () => {
    expect(find("abc", "i", "ABC").matches).toHaveLength(1);
    expect(find("abc", "", "ABC").matches).toHaveLength(0);
  });

  it("does not spin forever on a pattern that matches nothing", () => {
    const { matches } = find("x*", "", "abc");
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.length).toBeLessThan(10);
  });

  it("stops at the match limit and says so", () => {
    const result = findMatches("a", "", "a".repeat(50), 10);
    expect(result.ok && result.value.matches).toHaveLength(10);
    expect(result.ok && result.value.truncated).toBe(true);
  });

  it("reports no truncation when everything fits", () => {
    expect(find("a", "", "aaa").truncated).toBe(false);
  });
});

describe("replaceMatches", () => {
  it("replaces every match", () => {
    expect(replaceMatches("\\d", "", "a1b2", "#")).toMatchObject({ value: "a#b#" });
  });

  it("supports numbered and named references", () => {
    expect(replaceMatches("(\\w+) (\\w+)", "", "hello world", "$2 $1")).toMatchObject({
      value: "world hello",
    });
    expect(
      replaceMatches("(?<first>\\w+) (?<second>\\w+)", "", "hello world", "$<second> $<first>"),
    ).toMatchObject({ value: "world hello" });
  });

  it("passes the pattern error through", () => {
    expect(replaceMatches("(", "", "x", "y").ok).toBe(false);
  });
});

describe("segment", () => {
  it("splits text into matched and unmatched runs", () => {
    const { matches } = find("\\d+", "", "a12b3");
    expect(segment("a12b3", matches)).toEqual([
      { text: "a", matched: false },
      { text: "12", matched: true },
      { text: "b", matched: false },
      { text: "3", matched: true },
    ]);
  });

  it("returns the whole text unmatched when nothing matches", () => {
    expect(segment("abc", [])).toEqual([{ text: "abc", matched: false }]);
  });

  it("handles a match at the very start and end", () => {
    const { matches } = find("a", "", "aba");
    expect(segment("aba", matches)).toEqual([
      { text: "a", matched: true },
      { text: "b", matched: false },
      { text: "a", matched: true },
    ]);
  });

  it("skips empty matches so no zero-width run appears", () => {
    const { matches } = find("x*", "", "ab");
    expect(segment("ab", matches).every((part) => part.text !== "")).toBe(true);
  });
});
