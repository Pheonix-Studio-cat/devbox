import { generateMany, randomToken, uuidV4, type TokenEncoding } from "../tools/random";
import { action, choice, createWorkbench, number } from "../workbench";
import type { Panel } from "./types";

const ENCODINGS = ["hex", "base64url", "alphanumeric"] as const;

export const randomPanel: Panel = {
  id: "random",
  name: "UUID & tokens",
  blurb: "Version 4 UUIDs and random secrets from the platform CSPRNG.",
  render() {
    let count = 5;
    let bytes = 32;
    let encoding: TokenEncoding = "hex";

    const bench = createWorkbench({ hideInput: true });

    const emit = (generator: () => string) => () => {
      bench.setOutput(generateMany(count, generator).join("\n"));
    };

    const generateUuids = emit(uuidV4);

    bench.onRun(generateUuids);
    bench.toolbar.append(
      action("Generate UUIDs", generateUuids, true),
      action("Generate tokens", emit(() => randomToken(bytes, encoding))),
      number("Count", count, 1, 500, (value) => {
        count = value;
      }),
      number("Token bytes", bytes, 1, 1024, (value) => {
        bytes = value;
      }),
      choice("Encoding", ENCODINGS, (value) => {
        encoding = value as TokenEncoding;
      }),
    );

    generateUuids();
    return bench.root;
  },
};
