# Devhelper

Developer tools that run entirely in the browser tab, plus the same tools as a
remote MCP server. `src/tools/` holds pure logic; `src/panels/` and `mcp/` are
two front ends over it. Nothing is reimplemented in either front end.

## MCP endpoints are for assistants — build them that way

Every MCP address in this project exists so an AI assistant can use it. That
changes what a good result looks like, and the rule for anything added here is:

**Return something the assistant can show.** A chat window displays an image
block; it does not display an SVG string, which arrives as a wall of path data.
Anything worth looking at goes back as PNG (`src/tools/png.ts`), with the exact
source alongside for whoever wants it. See the `qr` tool for the shape of it:
an image block, then a caption that says in words what was made and what it
cost, then the structured content.

**Say what happened, not just what came out.** The caption is what the person
reads. `QR code, version 5, level H; the icon covers 81 modules and spends 4 of
the 11 repairs available` beats handing back a blob and letting the model guess.

**Refuse clearly instead of returning something broken.** When a request cannot
work — a logo that would stop the code scanning, text too long for the version —
fail with the reason *and the way out* ("use at most 35%, or switch to level H").
The model relays that to the person; a silent bad result does not get caught.

**The address itself is a page.** A person will open it: from a settings field,
a log line, a shared link. `/` answers what this is, where to point a client,
and what it can do. Not a bare string.

**Group tools by panel, with an `operation` parameter.** Roughly fifty exported
operations as fifty tools would spend a model's context on definitions before
any work started. `src/tools/mcp-coverage.test.ts` fails when a module is added
and never exposed; register it or record why not.

## Conventions

- No runtime dependencies in the app. Build-time only.
- The root `index.html` is generated (`npm run build`) and committed, so GitHub
  Pages serves a working app in either of its two modes. CI fails if it is stale.
- `base` is relative, so the build works at any path and renaming the
  repository breaks nothing.
- Verify against something outside this codebase where one exists. The QR
  encoder is checked module-for-module against an independent encoder, the PNG
  renderer against a browser's rendering of the same SVG. A check that uses the
  same assumptions as the code proves nothing — that mistake shipped a QR
  encoder that passed its own tests and scanned nowhere.
