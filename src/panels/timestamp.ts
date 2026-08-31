import { describeTimestamp, parseTimestamp } from "../tools/timestamp";
import { action, createWorkbench, pairs } from "../workbench";
import type { Panel } from "./types";

export const timestampPanel: Panel = {
  id: "timestamp",
  name: "Timestamps",
  blurb: "Unix seconds, milliseconds and ISO 8601, in both directions.",
  render() {
    const bench = createWorkbench({
      inputLabel: "Timestamp or date",
      placeholder: "1767225600, 2026-01-01T00:00:00Z, or 'now'",
      sample: "1767225600",
    });

    const convert = () => {
      const parsed = parseTimestamp(bench.input.value);
      if (!parsed.ok) {
        bench.setError(parsed.error);
        return;
      }
      const view = describeTimestamp(parsed.value);
      bench.setContent(
        pairs([
          ["Unix seconds", String(view.unixSeconds)],
          ["Unix milliseconds", String(view.unixMillis)],
          ["ISO 8601 (UTC)", view.iso],
          ["RFC 1123 (UTC)", view.utc],
          ["Your local time", view.local],
          ["Weekday (UTC)", view.weekday],
          ["Relative", view.relative],
        ]),
      );
    };

    const useNow = () => {
      bench.input.value = "now";
      convert();
    };

    bench.onRun(convert);
    bench.toolbar.append(action("Convert", convert, true), action("Now", useNow));

    return bench.root;
  },
};
