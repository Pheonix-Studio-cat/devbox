import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards the seam between the app and `mcp/`.
 *
 * The MCP server registers its tools by hand, because a tool needs a
 * description and a parameter schema and neither can be derived from a
 * TypeScript signature — the types are gone at runtime, and the description is
 * what tells a model when to reach for the tool at all. What can be automated
 * is noticing that a module was added and never exposed, which is what these
 * tests do.
 */

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const toolsDir = `${repoRoot}src/tools`;
const serverPath = `${repoRoot}mcp/src/index.ts`;

/** Modules with no MCP tool, and the reason. Everything else must be exposed. */
const EXEMPT: Record<string, string> = {
  result: "the shared Result type, not a tool",
  image: "starts from canvas pixel data, which Workers cannot produce",
  vectorize: "starts from canvas pixel data, which Workers cannot produce",
  quantize: "helper for vectorize, same constraint",
  trace: "helper for vectorize, same constraint",
};

/** Tools whose MCP name differs from the module name. */
const RENAMED: Record<string, string> = {
  numbers: "number_base",
};

const mcpNameFor = (module: string): string => RENAMED[module] ?? module;

const modules = readdirSync(toolsDir)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .map((name) => name.slice(0, -".ts".length))
  .sort();

const registered = new Set(
  [...readFileSync(serverPath, "utf8").matchAll(/registerTool\(\s*"([a-z0-9_]+)"/g)].map(
    (match) => match[1] as string,
  ),
);

describe("MCP coverage", () => {
  it("exposes every tool module, or records why not", () => {
    const missing = modules
      .filter((name) => !(name in EXEMPT))
      .filter((name) => !registered.has(mcpNameFor(name)));

    expect(
      missing,
      missing.length === 0
        ? ""
        : `These modules are not reachable over MCP: ${missing.join(", ")}. ` +
          "Register each one in mcp/src/index.ts with a description and an " +
          "input schema, or add it to EXEMPT in this file with the reason. " +
          "If its MCP tool is named differently, add the mapping to RENAMED.",
    ).toEqual([]);
  });

  it("registers no tool without a module behind it", () => {
    const expected = new Set(modules.map(mcpNameFor));
    const orphans = [...registered].filter((name) => !expected.has(name)).sort();

    expect(
      orphans,
      orphans.length === 0
        ? ""
        : `mcp/src/index.ts registers tools with no module in src/tools: ` +
          `${orphans.join(", ")}. Either the module was removed and the tool ` +
          "should go too, or the name drifted and RENAMED needs the mapping.",
    ).toEqual([]);
  });

  it("keeps the exempt list honest", () => {
    const stale = Object.keys(EXEMPT)
      .filter((name) => !modules.includes(name))
      .sort();

    expect(
      stale,
      stale.length === 0 ? "" : `EXEMPT names modules that no longer exist: ${stale.join(", ")}.`,
    ).toEqual([]);
  });
});
