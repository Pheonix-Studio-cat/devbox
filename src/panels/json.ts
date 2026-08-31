import { formatJson, inspectJson, minifyJson, sortJsonKeys } from "../tools/json";
import { action, createWorkbench, number, pairs } from "../workbench";
import type { Panel } from "./types";

const SAMPLE = '{"name":"devbox","tools":7,"offline":true,"tags":["json","base64"],"meta":{"license":"Apache-2.0"}}';

export const jsonPanel: Panel = {
  id: "json",
  name: "JSON",
  blurb: "Format, minify, sort keys and size up a payload.",
  render() {
    let indent = 2;

    const bench = createWorkbench({
      inputLabel: "JSON",
      placeholder: '{"paste": "your JSON here"}',
      sample: SAMPLE,
    });

    const apply = (transform: (input: string) => ReturnType<typeof formatJson>) => () => {
      const result = transform(bench.input.value);
      if (result.ok) bench.setOutput(result.value);
      else bench.setError(result.error);
    };

    const format = apply((input) => formatJson(input, indent));

    const inspect = () => {
      const result = inspectJson(bench.input.value);
      if (!result.ok) {
        bench.setError(result.error);
        return;
      }
      const { type, keys, arrayItems, maxDepth, bytes } = result.value;
      bench.setContent(
        pairs([
          ["Root type", type],
          ["Object keys", String(keys)],
          ["Array items", String(arrayItems)],
          ["Max nesting", String(maxDepth)],
          ["Size", `${bytes.toLocaleString()} bytes`],
        ]),
      );
    };

    bench.onRun(format);
    bench.toolbar.append(
      action("Format", format, true),
      action("Minify", apply(minifyJson)),
      action("Sort keys", apply((input) => sortJsonKeys(input, indent))),
      action("Inspect", inspect),
      number("Indent", indent, 0, 8, (value) => {
        indent = Number.isFinite(value) ? value : 2;
      }),
    );

    return bench.root;
  },
};
