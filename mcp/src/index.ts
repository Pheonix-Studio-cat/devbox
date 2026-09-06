/**
 * Devbox as a remote MCP server.
 *
 * Every tool here delegates to the same functions in `src/tools/` that the web
 * app calls. Nothing is reimplemented: the panels and this server are two front
 * ends over one library, so a fix in the library reaches both.
 *
 * Tools are grouped one-per-panel with an `operation` parameter rather than
 * split into one tool per function. Devbox has roughly fifty exported
 * operations; advertising each as its own MCP tool would spend a large share of
 * a model's context on tool definitions before any work started.
 */
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

import { decodeBase64, decodeBase64ToHex, encodeBase64 } from "../../src/tools/base64";
import { describeColor, parseColor } from "../../src/tools/color";
import { csvToJson, DELIMITERS, detectDelimiter, jsonToCsv } from "../../src/tools/csv";
import { diffLines, diffStats, toUnifiedDiff } from "../../src/tools/diff";
import { HASH_ALGORITHMS, hashAll, hashText } from "../../src/tools/hash";
import { formatJson, inspectJson, minifyJson, sortJsonKeys } from "../../src/tools/json";
import { decodeJwt } from "../../src/tools/jwt";
import { BIT_WIDTHS, describeNumber, parseNumber } from "../../src/tools/numbers";
import { EC_LEVELS, encodeQr, qrToSvg } from "../../src/tools/qr";
import { generateMany, randomToken, uuidV4 } from "../../src/tools/random";
import { findMatches, replaceMatches } from "../../src/tools/regex";
import type { Result } from "../../src/tools/result";
import { describeTimestamp, parseTimestamp } from "../../src/tools/timestamp";
import { buildQuery, decodeUrl, encodeUrl, parseUrl } from "../../src/tools/url";
import { jsonToYaml, yamlToJson } from "../../src/tools/yaml";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

/** A failed tool reports the library's own message rather than throwing. */
function failure(message: string): ToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

function textResult(text: string, structured?: Record<string, unknown>): ToolResult {
  return structured ? { content: [{ type: "text", text }], structuredContent: structured } : { content: [{ type: "text", text }] };
}

/** Unwraps a library `Result` into an MCP reply, keeping errors as errors. */
function fromResult(
  result: Result<string>,
  structured?: (value: string) => Record<string, unknown>,
): ToolResult {
  if (!result.ok) return failure(result.error);
  return textResult(result.value, structured?.(result.value));
}

/** Objects are echoed as pretty JSON so a text-only client still sees them. */
function objectResult(value: Record<string, unknown>): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value };
}

function createServer() {
  const server = new McpServer({ name: "devbox", version: "0.1.0" });

  // -- JSON ---------------------------------------------------------------
  server.registerTool(
    "json",
    {
      description:
        "Work with a JSON document: 'format' pretty-prints it, 'minify' strips whitespace, " +
        "'sort_keys' orders every object's keys recursively, and 'inspect' reports type, key " +
        "count, array items, nesting depth and byte size without returning the payload. " +
        "Syntax errors come back with a line and column.",
      inputSchema: {
        operation: z.enum(["format", "minify", "sort_keys", "inspect"]),
        input: z.string().describe("The JSON document"),
        indent: z.number().int().min(0).max(8).optional().describe("Spaces per level, default 2"),
      },
    },
    async ({ operation, input, indent }) => {
      const spaces = indent ?? 2;
      switch (operation) {
        case "format":
          return fromResult(formatJson(input, spaces));
        case "minify":
          return fromResult(minifyJson(input));
        case "sort_keys":
          return fromResult(sortJsonKeys(input, spaces));
        case "inspect": {
          const stats = inspectJson(input);
          return stats.ok ? objectResult({ ...stats.value }) : failure(stats.error);
        }
      }
    },
  );

  // -- Base64 -------------------------------------------------------------
  server.registerTool(
    "base64",
    {
      description:
        "Base64 for UTF-8 text. 'encode' and 'decode' handle both the standard and the URL-safe " +
        "alphabet; 'decode_to_hex' is for payloads that are not text and returns a hex dump.",
      inputSchema: {
        operation: z.enum(["encode", "decode", "decode_to_hex"]),
        input: z.string(),
        urlSafe: z.boolean().optional().describe("Encode with the URL-safe alphabet"),
      },
    },
    async ({ operation, input, urlSafe }) => {
      switch (operation) {
        case "encode":
          return fromResult(encodeBase64(input, urlSafe ?? false));
        case "decode":
          return fromResult(decodeBase64(input));
        case "decode_to_hex":
          return fromResult(decodeBase64ToHex(input));
      }
    },
  );

  // -- URLs ---------------------------------------------------------------
  server.registerTool(
    "url",
    {
      description:
        "URL handling. 'encode'/'decode' percent-escape text. 'parse' splits a URL into its " +
        "components and lists query parameters, keeping repeated keys separate instead of " +
        "collapsing them. 'build_query' turns key=value lines into a query string.",
      inputSchema: {
        operation: z.enum(["encode", "decode", "parse", "build_query"]),
        input: z.string(),
      },
    },
    async ({ operation, input }) => {
      switch (operation) {
        case "encode":
          return fromResult(encodeUrl(input));
        case "decode":
          return fromResult(decodeUrl(input));
        case "build_query":
          return fromResult(buildQuery(input));
        case "parse": {
          const parsed = parseUrl(input);
          return parsed.ok
            ? objectResult({ parts: parsed.value.parts, query: parsed.value.query })
            : failure(parsed.error);
        }
      }
    },
  );

  // -- JWT ----------------------------------------------------------------
  server.registerTool(
    "jwt",
    {
      description:
        "Decodes a JWT for inspection: header, claims, and iat/nbf/exp as readable dates with an " +
        "expiry flag. A leading 'Bearer ' is tolerated. The signature is returned verbatim and is " +
        "NOT verified -- that needs the signing key.",
      inputSchema: { token: z.string().describe("The JWT, optionally prefixed with 'Bearer '") },
    },
    async ({ token }) => {
      const decoded = decodeJwt(token);
      if (!decoded.ok) return failure(decoded.error);
      const { header, payload, signature, issuedAt, notBefore, expiresAt, isExpired } = decoded.value;
      return objectResult({
        header,
        payload,
        signature,
        issuedAt: issuedAt?.toISOString() ?? null,
        notBefore: notBefore?.toISOString() ?? null,
        expiresAt: expiresAt?.toISOString() ?? null,
        isExpired,
      });
    },
  );

  // -- Hashes -------------------------------------------------------------
  server.registerTool(
    "hash",
    {
      description:
        "Hashes UTF-8 text with the Web Crypto API and returns lowercase hex. Pass 'all' to get " +
        "every algorithm at once for side-by-side comparison.",
      inputSchema: {
        input: z.string(),
        algorithm: z.enum([...HASH_ALGORITHMS, "all"]).optional().describe("Default SHA-256"),
      },
    },
    async ({ input, algorithm }) => {
      const choice = algorithm ?? "SHA-256";
      if (choice === "all") return objectResult({ ...(await hashAll(input)) });
      const digest = await hashText(input, choice);
      return digest.ok ? textResult(digest.value, { algorithm: choice, hex: digest.value }) : failure(digest.error);
    },
  );

  // -- UUIDs and tokens ---------------------------------------------------
  server.registerTool(
    "random",
    {
      description:
        "Generates version 4 UUIDs or random secrets from the platform CSPRNG. 'bytes' is the " +
        "entropy drawn, not the rendered length.",
      inputSchema: {
        operation: z.enum(["uuid", "token"]),
        count: z.number().int().min(1).max(100).optional().describe("How many, default 1"),
        bytes: z.number().int().min(1).max(1024).optional().describe("Entropy per token, default 32"),
        encoding: z.enum(["hex", "base64url", "alphanumeric"]).optional().describe("Default hex"),
      },
    },
    async ({ operation, count, bytes, encoding }) => {
      const howMany = count ?? 1;
      const values =
        operation === "uuid"
          ? generateMany(howMany, uuidV4)
          : generateMany(howMany, () => randomToken(bytes ?? 32, encoding ?? "hex"));
      return textResult(values.join("\n"), { values });
    },
  );

  // -- Timestamps ---------------------------------------------------------
  server.registerTool(
    "timestamp",
    {
      description:
        "Converts between Unix seconds, Unix milliseconds and ISO 8601, and describes the instant " +
        "in UTC and local time with a relative phrase. Accepts 'now', a bare number, or anything " +
        "Date can parse. Bare numbers are read as milliseconds once they pass the year 5138.",
      inputSchema: { input: z.string().describe("'now', Unix seconds/millis, or an ISO 8601 date") },
    },
    async ({ input }) => {
      const parsed = parseTimestamp(input);
      return parsed.ok ? objectResult({ ...describeTimestamp(parsed.value) }) : failure(parsed.error);
    },
  );

  // -- CSV ----------------------------------------------------------------
  server.registerTool(
    "csv",
    {
      description:
        "Converts between CSV and JSON with RFC 4180 quoting. 'to_json' yields objects when there " +
        "is a header row and arrays otherwise; 'to_csv' accepts an array of objects or of arrays. " +
        "'detect_delimiter' reports which separator the text appears to use.",
      inputSchema: {
        operation: z.enum(["to_json", "to_csv", "detect_delimiter"]),
        input: z.string(),
        delimiter: z.enum(Object.keys(DELIMITERS) as [string, ...string[]]).optional().describe("Default: detected for to_json, comma for to_csv"),
        header: z.boolean().optional().describe("to_json: treat row one as column names, default true"),
        typed: z.boolean().optional().describe("to_json: convert numbers and booleans, default true"),
      },
    },
    async ({ operation, input, delimiter, header, typed }) => {
      const separator = delimiter ? DELIMITERS[delimiter as keyof typeof DELIMITERS] : undefined;
      switch (operation) {
        case "to_json":
          return fromResult(csvToJson(input, { delimiter: separator, header, typed }));
        case "to_csv":
          return fromResult(jsonToCsv(input, separator ?? ","));
        case "detect_delimiter": {
          const found = detectDelimiter(input);
          const name = Object.entries(DELIMITERS).find(([, value]) => value === found)?.[0] ?? "comma";
          return textResult(name, { delimiter: name, character: found });
        }
      }
    },
  );

  // -- Colours ------------------------------------------------------------
  server.registerTool(
    "color",
    {
      description:
        "Reads a colour in hex, rgb() or hsl() and returns every representation (hex, rgb, hsl, " +
        "oklch) plus its WCAG contrast ratio against white and black, rated separately -- the two " +
        "verdicts often differ sharply.",
      inputSchema: { input: z.string().describe("e.g. '#3b82f6', 'rgb(59 130 246)', 'hsl(217 91% 60%)'") },
    },
    async ({ input }) => {
      const parsed = parseColor(input);
      return parsed.ok ? objectResult({ ...describeColor(parsed.value) }) : failure(parsed.error);
    },
  );

  // -- Number bases -------------------------------------------------------
  server.registerTool(
    "number_base",
    {
      description:
        "Converts a number between decimal, hex, binary and octal using BigInt, and gives the " +
        "two's-complement reading at a chosen bit width. Accepts 0x/0b/0o prefixes; underscores " +
        "and spaces may be used as digit separators.",
      inputSchema: {
        input: z.string().describe("e.g. '255', '0xff', '0b1111_1111'"),
        width: z.union([z.literal(8), z.literal(16), z.literal(32), z.literal(64)]).optional().describe("Bit width for the signed reading, default 32"),
      },
    },
    async ({ input, width }) => {
      const parsed = parseNumber(input);
      if (!parsed.ok) return failure(parsed.error);
      return objectResult({ ...describeNumber(parsed.value, width ?? 32) });
    },
  );

  // -- YAML ---------------------------------------------------------------
  server.registerTool(
    "yaml",
    {
      description:
        "Converts between YAML and JSON over a documented subset of YAML: mappings, sequences, " +
        "block and flow style, quoted and plain scalars, comments and anchorless documents. " +
        "Multi-document streams are rejected rather than silently truncated.",
      inputSchema: {
        operation: z.enum(["to_json", "to_yaml"]),
        input: z.string(),
        indent: z.number().int().min(0).max(8).optional().describe("to_json: spaces per level, default 2"),
      },
    },
    async ({ operation, input, indent }) =>
      operation === "to_json" ? fromResult(yamlToJson(input, indent ?? 2)) : fromResult(jsonToYaml(input)),
  );

  // -- Regular expressions ------------------------------------------------
  server.registerTool(
    "regex",
    {
      description:
        "Tests a regular expression. 'match' returns each match with its offset and its numbered " +
        "and named capture groups; 'replace' applies a replacement where $1 and $<name> work as " +
        "usual. Matching stops at 1000 hits and says so.",
      inputSchema: {
        operation: z.enum(["match", "replace"]),
        pattern: z.string().describe("The pattern, without delimiters"),
        text: z.string().describe("The text to search"),
        flags: z.string().optional().describe("e.g. 'gim', default 'g'"),
        replacement: z.string().optional().describe("Required for 'replace'"),
      },
    },
    async ({ operation, pattern, text, flags, replacement }) => {
      const activeFlags = flags ?? "g";
      if (operation === "replace") {
        if (replacement === undefined) return failure("'replace' needs a replacement string.");
        return fromResult(replaceMatches(pattern, activeFlags, text, replacement));
      }
      const report = findMatches(pattern, activeFlags, text);
      if (!report.ok) return failure(report.error);
      return objectResult({
        count: report.value.matches.length,
        truncated: report.value.truncated,
        matches: report.value.matches,
      });
    },
  );

  // -- Text comparison ----------------------------------------------------
  server.registerTool(
    "diff",
    {
      description:
        "Compares two texts line by line with a longest-common-subsequence diff. 'unified' returns " +
        "a patch-style diff with context, 'stats' returns only the added/removed/unchanged counts, " +
        "and 'changes' returns every line tagged -- verbose, so prefer 'unified' for large inputs.",
      inputSchema: {
        operation: z.enum(["unified", "stats", "changes"]).optional().describe("Default 'unified'"),
        before: z.string(),
        after: z.string(),
        context: z.number().int().min(0).max(20).optional().describe("unified: context lines, default 3"),
        ignoreWhitespace: z.boolean().optional(),
        ignoreCase: z.boolean().optional(),
      },
    },
    async ({ operation, before, after, context, ignoreWhitespace, ignoreCase }) => {
      const changes = diffLines(before, after, { ignoreWhitespace, ignoreCase });
      if (!changes.ok) return failure(changes.error);
      const stats = diffStats(changes.value);
      switch (operation ?? "unified") {
        case "stats":
          return objectResult({ ...stats });
        case "changes":
          return objectResult({ ...stats, changes: changes.value });
        default: {
          const patch = toUnifiedDiff(changes.value, context ?? 3);
          return textResult(patch === "" ? "The two texts are identical." : patch, { ...stats });
        }
      }
    },
  );

  // -- QR codes -----------------------------------------------------------
  server.registerTool(
    "qr",
    {
      description:
        "Encodes text as a byte-mode QR code up to version 10 and returns it as a scalable SVG. " +
        "Higher correction levels survive more damage but hold less data: L about 7 percent, " +
        "M 15, Q 25, H 30.",
      inputSchema: {
        text: z.string().describe("What the code should carry"),
        ecLevel: z.enum(EC_LEVELS).optional().describe("Error correction, default M"),
        scale: z.number().int().min(1).max(32).optional().describe("Pixels per module, default 8"),
        quietZone: z.number().int().min(0).max(16).optional().describe("Margin in modules, default 4"),
      },
    },
    async ({ text, ecLevel, scale, quietZone }) => {
      const code = encodeQr(text, ecLevel ?? "M");
      if (!code.ok) return failure(code.error);
      const svg = qrToSvg(code.value, { scale: scale ?? 8, quietZone: quietZone ?? 4 });
      return textResult(svg, { version: code.value.version, ecLevel: code.value.ecLevel, size: code.value.size, svg });
    },
  );

  return server;
}

const handler = createMcpHandler(createServer);

export default {
  fetch(request: Request, env: unknown, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return new Response(
        `Devbox MCP server.\n\nEndpoint: ${url.origin}/mcp\nThe app itself: https://pheonix-studio-cat.github.io/devbox/\n`,
        { headers: { "content-type": "text/plain; charset=utf-8" } },
      );
    }
    return handler(request, env, ctx);
  },
};
