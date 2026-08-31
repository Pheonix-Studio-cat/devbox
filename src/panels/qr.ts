import { el } from "../dom";
import { formatBytes } from "../tools/image";
import { EC_LEVELS, encodeQr, qrToSvg, type EcLevel } from "../tools/qr";
import { action, choice, createWorkbench, number, pairs } from "../workbench";
import type { Panel } from "./types";

const LEVEL_NOTES: Record<EcLevel, string> = {
  L: "recovers about 7% damage",
  M: "recovers about 15% damage",
  Q: "recovers about 25% damage",
  H: "recovers about 30% damage",
};

export const qrPanel: Panel = {
  id: "qr",
  name: "QR codes",
  blurb: "Turn a link or a note into a scannable code.",
  render() {
    let level: EcLevel = "M";
    let scale = 8;

    const bench = createWorkbench({
      inputLabel: "Text or link",
      placeholder: "https://example.com",
      sample: "https://pheonix-studio-cat.github.io/devbox/",
    });

    const build = () => {
      const result = encodeQr(bench.input.value, level);
      if (!result.ok) {
        bench.setError(result.error);
        return;
      }

      const code = result.value;
      const svg = qrToSvg(code, { scale });
      const blob = new Blob([svg], { type: "image/svg+xml" });

      bench.setContent(
        el("img", {
          class: "qr-preview",
          alt: "QR code",
          src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
        }),
        pairs([
          ["Version", `${code.version} (${code.size}×${code.size} modules)`],
          ["Correction", `${code.ecLevel} — ${LEVEL_NOTES[code.ecLevel]}`],
          ["Encoded", `${code.bytes} bytes as UTF-8`],
          ["File size", formatBytes(new TextEncoder().encode(svg).length)],
        ]),
        el(
          "div",
          { class: "pane-actions spread" },
          el("a", { class: "download", href: URL.createObjectURL(blob), download: "qr.svg" }, "Download .svg"),
        ),
        el("pre", { class: "source" }, svg),
      );
    };

    bench.onRun(build);
    bench.toolbar.append(
      action("Make code", build, true),
      choice("Correction", EC_LEVELS, (value) => {
        level = value as EcLevel;
      }),
      number("Module px", scale, 1, 40, (value) => {
        scale = value;
      }),
    );

    return bench.root;
  },
};
