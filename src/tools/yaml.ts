import { err, ok, type Result } from "./result";

/**
 * A deliberate subset of YAML: block mappings and sequences, flow collections,
 * quoted and plain scalars, comments, and the | and > block scalars.
 *
 * Anchors, aliases, tags, multiple documents and complex keys are refused with
 * a message rather than guessed at — silently misreading a config file is worse
 * than declining to read it.
 */

interface Line {
  indent: number;
  text: string;
  number: number;
}

class YamlError extends Error {
  constructor(message: string, readonly line: number) {
    super(`${message} (line ${line})`);
  }
}

/** Strips a trailing comment, leaving anything inside quotes alone. */
function stripComment(text: string): string {
  let quote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "#" && (i === 0 || /\s/.test(text[i - 1]!))) {
      return text.slice(0, i);
    }
  }
  return text;
}

function readLines(source: string): Line[] {
  const lines: Line[] = [];
  source.split("\n").forEach((raw, index) => {
    if (raw.includes("\t") && raw.trim() !== "" && /^\s*\t/.test(raw)) {
      throw new YamlError("YAML forbids tabs for indentation — use spaces", index + 1);
    }
    const withoutComment = stripComment(raw);
    if (withoutComment.trim() === "") return;
    lines.push({
      indent: withoutComment.length - withoutComment.trimStart().length,
      text: withoutComment.trimEnd(),
      number: index + 1,
    });
  });
  return lines;
}

const UNSUPPORTED: ReadonlyArray<readonly [RegExp, string]> = [
  [/^&\S+/, "anchors (&name)"],
  [/^\*\S+/, "aliases (*name)"],
  [/^!\S*/, "tags (!type)"],
];

function parseScalar(raw: string, line: number): unknown {
  const value = raw.trim();
  if (value === "" || value === "~" || value === "null") return null;
  if (value === "true" || value === "false") return value === "true";

  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return value
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    return value.slice(1, -1).replace(/''/g, "'");
  }

  for (const [pattern, name] of UNSUPPORTED) {
    if (pattern.test(value)) throw new YamlError(`This reader does not support ${name}`, line);
  }

  if (value.startsWith("[") || value.startsWith("{")) return parseFlow(value, line);
  if (/^-?\d+$/.test(value)) return Number(value);
  if (/^-?\d*\.\d+([eE][+-]?\d+)?$/.test(value)) return Number(value);
  return value;
}

/** Flow collections: [a, b] and {key: value}. */
function parseFlow(raw: string, line: number): unknown {
  const text = raw.trim();
  const closing = text.startsWith("[") ? "]" : "}";
  if (!text.endsWith(closing)) {
    throw new YamlError(`This ${text[0]} is never closed`, line);
  }

  const body = text.slice(1, -1).trim();
  if (body === "") return text.startsWith("[") ? [] : {};

  // Split on commas that are not inside a nested collection or a quoted string.
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i]!;
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "[" || char === "{") depth += 1;
    else if (char === "]" || char === "}") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));

  if (text.startsWith("[")) return parts.map((part) => parseScalar(part, line));

  const record: Record<string, unknown> = {};
  for (const part of parts) {
    const separator = part.indexOf(":");
    if (separator === -1) throw new YamlError(`"${part.trim()}" needs a colon`, line);
    const key = String(parseScalar(part.slice(0, separator), line));
    record[key] = parseScalar(part.slice(separator + 1), line);
  }
  return record;
}

class Parser {
  private index = 0;

  constructor(private readonly lines: Line[]) {}

  private peek(): Line | undefined {
    return this.lines[this.index];
  }

  /** Reads whatever block starts at `indent`: a sequence, a mapping, or nothing. */
  parseBlock(indent: number): unknown {
    const line = this.peek();
    if (!line || line.indent < indent) return null;
    return line.text.trimStart().startsWith("- ") || line.text.trim() === "-"
      ? this.parseSequence(indent)
      : this.parseMapping(indent);
  }

  private parseSequence(indent: number): unknown[] {
    const items: unknown[] = [];
    while (true) {
      const line = this.peek();
      if (!line || line.indent !== indent) break;
      const content = line.text.trimStart();
      if (!content.startsWith("- ") && content !== "-") break;

      this.index += 1;
      const rest = content === "-" ? "" : content.slice(2).trim();

      if (rest === "") {
        // Descend at whatever indent the block below actually uses, rather
        // than assuming it sits exactly one space in.
        const next = this.peek();
        items.push(next && next.indent > line.indent ? this.parseBlock(next.indent) : null);
        continue;
      }
      // "- key: value" starts a mapping whose first line sits after the dash.
      if (this.looksLikeMapping(rest)) {
        const offset = line.indent + 2;
        this.lines.splice(this.index, 0, { indent: offset, text: " ".repeat(offset) + rest, number: line.number });
        items.push(this.parseMapping(offset));
        continue;
      }
      items.push(this.readScalarOrBlock(rest, line, indent));
    }
    return items;
  }

  private looksLikeMapping(text: string): boolean {
    if (text.startsWith("[") || text.startsWith("{")) return false;
    const separator = this.keyEnd(text);
    return separator !== -1;
  }

  /** Finds the colon that separates a key from its value, ignoring quotes. */
  private keyEnd(text: string): number {
    let quote: string | null = null;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i]!;
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'") quote = char;
      else if (char === ":" && (i + 1 === text.length || /\s/.test(text[i + 1]!))) return i;
    }
    return -1;
  }

  private parseMapping(indent: number): Record<string, unknown> {
    const record: Record<string, unknown> = {};
    while (true) {
      const line = this.peek();
      if (!line || line.indent !== indent) break;
      const content = line.text.trimStart();
      if (content.startsWith("- ")) break;

      const separator = this.keyEnd(content);
      if (separator === -1) {
        throw new YamlError(`"${content}" is neither a key nor a list item`, line.number);
      }

      this.index += 1;
      const key = String(parseScalar(content.slice(0, separator), line.number));
      const rest = content.slice(separator + 1).trim();
      record[key] = this.readScalarOrBlock(rest, line, indent);
    }
    return record;
  }

  /** A value on the same line, a block scalar, or a nested block below. */
  private readScalarOrBlock(rest: string, line: Line, indent: number): unknown {
    if (rest === "|" || rest === ">" || rest === "|-" || rest === ">-") {
      return this.readBlockScalar(rest, indent);
    }
    if (rest !== "") return parseScalar(rest, line.number);

    const next = this.peek();
    if (next && next.indent > indent) return this.parseBlock(next.indent);
    return null;
  }

  private readBlockScalar(marker: string, indent: number): string {
    const folded = marker.startsWith(">");
    const chomp = marker.endsWith("-");
    const collected: string[] = [];

    while (true) {
      const line = this.peek();
      if (!line || line.indent <= indent) break;
      this.index += 1;
      collected.push(line.text.slice(line.indent));
    }

    const text = folded ? collected.join(" ") : collected.join("\n");
    return chomp ? text : `${text}\n`;
  }

  atEnd(): boolean {
    return this.index >= this.lines.length;
  }

  currentLine(): number {
    return this.peek()?.number ?? 0;
  }
}

/** Parses the supported subset of YAML into plain JavaScript values. */
export function parseYaml(source: string): Result<unknown> {
  if (source.trim() === "") return err("Nothing to convert — the input is empty.");
  if (/^---\s*$/m.test(source.trim().split("\n").slice(1).join("\n"))) {
    return err("This reader handles a single document; the input has more than one.");
  }

  try {
    const lines = readLines(source.replace(/^---\s*\n/, ""));
    if (lines.length === 0) return ok(null);

    const parser = new Parser(lines);
    const value = parser.parseBlock(lines[0]!.indent);
    if (!parser.atEnd()) {
      throw new YamlError("Indentation does not line up with the block above", parser.currentLine());
    }
    return ok(value);
  } catch (cause) {
    return err(cause instanceof YamlError ? cause.message : String(cause));
  }
}

export function yamlToJson(source: string, indent = 2): Result<string> {
  const parsed = parseYaml(source);
  return parsed.ok ? ok(JSON.stringify(parsed.value, null, indent)) : parsed;
}

const PLAIN = /^[A-Za-z_][\w .-]*$/;

const needsQuotes = (value: string): boolean =>
  value === "" ||
  !PLAIN.test(value) ||
  ["true", "false", "null", "yes", "no", "on", "off", "~"].includes(value.toLowerCase()) ||
  /^-?\d/.test(value);

const quote = (value: string): string =>
  needsQuotes(value) ? JSON.stringify(value) : value;

function emit(value: unknown, depth: number): string {
  const pad = "  ".repeat(depth);

  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (typeof value === "string") return quote(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const childIndent = "  ".repeat(depth + 1);
    return value
      .map((item) => {
        const rendered = emit(item, depth + 1);
        if (!rendered.includes("\n") && !rendered.startsWith(" ")) return `${pad}- ${rendered}`;
        // The dash replaces the child's own indent, so "- " and the indent it
        // stands in for are the same width and the block stays aligned.
        const lines = rendered.split("\n");
        lines[0] = `${pad}- ${lines[0]!.slice(childIndent.length)}`;
        return lines.join("\n");
      })
      .join("\n");
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return "{}";
  return entries
    .map(([key, item]) => {
      const nested = item !== null && typeof item === "object" && Object.keys(item).length > 0;
      const rendered = emit(item, depth + 1);
      return nested ? `${pad}${quote(key)}:\n${rendered}` : `${pad}${quote(key)}: ${rendered}`;
    })
    .join("\n");
}

export function jsonToYaml(source: string): Result<string> {
  if (source.trim() === "") return err("Nothing to convert — the input is empty.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch (cause) {
    return err(`That is not valid JSON: ${cause instanceof Error ? cause.message : cause}`);
  }
  return ok(emit(parsed, 0));
}
