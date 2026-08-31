import { err, ok, type Result } from "./result";

export type ChangeKind = "equal" | "added" | "removed";

export interface Change {
  kind: ChangeKind;
  text: string;
  /** Line number on the left, or null for an added line. */
  left: number | null;
  /** Line number on the right, or null for a removed line. */
  right: number | null;
}

export interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
}

/** Cheap enough to hold in memory; beyond this the table would be enormous. */
const MAX_CELLS = 4_000_000;

export interface DiffOptions {
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
}

const normalise = (line: string, options: DiffOptions): string => {
  let value = line;
  if (options.ignoreWhitespace) value = value.trim().replace(/\s+/g, " ");
  if (options.ignoreCase) value = value.toLowerCase();
  return value;
};

/**
 * Longest-common-subsequence diff over lines. The table is built once and
 * walked backwards, which keeps changed regions as small as possible rather
 * than restating whole blocks.
 */
export function diffLines(
  before: string,
  after: string,
  options: DiffOptions = {},
): Result<Change[]> {
  // Empty text is no lines at all, not one blank one — otherwise comparing
  // against an empty document opens with a spurious deletion.
  const split = (text: string): string[] => (text === "" ? [] : text.split("\n"));
  const left = split(before);
  const right = split(after);

  if (left.length * right.length > MAX_CELLS) {
    return err(
      `Too much to compare: ${left.length} against ${right.length} lines. ` +
        "Compare a smaller section.",
    );
  }

  const a = left.map((line) => normalise(line, options));
  const b = right.map((line) => normalise(line, options));

  // lengths[i][j] is the LCS length of a.slice(i) and b.slice(j).
  const lengths: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lengths[i]![j] =
        a[i] === b[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }

  const changes: Change[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      changes.push({ kind: "equal", text: left[i]!, left: i + 1, right: j + 1 });
      i += 1;
      j += 1;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      changes.push({ kind: "removed", text: left[i]!, left: i + 1, right: null });
      i += 1;
    } else {
      changes.push({ kind: "added", text: right[j]!, left: null, right: j + 1 });
      j += 1;
    }
  }
  while (i < a.length) {
    changes.push({ kind: "removed", text: left[i]!, left: i + 1, right: null });
    i += 1;
  }
  while (j < b.length) {
    changes.push({ kind: "added", text: right[j]!, left: null, right: j + 1 });
    j += 1;
  }

  return ok(changes);
}

export function diffStats(changes: readonly Change[]): DiffStats {
  return {
    added: changes.filter((change) => change.kind === "added").length,
    removed: changes.filter((change) => change.kind === "removed").length,
    unchanged: changes.filter((change) => change.kind === "equal").length,
  };
}

const MARKERS: Record<ChangeKind, string> = { equal: " ", added: "+", removed: "-" };

/** Unified diff, the format `git diff` and `patch` speak. */
export function toUnifiedDiff(changes: readonly Change[], context = 3): string {
  const interesting = changes
    .map((change, index) => (change.kind === "equal" ? -1 : index))
    .filter((index) => index >= 0);
  if (interesting.length === 0) return "";

  // Group changes that sit within twice the context of each other.
  const groups: Array<[number, number]> = [];
  let start = interesting[0]!;
  let end = start;
  for (const index of interesting.slice(1)) {
    if (index - end <= context * 2) end = index;
    else {
      groups.push([start, end]);
      start = index;
      end = index;
    }
  }
  groups.push([start, end]);

  const lines: string[] = [];
  for (const [from, to] of groups) {
    const first = Math.max(0, from - context);
    const last = Math.min(changes.length - 1, to + context);
    const slice = changes.slice(first, last + 1);

    const leftStart = slice.find((change) => change.left !== null)?.left ?? 0;
    const rightStart = slice.find((change) => change.right !== null)?.right ?? 0;
    const leftCount = slice.filter((change) => change.left !== null).length;
    const rightCount = slice.filter((change) => change.right !== null).length;

    lines.push(`@@ -${leftStart},${leftCount} +${rightStart},${rightCount} @@`);
    for (const change of slice) lines.push(`${MARKERS[change.kind]}${change.text}`);
  }
  return lines.join("\n");
}
