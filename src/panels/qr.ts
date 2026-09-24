import { el } from "../dom";
import { ICONS, type Icon } from "../tools/icons";
import { formatBytes } from "../tools/image";
import {
  assessLogo,
  EC_LEVELS,
  encodeQr,
  largestSafeCoverage,
  qrToSvg,
  type EcLevel,
  type QrLogo,
} from "../tools/qr";
import { action, choice, createWorkbench, number, pairs } from "../workbench";
import type { Panel } from "./types";

const LEVEL_NOTES: Record<EcLevel, string> = {
  L: "recovers about 7% damage",
  M: "recovers about 15% damage",
  Q: "recovers about 25% damage",
  H: "recovers about 30% damage",
};

const SHAPES = ["circle", "square", "none"] as const;
type Shape = (typeof SHAPES)[number];

export const qrPanel: Panel = {
  id: "qr",
  name: "QR codes",
  blurb: "Turn a link or a note into a code, with an icon in the middle.",
  render() {
    let level: EcLevel = "H";
    let scale = 8;
    let icon: Icon | null = null;
    let coverage = 20;
    let shape: Shape = "circle";

    const bench = createWorkbench({
      inputLabel: "Text or link",
      placeholder: "https://example.com",
      sample: "https://pheonix-studio-cat.github.io/devhelper/",
    });

    const build = () => {
      const result = encodeQr(bench.input.value, level);
      if (!result.ok) {
        bench.setError(result.error);
        return;
      }

      const code = result.value;
      const fraction = coverage / 100;
      const damage = icon ? assessLogo(code, fraction) : null;

      const logo: QrLogo | undefined = icon
        ? { body: icon.body, coverage: fraction, shape }
        : undefined;
      const svg = qrToSvg(code, { scale, ...(logo ? { logo } : {}) });
      const blob = new Blob([svg], { type: "image/svg+xml" });

      const rows: Array<readonly [string, string]> = [
        ["Version", `${code.version} (${code.size}×${code.size} modules)`],
        ["Correction", `${code.ecLevel} — ${LEVEL_NOTES[code.ecLevel]}`],
        ["Encoded", `${code.bytes} bytes as UTF-8`],
        ["File size", formatBytes(new TextEncoder().encode(svg).length)],
      ];

      let verdict: HTMLElement | null = null;
      if (damage) {
        const largest = Math.round(largestSafeCoverage(code) * 100);
        rows.push(
          ["Icon covers", `${damage.coveredModules} modules`],
          [
            "Repairs used",
            `${damage.worstBlock} of ${damage.capacityPerBlock} in the worst block`,
          ],
          ["Largest that still scans", `${largest}% at level ${code.ecLevel}`],
        );

        verdict = damage.readable
          ? el(
              "p",
              { class: damage.headroom >= 2 ? "badge good" : "badge neutral" },
              damage.headroom >= 2
                ? `Scans, with ${damage.headroom} repairs to spare`
                : `Scans, but only just — ${damage.headroom} repair to spare`,
            )
          : el(
              "p",
              { class: "badge danger" },
              `Will not scan — shrink the icon to ${largest}% or use level H`,
            );
      }

      bench.setContent(
        ...(verdict ? [verdict] : []),
        el("img", {
          class: "qr-preview",
          alt: "QR code",
          src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
        }),
        pairs(rows),
        el(
          "div",
          { class: "pane-actions spread" },
          el("a", { class: "download", href: URL.createObjectURL(blob), download: "qr.svg" }, "Download .svg"),
        ),
        el("pre", { class: "source" }, svg),
      );
    };

    // The icon picker draws each shape at the size it will actually appear.
    const picker = el("div", { class: "iconpicker" });
    const buttons = new Map<string | null, HTMLButtonElement>();

    const select = (next: Icon | null): void => {
      icon = next;
      for (const [id, button] of buttons) {
        button.classList.toggle("active", id === (next?.id ?? null));
      }
      build();
    };

    /**
     * Icons are SVG markup, and SVG elements need their own namespace —
     * document.createElement("svg") makes an unknown HTML element that draws
     * nothing. Parsing gives properly namespaced nodes to import.
     */
    const glyphOf = (body: string): Node => {
      const parsed = new DOMParser().parseFromString(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22">${body}</svg>`,
        "image/svg+xml",
      );
      return document.importNode(parsed.documentElement, true);
    };

    const tile = (id: string | null, label: string, body: string): HTMLButtonElement => {
      const button = el(
        "button",
        {
          type: "button",
          class: "icontile",
          title: label,
          "aria-label": label,
          onclick: () => select(id === null ? null : (ICONS.find((entry) => entry.id === id) ?? null)),
        },
        glyphOf(body),
      );
      buttons.set(id, button);
      return button;
    };

    picker.append(
      tile(
        null,
        "No icon",
        '<path d="M5 5l14 14M19 5L5 19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
      ),
      ...ICONS.map((entry) => tile(entry.id, entry.label, entry.body)),
    );
    buttons.get(null)?.classList.add("active");

    bench.onRun(build);
    bench.toolbar.append(
      action("Make code", build, true),
      choice("Correction", EC_LEVELS, (value) => {
        level = value as EcLevel;
        build();
      }, "H"),
      number("Icon size %", coverage, 5, 40, (value) => {
        coverage = value;
        build();
      }),
      choice("Plate", SHAPES, (value) => {
        shape = value as Shape;
        build();
      }),
      number("Module px", scale, 1, 40, (value) => {
        scale = value;
      }),
    );

    bench.root.insertBefore(
      el(
        "div",
        { class: "iconrow" },
        el("span", { class: "muted" }, "Icon in the middle"),
        picker,
      ),
      bench.root.children[1] ?? null,
    );

    return bench.root;
  },
};
