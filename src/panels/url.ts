import { buildQuery, decodeUrl, encodeUrl, parseUrl } from "../tools/url";
import { action, createWorkbench, pairs } from "../workbench";
import { el } from "../dom";
import type { Panel } from "./types";

const SAMPLE = "https://example.com/search?q=hello+world&lang=de&tag=a&tag=b#results";

export const urlPanel: Panel = {
  id: "url",
  name: "URL",
  blurb: "Percent-encode, decode, and pull a URL apart.",
  render() {
    const bench = createWorkbench({
      inputLabel: "URL or text",
      placeholder: "https://example.com/path?a=1",
      sample: SAMPLE,
    });

    const run = (transform: (input: string) => ReturnType<typeof encodeUrl>) => () => {
      const result = transform(bench.input.value);
      if (result.ok) bench.setOutput(result.value);
      else bench.setError(result.error);
    };

    const inspect = () => {
      const result = parseUrl(bench.input.value);
      if (!result.ok) {
        bench.setError(result.error);
        return;
      }
      const { parts, query } = result.value;
      const sections: Array<Node | string> = [];
      if (parts.length > 0) {
        sections.push(el("h4", {}, "Components"));
        sections.push(pairs(parts.map(({ key, value }) => [key, value] as const)));
      }
      sections.push(el("h4", {}, `Query parameters (${query.length})`));
      sections.push(
        query.length > 0
          ? pairs(query.map(({ key, value }) => [key, value] as const))
          : el("p", { class: "muted" }, "No query parameters."),
      );
      bench.setContent(...sections);
    };

    bench.onRun(inspect);
    bench.toolbar.append(
      action("Parse", inspect, true),
      action("Encode", run(encodeUrl)),
      action("Decode", run(decodeUrl)),
      action("Build query", run(buildQuery)),
    );

    return bench.root;
  },
};
