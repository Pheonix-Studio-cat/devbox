import { HASH_ALGORITHMS, hashAll, hashText, type HashAlgorithm } from "../tools/hash";
import { action, choice, createWorkbench, pairs } from "../workbench";
import type { Panel } from "./types";

export const hashPanel: Panel = {
  id: "hash",
  name: "Hashes",
  blurb: "SHA-1 through SHA-512 digests, computed via Web Crypto.",
  render() {
    let algorithm: HashAlgorithm = "SHA-256";

    const bench = createWorkbench({
      inputLabel: "Text to hash",
      placeholder: "The quick brown fox…",
      sample: "The quick brown fox jumps over the lazy dog",
    });

    const hashOne = async () => {
      const result = await hashText(bench.input.value, algorithm);
      if (result.ok) bench.setOutput(result.value);
      else bench.setError(result.error);
    };

    const hashEvery = async () => {
      const digests = await hashAll(bench.input.value);
      bench.setContent(
        pairs(HASH_ALGORITHMS.map((name) => [name, digests[name]] as const)),
      );
    };

    bench.onRun(() => void hashOne());
    bench.toolbar.append(
      action("Hash", () => void hashOne(), true),
      action("All algorithms", () => void hashEvery()),
      choice("Algorithm", HASH_ALGORITHMS, (value) => {
        algorithm = value as HashAlgorithm;
      }),
    );

    return bench.root;
  },
};
