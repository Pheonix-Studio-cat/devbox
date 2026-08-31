import { decodeJwt } from "../tools/jwt";
import { el } from "../dom";
import { action, createWorkbench, pairs } from "../workbench";
import type { Panel } from "./types";

const SAMPLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFkYSBMb3ZlbGFjZSIsImlhdCI6MTc2NzIyNTYwMCwiZXhwIjoxNzY3MzEyMDAwfQ." +
  "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

const formatDate = (date: Date | null): string => (date ? date.toISOString() : "—");

export const jwtPanel: Panel = {
  id: "jwt",
  name: "JWT",
  blurb: "Inspect header and claims. The signature is never verified.",
  render() {
    const bench = createWorkbench({
      inputLabel: "JSON Web Token",
      placeholder: "eyJhbGciOi…",
      sample: SAMPLE,
    });

    const decode = () => {
      const result = decodeJwt(bench.input.value);
      if (!result.ok) {
        bench.setError(result.error);
        return;
      }

      const { header, payload, signature, issuedAt, notBefore, expiresAt, isExpired } = result.value;
      const validity =
        isExpired === null
          ? el("p", { class: "badge neutral" }, "No exp claim — expiry unknown")
          : el(
              "p",
              { class: isExpired ? "badge danger" : "badge good" },
              isExpired ? "Expired" : "Not expired",
            );

      bench.setContent(
        validity,
        el("h4", {}, "Header"),
        el("pre", {}, JSON.stringify(header, null, 2)),
        el("h4", {}, "Payload"),
        el("pre", {}, JSON.stringify(payload, null, 2)),
        el("h4", {}, "Timestamps"),
        pairs([
          ["Issued at (iat)", formatDate(issuedAt)],
          ["Not before (nbf)", formatDate(notBefore)],
          ["Expires at (exp)", formatDate(expiresAt)],
        ]),
        el("h4", {}, "Signature"),
        el("pre", {}, signature),
        el(
          "p",
          { class: "muted" },
          "Decoding proves nothing about authenticity — verifying the signature needs the key.",
        ),
      );
    };

    bench.onRun(decode);
    bench.toolbar.append(action("Decode", decode, true));

    return bench.root;
  },
};
