# Devbox MCP server

Devbox's tools as a remote [MCP](https://modelcontextprotocol.io) server on
Cloudflare Workers, so an AI assistant can use them directly instead of
guessing at JSON structure or hand-rolling a base64 decode.

Every tool delegates to the same functions in `../src/tools/` that the web app
calls. Nothing is reimplemented — the panels and this server are two front ends
over one library, so a fix in the library reaches both.

## Read this before you deploy it

The app's promise is that the page is static and your input never leaves the
tab. **This server does not make that promise, and cannot.** An MCP tool call
is a network request: whatever you pass travels to the Worker, is processed
there, and travels back. That is the nature of remote MCP, not a shortcoming of
this implementation.

That is an acceptable trade in the case this is built for — an assistant that
is already holding your data in its context — and a bad one if you were
reaching for Devbox precisely because you did not want a server involved. For
that, use the app.

What is done to keep the exposure small:

- Request logging is off (`observability.enabled: false` in `wrangler.jsonc`).
  Turning it on records metadata about calls; it does not record tool inputs,
  but the safest posture is to leave it off.
- The Worker is stateless and holds no storage bindings. Nothing is written
  anywhere.
- No outbound requests are made. Input goes to the tool function and back.

The endpoint is public once deployed: anyone with the URL can call the tools.
For a server that only does pure computation on input the caller already has,
that is a small exposure — but if you want it closed, put
[Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/) in front
of it.

## Deploy

```bash
cd mcp
npm install
npx wrangler login     # once
npm run deploy
```

Wrangler prints the URL. The MCP endpoint is that URL plus `/mcp`:

```
https://devbox-mcp.<your-subdomain>.workers.dev/mcp
```

Change `name` in `wrangler.jsonc` to change the first part of that address.

## Develop

```bash
npm run dev            # http://localhost:8788, endpoint /mcp
npm run typecheck
```

A call without a client:

```bash
curl -s -X POST http://localhost:8787/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Or interactively with `npx @modelcontextprotocol/inspector@latest`.

## Connect a client

Clients that speak remote MCP take the URL directly. For clients that only run
local servers, proxy it:

```json
{
  "mcpServers": {
    "devbox": {
      "command": "npx",
      "args": ["-y", "mcp-remote@latest", "https://devbox-mcp.<your-subdomain>.workers.dev/mcp"]
    }
  }
}
```

## Tools

Fourteen tools, one per panel in the app. Each takes an `operation` where the
panel has several modes.

| Tool | Operations |
| --- | --- |
| `json` | `format`, `minify`, `sort_keys`, `inspect` |
| `base64` | `encode`, `decode`, `decode_to_hex` |
| `url` | `encode`, `decode`, `parse`, `build_query` |
| `jwt` | decode header, claims and dates (signature is **not** verified) |
| `hash` | SHA-1/256/384/512, or `all` at once |
| `random` | `uuid`, `token` (hex, base64url, alphanumeric) |
| `timestamp` | Unix seconds/millis and ISO 8601, both directions |
| `csv` | `to_json`, `to_csv`, `detect_delimiter` |
| `color` | hex, rgb, hsl, oklch, plus WCAG contrast on white and black |
| `number_base` | decimal, hex, binary, octal, and the signed reading |
| `yaml` | `to_json`, `to_yaml` |
| `regex` | `match` with capture groups, `replace` |
| `diff` | `unified`, `stats`, `changes` |
| `qr` | text to a scalable SVG, correction levels L/M/Q/H |

They are grouped one-per-panel rather than one-per-function on purpose. Devbox
exports roughly fifty operations; advertising each as its own MCP tool would
spend a large share of a model's context on tool definitions before any work
started.

## Adding a tool

Writing a module in `src/tools/` does **not** expose it here. Registration is by
hand, in `createServer()`:

```ts
server.registerTool(
  "password",
  {
    description: "What it does, and when a model should reach for it.",
    inputSchema: {
      length: z.number().int().min(8).max(128).describe("Characters to generate"),
    },
  },
  async ({ length }) => {
    const result = generatePassword(length);
    return result.ok
      ? { content: [{ type: "text", text: result.value }] }
      : { isError: true, content: [{ type: "text", text: result.error }] };
  },
);
```

This step is deliberate rather than generated. A tool needs a description and a
parameter schema, and neither can be derived from a TypeScript signature — the
types are gone at runtime, and the description is the part that tells a model
when to reach for the tool at all. Generating it would produce fourteen tools
no model could choose between.

What *is* automated is noticing you forgot. `src/tools/mcp-coverage.test.ts`
fails when a module has no MCP tool, when a tool has no module, or when the
exempt list names something that no longer exists:

```
These modules are not reachable over MCP: password. Register each one in
mcp/src/index.ts with a description and an input schema, or add it to EXEMPT
in this file with the reason.
```

It runs in the repo's normal test suite, so CI catches it on the pull request.
A tool that should stay out of the server goes in that file's `EXEMPT` map with
its reason; one whose MCP name differs from its module name goes in `RENAMED`.

## What is not here

**The two image tools.** Image formats and image-to-SVG both start from pixel
data that the app gets from a canvas, and Workers have no canvas. Exposing them
would mean shipping an image decoder to decode what the browser decodes for
free. They stay in the app.

**A local timezone.** The `timestamp` tool's `local` field is the *Worker's*
local time, which is UTC. In the browser it is genuinely yours. Read `iso` and
`utc` as authoritative here.

## Adding a second server

Deployment is not tied to this directory. `.github/workflows/deploy-workers.yml`
finds every directory in the repository that holds a wrangler config and deploys
each one, so a second server is a second directory:

```
wetter/
  wrangler.jsonc      { "name": "wetter", "main": "src/index.ts", ... }
  package.json
  src/index.ts
```

Push that to `main` and it comes up at `https://wetter.<your-subdomain>.workers.dev`
without touching the workflow or the Cloudflare dashboard. The `name` in the
wrangler config decides the address, so it must be unique across the account.

The workflow needs `CLOUDFLARE_API_TOKEN` as a repository secret; its header
comment explains how to create one.

## Layout

This is a separate npm package inside the repo. It has its own dependencies, so
installing or building the app does not pull in Wrangler and the MCP SDK, and
the app's own bundle stays free of runtime dependencies. The root `tsconfig.json`
covers `src` only, so `npm run typecheck` and CI at the root are unaffected.
