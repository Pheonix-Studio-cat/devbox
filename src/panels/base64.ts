import { decodeBase64, decodeBase64ToHex, encodeBase64 } from "../tools/base64";
import { action, createWorkbench } from "../workbench";
import type { Panel } from "./types";

export const base64Panel: Panel = {
  id: "base64",
  name: "Base64",
  blurb: "Encode and decode UTF-8 text, standard or URL-safe.",
  render() {
    const bench = createWorkbench({
      inputLabel: "Text or Base64",
      placeholder: "Grüezi mitenand",
      sample: "Grüezi mitenand — 🧰",
    });

    const run = (transform: (input: string) => ReturnType<typeof encodeBase64>) => () => {
      const result = transform(bench.input.value);
      if (result.ok) bench.setOutput(result.value);
      else bench.setError(result.error);
    };

    const encode = run((input) => encodeBase64(input));

    bench.onRun(encode);
    bench.toolbar.append(
      action("Encode", encode, true),
      action("Encode (URL-safe)", run((input) => encodeBase64(input, true))),
      action("Decode", run(decodeBase64)),
      action("Decode to hex", run(decodeBase64ToHex)),
    );

    return bench.root;
  },
};
