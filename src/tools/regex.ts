import { err, messageOf, ok, type Result } from "./result";

export interface Capture {
  name: string;
  value: string | undefined;
}

export interface RegexMatch {
  index: number;
  text: string;
  captures: Capture[];
}

export interface RegexReport {
  matches: RegexMatch[];
  /** True when the match limit stopped the search early. */
  truncated: boolean;
}

const MATCH_LIMIT = 1000;

/** Builds a regex, turning the engine's complaints into readable ones. */
export function compile(pattern: string, flags: string): Result<RegExp> {
  if (pattern === "") return err("Nothing to match — the pattern is empty.");
  try {
    return ok(new RegExp(pattern, flags.includes("g") ? flags : `${flags}g`));
  } catch (cause) {
    return err(`That pattern is not valid: ${messageOf(cause)}`);
  }
}

/** Runs a pattern over the text and collects every match with its groups. */
export function findMatches(
  pattern: string,
  flags: string,
  text: string,
  limit = MATCH_LIMIT,
): Result<RegexReport> {
  const compiled = compile(pattern, flags);
  if (!compiled.ok) return compiled;

  const regex = compiled.value;
  const matches: RegexMatch[] = [];
  let truncated = false;

  for (const found of text.matchAll(regex)) {
    if (matches.length >= limit) {
      truncated = true;
      break;
    }

    const captures: Capture[] = [];
    for (let group = 1; group < found.length; group += 1) {
      captures.push({ name: String(group), value: found[group] });
    }
    for (const [name, value] of Object.entries(found.groups ?? {})) {
      captures.push({ name, value: value as string | undefined });
    }

    matches.push({ index: found.index, text: found[0], captures });

    // A pattern that can match nothing would otherwise spin on one spot.
    if (found[0] === "" && regex.lastIndex <= found.index) regex.lastIndex = found.index + 1;
  }

  return ok({ matches, truncated });
}

/** Applies a replacement, with $1 and $<name> working as usual. */
export function replaceMatches(
  pattern: string,
  flags: string,
  text: string,
  replacement: string,
): Result<string> {
  const compiled = compile(pattern, flags);
  if (!compiled.ok) return compiled;
  try {
    return ok(text.replace(compiled.value, replacement));
  } catch (cause) {
    return err(`That replacement is not valid: ${messageOf(cause)}`);
  }
}

/** Splits text into matched and unmatched runs, for highlighting. */
export function segment(
  text: string,
  matches: readonly RegexMatch[],
): Array<{ text: string; matched: boolean }> {
  const parts: Array<{ text: string; matched: boolean }> = [];
  let cursor = 0;

  for (const match of matches) {
    if (match.index > cursor) {
      parts.push({ text: text.slice(cursor, match.index), matched: false });
    }
    if (match.text !== "") parts.push({ text: match.text, matched: true });
    cursor = Math.max(cursor, match.index + match.text.length);
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), matched: false });

  return parts;
}
