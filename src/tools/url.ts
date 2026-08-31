import { err, messageOf, ok, type Result } from "./result";

export function encodeUrl(text: string): Result<string> {
  try {
    return ok(encodeURIComponent(text));
  } catch (cause) {
    return err(messageOf(cause));
  }
}

export function decodeUrl(text: string): Result<string> {
  try {
    return ok(decodeURIComponent(text.replace(/\+/g, " ")));
  } catch {
    return err("Not a valid percent-encoded string — check for a stray '%'.");
  }
}

export interface QueryPair {
  key: string;
  value: string;
}

export interface ParsedUrl {
  parts: QueryPair[];
  query: QueryPair[];
}

/**
 * Accepts a full URL, a bare query string, or a fragment of one, and splits it
 * into its components plus decoded query parameters.
 */
export function parseUrl(input: string): Result<ParsedUrl> {
  const trimmed = input.trim();
  if (trimmed === "") return err("Nothing to parse — the input is empty.");

  const parts: QueryPair[] = [];
  let queryString = trimmed;

  try {
    const url = new URL(trimmed);
    parts.push(
      { key: "protocol", value: url.protocol.replace(/:$/, "") },
      { key: "host", value: url.host },
      { key: "pathname", value: url.pathname },
    );
    if (url.port) parts.push({ key: "port", value: url.port });
    if (url.username) parts.push({ key: "username", value: url.username });
    if (url.hash) parts.push({ key: "fragment", value: url.hash.slice(1) });
    queryString = url.search;
  } catch {
    // Not an absolute URL — treat the whole input as a query string.
    const questionMark = trimmed.indexOf("?");
    if (questionMark !== -1) queryString = trimmed.slice(questionMark);
  }

  const params = new URLSearchParams(queryString.replace(/^\?/, ""));
  const query = [...params.entries()].map(([key, value]) => ({ key, value }));
  return ok({ parts, query });
}

/** Rebuilds a query string from `key=value` lines. */
export function buildQuery(lines: string): Result<string> {
  const params = new URLSearchParams();
  for (const line of lines.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      params.append(trimmed, "");
      continue;
    }
    params.append(trimmed.slice(0, separator).trim(), trimmed.slice(separator + 1).trim());
  }
  const result = params.toString();
  return result === "" ? err("No key=value pairs found.") : ok(result);
}
