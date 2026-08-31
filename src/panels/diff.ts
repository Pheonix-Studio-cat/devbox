import { el } from "../dom";
import { diffLines, diffStats, toUnifiedDiff, type Change } from "../tools/diff";
import { action, createDualWorkbench, number, pairs, toggle } from "../workbench";
import type { Panel } from "./types";

const SAMPLE: readonly [string, string] = [
  `name: devbox
tools: 12
offline: true
license: Apache-2.0`,
  `name: devbox
tools: 16
offline: true
tracking: none
license: Apache-2.0`,
];

const SYMBOLS = { equal: " ", added: "+", removed: "-" } as const;

export const diffPanel: Panel = {
  id: "diff",
  name: "Compare text",
  blurb: "Find what changed between two versions, line by line.",
  render() {
    let context = 3;
    let ignoreWhitespace = false;
    let ignoreCase = false;

    const bench = createDualWorkbench("Before", "After", SAMPLE);

    const compute = (): Change[] | null => {
      const result = diffLines(bench.left.value, bench.right.value, {
        ignoreWhitespace,
        ignoreCase,
      });
      if (!result.ok) {
        bench.setError(result.error);
        return null;
      }
      return result.value;
    };

    const render = () => {
      const changes = compute();
      if (!changes) return;

      const stats = diffStats(changes);
      if (stats.added === 0 && stats.removed === 0) {
        bench.setContent(el("p", { class: "badge good" }, "The two texts are identical"));
        return;
      }

      const rows = el("div", { class: "difflines" });
      for (const change of changes) {
        rows.append(
          el(
            "div",
            { class: `diffline ${change.kind}` },
            el("span", { class: "gutter" }, change.left === null ? "" : String(change.left)),
            el("span", { class: "gutter" }, change.right === null ? "" : String(change.right)),
            el("span", { class: "sign" }, SYMBOLS[change.kind]),
            el("span", { class: "text" }, change.text === "" ? " " : change.text),
          ),
        );
      }

      bench.setContent(
        pairs([
          ["Added", `${stats.added} lines`],
          ["Removed", `${stats.removed} lines`],
          ["Unchanged", `${stats.unchanged} lines`],
        ]),
        rows,
      );
    };

    const unified = () => {
      const changes = compute();
      if (!changes) return;
      const patch = toUnifiedDiff(changes, context);
      if (patch === "") {
        bench.setContent(el("p", { class: "badge good" }, "The two texts are identical"));
        return;
      }
      bench.setOutput(patch);
    };

    bench.onRun(render);
    bench.toolbar.append(
      action("Compare", render, true),
      action("Unified diff", unified),
      number("Context", context, 0, 20, (value) => {
        context = value;
      }),
      toggle("Ignore whitespace", ignoreWhitespace, (value) => {
        ignoreWhitespace = value;
      }),
      toggle("Ignore case", ignoreCase, (value) => {
        ignoreCase = value;
      }),
    );

    return bench.root;
  },
};
