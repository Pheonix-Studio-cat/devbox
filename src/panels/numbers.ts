import { BIT_WIDTHS, describeNumber, parseNumber, type BitWidth } from "../tools/numbers";
import { action, choice, createWorkbench, pairs } from "../workbench";
import type { Panel } from "./types";

export const numbersPanel: Panel = {
  id: "numbers",
  name: "Number bases",
  blurb: "Decimal, hexadecimal, binary and octal, with two's-complement.",
  render() {
    let width: BitWidth = 32;

    const bench = createWorkbench({
      inputLabel: "Number",
      placeholder: "255, 0xff, 0b1111_1111 or 0o377",
      sample: "0xdeadbeef",
    });

    const convert = () => {
      const parsed = parseNumber(bench.input.value);
      if (!parsed.ok) {
        bench.setError(parsed.error);
        return;
      }

      const view = describeNumber(parsed.value, width);
      bench.setContent(
        pairs([
          ["Decimal", view.decimal],
          ["Hexadecimal", view.hexadecimal],
          ["Binary", view.binary],
          ["Octal", view.octal],
          [`As signed ${width}-bit`, view.signed ?? `does not fit in ${width} bits`],
          [`Bit pattern (${width}-bit)`, view.bytes],
          ["Smallest width", view.fitsIn ? `${view.fitsIn}-bit` : "wider than 64-bit"],
        ]),
      );
    };

    bench.onRun(convert);
    bench.toolbar.append(
      action("Convert", convert, true),
      choice("Width", BIT_WIDTHS.map(String), (value) => {
        width = Number(value) as BitWidth;
      }),
    );

    return bench.root;
  },
};
