import { csvToJson, DELIMITERS, jsonToCsv, type DelimiterName } from "../tools/csv";
import { action, choice, createWorkbench, toggle } from "../workbench";
import type { Panel } from "./types";

const SAMPLE = `name,role,joined,active
"Meier, Anna",Design,2024-03-01,true
Beat Zünd,Engineering,2023-11-15,true
Chiara Rossi,Support,2025-06-30,false`;

const NAMES = ["auto", ...Object.keys(DELIMITERS)] as const;

export const csvPanel: Panel = {
  id: "csv",
  name: "CSV & JSON",
  blurb: "Convert a spreadsheet export into JSON, and back again.",
  render() {
    let delimiterName: (typeof NAMES)[number] = "auto";
    let header = true;
    let typed = true;

    const bench = createWorkbench({
      inputLabel: "CSV or JSON",
      placeholder: "name,age\nAnna,30",
      sample: SAMPLE,
    });

    const delimiter = (): string | undefined =>
      delimiterName === "auto" ? undefined : DELIMITERS[delimiterName as DelimiterName];

    const toJson = () => {
      const result = csvToJson(bench.input.value, { delimiter: delimiter(), header, typed });
      if (result.ok) bench.setOutput(result.value);
      else bench.setError(result.error);
    };

    const toCsv = () => {
      const result = jsonToCsv(bench.input.value, delimiter() ?? ",");
      if (result.ok) bench.setOutput(result.value);
      else bench.setError(result.error);
    };

    bench.onRun(toJson);
    bench.toolbar.append(
      action("CSV → JSON", toJson, true),
      action("JSON → CSV", toCsv),
      choice("Separator", NAMES, (value) => {
        delimiterName = value as (typeof NAMES)[number];
      }),
      toggle("First row is a header", header, (value) => {
        header = value;
      }),
      toggle("Detect numbers", typed, (value) => {
        typed = value;
      }),
    );

    return bench.root;
  },
};
