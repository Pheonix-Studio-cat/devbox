import { el } from "../dom";
import { describeColor, parseColor } from "../tools/color";
import { action, createWorkbench, pairs } from "../workbench";
import type { Panel } from "./types";

export const colorPanel: Panel = {
  id: "color",
  name: "Colours",
  blurb: "Convert between hex, rgb, hsl and oklch, with contrast ratings.",
  render() {
    const bench = createWorkbench({
      inputLabel: "Colour",
      placeholder: "#3b82f6, rgb(59 130 246) or hsl(217 91% 60%)",
      sample: "#3b82f6",
    });

    const convert = () => {
      const parsed = parseColor(bench.input.value);
      if (!parsed.ok) {
        bench.setError(parsed.error);
        return;
      }

      const view = describeColor(parsed.value);
      bench.setContent(
        el("div", { class: "swatch", style: `background:${view.hex}` }),
        pairs([
          ["Hex", view.hex],
          ["RGB", view.rgb],
          ["HSL", view.hsl],
          ["Oklch", view.oklch],
        ]),
        el("h4", {}, "Contrast"),
        pairs([
          ["On white", `${view.onWhite}:1 — ${view.onWhiteRating}`],
          ["On black", `${view.onBlack}:1 — ${view.onBlackRating}`],
        ]),
        el(
          "p",
          { class: "muted" },
          "WCAG 2.1 wants 4.5:1 for body text and 3:1 for large text.",
        ),
      );
    };

    bench.onRun(convert);
    bench.toolbar.append(action("Convert", convert, true));

    return bench.root;
  },
};
