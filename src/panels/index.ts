import { base64Panel } from "./base64";
import { colorPanel } from "./color";
import { convertPanel } from "./convert";
import { csvPanel } from "./csv";
import { hashPanel } from "./hash";
import { jsonPanel } from "./json";
import { jwtPanel } from "./jwt";
import { numbersPanel } from "./numbers";
import { randomPanel } from "./random";
import { timestampPanel } from "./timestamp";
import { urlPanel } from "./url";
import { vectorizePanel } from "./vectorize";
import type { Panel } from "./types";

/** Grouped for the sidebar: text tools, then data, then images. */
export const PANELS: readonly Panel[] = [
  jsonPanel,
  base64Panel,
  urlPanel,
  jwtPanel,
  hashPanel,
  randomPanel,
  timestampPanel,
  csvPanel,
  colorPanel,
  numbersPanel,
  vectorizePanel,
  convertPanel,
];

export type { Panel };
