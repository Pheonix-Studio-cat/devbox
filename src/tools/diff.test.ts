import { describe, expect, it } from "vitest";
import { diffLines, diffStats, toUnifiedDiff, type Change } from "./diff";

const run = (before: string, after: string, options = {}): Change[] => {
  const result = diffLines(before, after, options);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

const kinds = (changes: Change[]): string =>
  changes.map((c) => ({ equal: "=", added: "+", removed: "-" })[c.kind]).join("");

describe("diffLines", () => {
  it("reports identical text as all equal", () => {
    expect(kinds(run("a\nb\nc", "a\nb\nc"))).toBe("===");
  });

  it("finds a single changed line without restating the rest", () => {
    expect(kinds(run("a\nb\nc", "a\nB\nc"))).toBe("=-+=");
  });

  it("finds an inserted line", () => {
    const changes = run("a\nc", "a\nb\nc");
    expect(kinds(changes)).toBe("=+=");
    expect(changes[1]).toMatchObject({ kind: "added", text: "b", left: null, right: 2 });
  });

  it("finds a deleted line", () => {
    const changes = run("a\nb\nc", "a\nc");
    expect(kinds(changes)).toBe("=-=");
    expect(changes[1]).toMatchObject({ kind: "removed", text: "b", left: 2, right: null });
  });

  it("numbers the lines on the side each one belongs to", () => {
    const changes = run("keep\ndrop\nkeep2", "keep\nadd\nkeep2");
    expect(changes.map((c) => [c.left, c.right])).toEqual([
      [1, 1], [2, null], [null, 2], [3, 3],
    ]);
  });

  it("treats empty text as no lines, not one blank line", () => {
    expect(kinds(run("", "a\nb"))).toBe("++");
    expect(kinds(run("a\nb", ""))).toBe("--");
    expect(kinds(run("", ""))).toBe("");
  });

  it("keeps a moved block as one deletion and one insertion", () => {
    const changes = run("a\nb\nc\nd", "c\nd\na\nb");
    expect(diffStats(changes)).toMatchObject({ added: 2, removed: 2, unchanged: 2 });
  });

  it("can ignore whitespace differences", () => {
    expect(kinds(run("a  b", "a b"))).toBe("-+");
    expect(kinds(run("a  b", "a b", { ignoreWhitespace: true }))).toBe("=");
  });

  it("can ignore case differences", () => {
    expect(kinds(run("Hello", "hello", { ignoreCase: true }))).toBe("=");
  });

  it("refuses a comparison too large to hold", () => {
    const huge = "x\n".repeat(3000);
    const result = diffLines(huge, huge.replace("x", "y"));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/smaller section/i);
  });
});

describe("diffStats", () => {
  it("counts each kind", () => {
    expect(diffStats(run("a\nb", "a\nc\nd"))).toEqual({ added: 2, removed: 1, unchanged: 1 });
  });
});

describe("toUnifiedDiff", () => {
  it("returns nothing when the texts match", () => {
    expect(toUnifiedDiff(run("same", "same"))).toBe("");
  });

  it("marks added and removed lines the way patch expects", () => {
    const unified = toUnifiedDiff(run("a\nb\nc", "a\nB\nc"));
    expect(unified).toContain("-b");
    expect(unified).toContain("+B");
    expect(unified).toContain(" a");
    expect(unified.startsWith("@@")).toBe(true);
  });

  it("groups nearby changes into one hunk and distant ones into two", () => {
    const before = ["x", ...Array.from({ length: 20 }, (_, i) => `line${i}`), "y"].join("\n");
    const after = ["X", ...Array.from({ length: 20 }, (_, i) => `line${i}`), "Y"].join("\n");
    const hunks = (context: number): number =>
      toUnifiedDiff(run(before, after), context).split("\n").filter((l) => l.startsWith("@@")).length;
    expect(hunks(1)).toBe(2);
    expect(hunks(30)).toBe(1);
  });

  it("keeps the requested amount of context", () => {
    const before = Array.from({ length: 11 }, (_, i) => String(i)).join("\n");
    const after = before.replace("5", "five");
    const body = toUnifiedDiff(run(before, after), 2).split("\n").slice(1);
    expect(body.filter((line) => line.startsWith(" "))).toHaveLength(4);
  });
});
