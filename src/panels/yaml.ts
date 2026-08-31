import { jsonToYaml, yamlToJson } from "../tools/yaml";
import { action, createWorkbench, number } from "../workbench";
import { el } from "../dom";
import type { Panel } from "./types";

const SAMPLE = `server:
  host: localhost
  port: 8080
  tls: true
tags:
  - json
  - yaml
limits: {cpu: 2, memory: 512}
notes: |
  first line
  second line`;

export const yamlPanel: Panel = {
  id: "yaml",
  name: "YAML & JSON",
  blurb: "Convert a config file to JSON, and back again.",
  render() {
    let indent = 2;

    const bench = createWorkbench({
      inputLabel: "YAML or JSON",
      placeholder: "key: value",
      sample: SAMPLE,
    });

    const toJson = () => {
      const result = yamlToJson(bench.input.value, indent);
      if (result.ok) bench.setOutput(result.value);
      else bench.setError(result.error);
    };

    const toYaml = () => {
      const result = jsonToYaml(bench.input.value);
      if (result.ok) bench.setOutput(result.value);
      else bench.setError(result.error);
    };

    bench.onRun(toJson);
    bench.toolbar.append(
      action("YAML → JSON", toJson, true),
      action("JSON → YAML", toYaml),
      number("Indent", indent, 0, 8, (value) => {
        indent = value;
      }),
      el(
        "span",
        { class: "muted" },
        "Reads block and flow collections, quoted scalars and | > blocks. " +
          "Anchors, aliases and tags are refused rather than guessed at.",
      ),
    );

    return bench.root;
  },
};
