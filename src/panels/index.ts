import { base64Panel } from "./base64";
import { colorPanel } from "./color";
import { convertPanel } from "./convert";
import { csvPanel } from "./csv";
import { diffPanel } from "./diff";
import { hashPanel } from "./hash";
import { jsonPanel } from "./json";
import { jwtPanel } from "./jwt";
import { numbersPanel } from "./numbers";
import { qrPanel } from "./qr";
import { randomPanel } from "./random";
import { regexPanel } from "./regex";
import { timestampPanel } from "./timestamp";
import { urlPanel } from "./url";
import { vectorizePanel } from "./vectorize";
import { yamlPanel } from "./yaml";
import type { Panel } from "./types";

/** Grouped for the sidebar: text, then data formats, then images. */
export const PANELS: readonly Panel[] = [
  jsonPanel,
  yamlPanel,
  csvPanel,
  base64Panel,
  urlPanel,
  jwtPanel,
  regexPanel,
  diffPanel,
  hashPanel,
  randomPanel,
  timestampPanel,
  colorPanel,
  numbersPanel,
  qrPanel,
  vectorizePanel,
  convertPanel,
];

export type { Panel };
