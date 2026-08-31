import { err, messageOf, ok, type Result } from "./result";

export const DELIMITERS = { comma: ",", semicolon: ";", tab: "\t", pipe: "|" } as const;
export type DelimiterName = keyof typeof DELIMITERS;

/** Guesses the delimiter by counting candidates outside quoted fields. */
export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 8000);
  let best = ",";
  let bestCount = 0;

  for (const candidate of Object.values(DELIMITERS)) {
    let count = 0;
    let quoted = false;
    for (let i = 0; i < sample.length; i += 1) {
      const char = sample[i];
      if (char === '"') quoted = !quoted;
      else if (char === candidate && !quoted) count += 1;
    }
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
}

/**
 * RFC 4180 parsing: doubled quotes escape a quote, and quoted fields may span
 * newlines. Handles CRLF and a trailing newline.
 */
export function parseCsv(text: string, delimiter?: string): Result<string[][]> {
  if (text.trim() === "") return err("Nothing to convert — the input is empty.");
  const separator = delimiter ?? detectDelimiter(text);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;

    if (quoted) {
      if (char !== '"') {
        field += char;
      } else if (text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = false;
      }
      continue;
    }

    if (char === '"' && field === "") {
      quoted = true;
    } else if (char === separator) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (quoted) return err("Unterminated quote — a quoted field is never closed.");
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.length === 0 ? err("No rows found.") : ok(rows);
}

const asValue = (raw: string): string | number | boolean | null => {
  const value = raw.trim();
  if (value === "") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  // Only convert what survives a round-trip, so IDs like "007" stay strings.
  if (/^-?\d+(\.\d+)?$/.test(value) && String(Number(value)) === value) return Number(value);
  return raw;
};

export interface CsvOptions {
  delimiter?: string;
  /** Treat the first row as column names. */
  header?: boolean;
  /** Convert numbers, booleans and blanks instead of keeping every cell a string. */
  typed?: boolean;
}

/** CSV to JSON: objects when there is a header row, arrays otherwise. */
export function csvToJson(text: string, options: CsvOptions = {}): Result<string> {
  const { header = true, typed = true } = options;
  const parsed = parseCsv(text, options.delimiter);
  if (!parsed.ok) return parsed;

  const rows = parsed.value;
  const convert = (cell: string): unknown => (typed ? asValue(cell) : cell);

  if (!header) {
    return ok(JSON.stringify(rows.map((cells) => cells.map(convert)), null, 2));
  }

  const [names, ...body] = rows;
  if (!names) return err("No header row found.");

  const columns = names.map((name, index) => (name.trim() === "" ? `column${index + 1}` : name.trim()));
  const records = body.map((cells) =>
    Object.fromEntries(columns.map((name, index) => [name, convert(cells[index] ?? "")])),
  );
  return ok(JSON.stringify(records, null, 2));
}

const escapeCell = (value: unknown, separator: string): string => {
  const text =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return /["\n\r]/.test(text) || text.includes(separator)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
};

/** JSON to CSV. Accepts an array of objects, or an array of arrays. */
export function jsonToCsv(text: string, delimiter = ","): Result<string> {
  if (text.trim() === "") return err("Nothing to convert — the input is empty.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (cause) {
    return err(`That is not valid JSON: ${messageOf(cause)}`);
  }

  const rows = Array.isArray(parsed) ? parsed : [parsed];
  if (rows.length === 0) return err("The array is empty, so there is nothing to write.");

  if (rows.every((row) => Array.isArray(row))) {
    return ok(
      (rows as unknown[][])
        .map((row) => row.map((cell) => escapeCell(cell, delimiter)).join(delimiter))
        .join("\n"),
    );
  }

  if (!rows.every((row) => row !== null && typeof row === "object")) {
    return err("Expected an array of objects or an array of arrays.");
  }

  // Union of keys in first-seen order, so rows with missing fields still line up.
  const columns: string[] = [];
  for (const row of rows as Array<Record<string, unknown>>) {
    for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key);
  }

  const lines = [columns.map((name) => escapeCell(name, delimiter)).join(delimiter)];
  for (const row of rows as Array<Record<string, unknown>>) {
    lines.push(columns.map((name) => escapeCell(row[name], delimiter)).join(delimiter));
  }
  return ok(lines.join("\n"));
}
