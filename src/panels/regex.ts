import { clear, el } from "../dom";
import { findMatches, replaceMatches, segment } from "../tools/regex";
import { action, pairs } from "../workbench";
import type { Panel } from "./types";

const FLAGS: ReadonlyArray<readonly [string, string]> = [
  ["i", "ignore case"],
  ["m", "^ and $ match each line"],
  ["s", ". matches newlines"],
  ["u", "unicode"],
];

/**
 * Matching runs on this thread. A pattern that backtracks catastrophically —
 * (a+)+$ against a run of a's is the classic — can therefore hang the tab, so
 * the text is capped and the panel says so rather than pretending otherwise.
 */
const MAX_TEXT = 100_000;

const SAMPLE_PATTERN = "(?<user>[\\w.]+)@(?<host>[\\w.]+)";
const SAMPLE_TEXT = `ada@example.com wrote on Tuesday
grace@navy.mil replied, cc alan@bletchley.uk
no address on this line`;

export const regexPanel: Panel = {
  id: "regex",
  name: "Regex tester",
  blurb: "Try a pattern against real text and see what it matches.",
  render() {
    const flags = new Set<string>();

    const pattern = el("input", {
      type: "text",
      class: "line-input mono",
      spellcheck: "false",
      placeholder: "\\d{4}-\\d{2}-\\d{2}",
      "aria-label": "Pattern",
    });
    const replacement = el("input", {
      type: "text",
      class: "line-input mono",
      spellcheck: "false",
      placeholder: "$<host> — $<user>",
      "aria-label": "Replacement",
    });
    const subject = el("textarea", {
      class: "pane-body input short",
      spellcheck: "false",
      "aria-label": "Text to search",
      placeholder: "Paste the text to search…",
    });

    const output = el("div", { class: "pane-body output", "aria-live": "polite" });
    const status = el("p", { class: "status" });
    const toolbar = el("div", { class: "toolbar" });

    const fail = (message: string): void => {
      clear(output);
      status.textContent = message;
      status.className = "status error";
    };

    const show = (...nodes: Array<Node | string>): void => {
      clear(output);
      for (const node of nodes) output.append(node);
      status.textContent = "";
      status.className = "status";
    };

    const test = () => {
      if (subject.value.length > MAX_TEXT) {
        fail(`That is ${subject.value.length.toLocaleString()} characters; the limit is ${MAX_TEXT.toLocaleString()}.`);
        return;
      }

      const result = findMatches(pattern.value, [...flags].join(""), subject.value);
      if (!result.ok) {
        fail(result.error);
        return;
      }

      const { matches, truncated } = result.value;
      if (matches.length === 0) {
        show(el("p", { class: "badge neutral" }, "No matches"));
        return;
      }

      const highlighted = el("pre", { class: "highlight" });
      for (const part of segment(subject.value, matches)) {
        highlighted.append(
          part.matched ? el("mark", {}, part.text) : document.createTextNode(part.text),
        );
      }

      const list = el("div", { class: "matches" });
      matches.slice(0, 50).forEach((match, index) => {
        const rows: Array<readonly [string, string]> = [
          ["Match", match.text],
          ["At", String(match.index)],
          ...match.captures.map(
            (capture) => [capture.name, capture.value ?? "— did not match"] as const,
          ),
        ];
        list.append(el("h4", {}, `Match ${index + 1}`), pairs(rows));
      });

      show(
        el(
          "p",
          { class: "badge good" },
          `${matches.length} match${matches.length === 1 ? "" : "es"}${truncated ? " (stopped at the limit)" : ""}`,
        ),
        highlighted,
        list,
      );
    };

    const replace = () => {
      const result = replaceMatches(
        pattern.value,
        [...flags].join(""),
        subject.value,
        replacement.value,
      );
      if (result.ok) {
        show(el("pre", {}, result.value));
      } else {
        fail(result.error);
      }
    };

    for (const box of [pattern, replacement]) {
      box.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          test();
        }
      });
    }
    subject.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        test();
      }
    });

    toolbar.append(
      action("Test", test, true),
      action("Replace", replace),
      action("Load sample", () => {
        pattern.value = SAMPLE_PATTERN;
        replacement.value = "$<host> — $<user>";
        subject.value = SAMPLE_TEXT;
        test();
      }),
    );

    const flagRow = el("div", { class: "toolbar" });
    for (const [flag, description] of FLAGS) {
      const box = el("input", {
        type: "checkbox",
        onchange: () => {
          if (box.checked) flags.add(flag);
          else flags.delete(flag);
          if (pattern.value !== "") test();
        },
      });
      flagRow.append(
        el("label", { class: "field checkbox" }, box, el("span", {}, `${flag} — ${description}`)),
      );
    }

    return el(
      "div",
      { class: "workbench" },
      toolbar,
      el(
        "div",
        { class: "fields" },
        el("label", { class: "field wide" }, el("span", {}, "Pattern"), pattern),
        el("label", { class: "field wide" }, el("span", {}, "Replacement"), replacement),
      ),
      flagRow,
      el(
        "div",
        { class: "panes" },
        el(
          "section",
          { class: "pane" },
          el("header", { class: "pane-head" }, el("h3", {}, "Text")),
          subject,
        ),
        el(
          "section",
          { class: "pane" },
          el("header", { class: "pane-head" }, el("h3", {}, "Result")),
          output,
        ),
      ),
      status,
      el(
        "p",
        { class: "muted" },
        "Matching runs in this tab. A pattern that backtracks catastrophically can " +
          "freeze it — reload the page to recover.",
      ),
    );
  },
};
