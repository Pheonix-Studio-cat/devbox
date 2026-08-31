import { base64Panel } from "./base64";
import { hashPanel } from "./hash";
import { jsonPanel } from "./json";
import { jwtPanel } from "./jwt";
import { randomPanel } from "./random";
import { timestampPanel } from "./timestamp";
import { urlPanel } from "./url";
import type { Panel } from "./types";

export const PANELS: readonly Panel[] = [
  jsonPanel,
  base64Panel,
  urlPanel,
  jwtPanel,
  hashPanel,
  randomPanel,
  timestampPanel,
];

export type { Panel };
