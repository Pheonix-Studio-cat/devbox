import { err, messageOf, ok, type Result } from "./result";

/**
 * V8 reports parse failures as "... at position 12 (line 2 column 3)" or, on
 * older runtimes, only "... at position 12". We normalise both into a line and
 * column so the UI can point at the offending character.
 */
function describeParseError(input: string, cause: unknown): string {
  const message = messageOf(cause);
  const positionMatch = /position (\d+)/.exec(message);
  if (!positionMatch?.[1]) return message;

  const position = Math.min(Number(positionMatch[1]), input.length);
  const before = input.slice(0, position);
  const line = before.split("\n").length;
  const column = position - (before.lastIndexOf("\n") + 1) + 1;
  const cleaned = message.replace(/\s*\(line \d+ column \d+\)/, "");
  return `${cleaned} — line ${line}, column ${column}`;
}

function parse(input: string): Result<unknown> {
  if (input.trim() === "") return err("Nothing to parse — the input is empty.");
  try {
    return ok(JSON.parse(input) as unknown);
  } catch (cause) {
    return err(describeParseError(input, cause));
  }
}

/** Pretty-prints JSON with the given indent width. */
export function formatJson(input: string, indent = 2): Result<string> {
  const parsed = parse(input);
  return parsed.ok ? ok(JSON.stringify(parsed.value, null, indent)) : parsed;
}

/** Strips all insignificant whitespace. */
export function minifyJson(input: string): Result<string> {
  const parsed = parse(input);
  return parsed.ok ? ok(JSON.stringify(parsed.value)) : parsed;
}

/** Recursively sorts object keys so two documents can be compared by eye. */
export function sortJsonKeys(input: string, indent = 2): Result<string> {
  const parsed = parse(input);
  if (!parsed.ok) return parsed;
  return ok(JSON.stringify(sortValue(parsed.value), null, indent));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value === null || typeof value !== "object") return value;

  const entries = Object.entries(value as Record<string, unknown>);
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries.map(([key, item]) => [key, sortValue(item)]));
}

export interface JsonStats {
  type: string;
  keys: number;
  arrayItems: number;
  maxDepth: number;
  bytes: number;
}

/** A quick structural summary, useful for sizing up an unfamiliar payload. */
export function inspectJson(input: string): Result<JsonStats> {
  const parsed = parse(input);
  if (!parsed.ok) return parsed;

  let keys = 0;
  let arrayItems = 0;
  let maxDepth = 0;

  // Depth counts nested containers only, so a scalar document is depth 0 and
  // {"a": {"b": [1]}} is depth 3.
  const walk = (value: unknown, depth: number): void => {
    if (Array.isArray(value)) {
      maxDepth = Math.max(maxDepth, depth);
      arrayItems += value.length;
      for (const item of value) walk(item, depth + 1);
      return;
    }
    if (value !== null && typeof value === "object") {
      maxDepth = Math.max(maxDepth, depth);
      for (const [, item] of Object.entries(value as Record<string, unknown>)) {
        keys += 1;
        walk(item, depth + 1);
      }
    }
  };
  walk(parsed.value, 1);

  return ok({
    type: describeType(parsed.value),
    keys,
    arrayItems,
    maxDepth,
    bytes: new TextEncoder().encode(input).length,
  });
}

function describeType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
