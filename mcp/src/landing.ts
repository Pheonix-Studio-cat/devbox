/**
 * The page behind the MCP address.
 *
 * The endpoint is for assistants, but people open it too — from a settings
 * field, a log line, a shared link — so it answers what they arrive asking:
 * what is this, where do I point a client, and what can it do.
 */
const TOOL_SUMMARY: ReadonlyArray<readonly [string, string]> = [
  ["json", "Format, minify, sort keys, inspect"],
  ["yaml", "YAML and JSON, both directions"],
  ["csv", "CSV and JSON, both directions"],
  ["base64", "Encode and decode, standard or URL-safe"],
  ["url", "Encode, decode, split a URL into its parts"],
  ["jwt", "Decode header and claims; never verifies"],
  ["regex", "Match, capture, replace"],
  ["diff", "Compare two texts, line by line"],
  ["hash", "SHA-1 through SHA-512"],
  ["random", "UUIDs and random tokens"],
  ["timestamp", "Unix time and ISO 8601"],
  ["color", "Hex, rgb, hsl, oklch, contrast"],
  ["number_base", "Decimal, hex, binary, octal"],
  ["qr", "QR codes, returned as a picture, with an optional icon"],
];

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"]/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] ?? character,
  );

export function landingPage(origin: string): string {
  const rows = TOOL_SUMMARY.map(
    ([name, what]) => `<tr><td><code>${name}</code></td><td>${escapeHtml(what)}</td></tr>`,
  ).join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Devhelper MCP</title>
<style>
  :root { color-scheme: dark light; --bg:#0d1117; --card:#151b23; --line:#263141;
    --text:#e6edf3; --muted:#8b98a9; --accent:#4c9aff; }
  @media (prefers-color-scheme: light) { :root { --bg:#f4f6fa; --card:#fff;
    --line:#d6dbe4; --text:#16202c; --muted:#5b6675; --accent:#0b62d6; } }
  body { margin:0; background:var(--bg); color:var(--text); line-height:1.55;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width:47rem; margin:0 auto; padding:2.5rem 1rem 3rem; }
  h1 { margin:0; font-size:1.7rem; letter-spacing:-0.02em; }
  p.lede { color:var(--muted); margin:.4rem 0 1.6rem; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px;
    padding:1rem 1.1rem; margin-bottom:1rem; }
  h2 { font-size:.78rem; text-transform:uppercase; letter-spacing:.07em;
    color:var(--muted); margin:0 0 .6rem; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:.9em; }
  .endpoint { display:block; font-size:1.05rem; color:var(--accent); word-break:break-all; }
  table { border-collapse:collapse; width:100%; }
  td { border-top:1px solid var(--line); padding:.35rem .5rem .35rem 0; vertical-align:top; }
  tr:first-child td { border-top:0; }
  td:first-child { width:9.5rem; color:var(--accent); }
  a { color:var(--accent); }
</style></head>
<body><main>
  <h1>Devhelper MCP</h1>
  <p class="lede">Developer tools an assistant can call directly: formats, hashes,
    timestamps, colours, QR codes. This address is the server, not a website to use by hand.</p>

  <div class="card">
    <h2>Endpoint</h2>
    <code class="endpoint">${escapeHtml(origin)}/mcp</code>
    <p style="margin:.6rem 0 0;color:var(--muted)">Paste that into the connector settings of
      ChatGPT, Claude, or any other MCP client.</p>
  </div>

  <div class="card">
    <h2>Tools</h2>
    <table>${rows}</table>
  </div>

  <div class="card">
    <h2>Notes</h2>
    <p style="margin:0;color:var(--muted)">Results come back as something you can see:
      the QR tool returns a picture, the rest return readable text. Nothing sent here is
      logged. The same tools, with a user interface, are at
      <a href="https://pheonix-studio-cat.github.io/devhelper/">the Devhelper app</a>.</p>
  </div>
</main></body></html>`;
}

