import { describe, expect, it } from "vitest";
import { encodeBase64 } from "./base64";
import { decodeJwt } from "./jwt";

const segment = (value: unknown): string => {
  const encoded = encodeBase64(JSON.stringify(value), true);
  if (!encoded.ok) throw new Error(encoded.error);
  return encoded.value;
};

const makeToken = (payload: Record<string, unknown>): string =>
  [segment({ alg: "HS256", typ: "JWT" }), segment(payload), "signature-goes-here"].join(".");

describe("decodeJwt", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("decodes header, payload and signature", () => {
    const result = decodeJwt(makeToken({ sub: "user-42", name: "Grüezi" }), now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.header).toEqual({ alg: "HS256", typ: "JWT" });
    expect(result.value.payload).toMatchObject({ sub: "user-42", name: "Grüezi" });
    expect(result.value.signature).toBe("signature-goes-here");
  });

  it("strips a Bearer prefix", () => {
    expect(decodeJwt(`Bearer ${makeToken({ sub: "x" })}`, now).ok).toBe(true);
  });

  it("converts iat, nbf and exp into dates", () => {
    const result = decodeJwt(
      makeToken({ iat: 1_767_225_600, nbf: 1_767_225_600, exp: 1_767_312_000 }),
      now,
    );
    expect(result.ok && result.value.issuedAt?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(result.ok && result.value.notBefore?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(result.ok && result.value.expiresAt?.toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });

  it("flags an expired token against the supplied clock", () => {
    expect(decodeJwt(makeToken({ exp: 1_700_000_000 }), now)).toMatchObject({
      value: { isExpired: true },
    });
    expect(decodeJwt(makeToken({ exp: 1_900_000_000 }), now)).toMatchObject({
      value: { isExpired: false },
    });
  });

  it("leaves expiry unknown when there is no exp claim", () => {
    const result = decodeJwt(makeToken({ sub: "x" }), now);
    expect(result.ok && result.value.isExpired).toBeNull();
    expect(result.ok && result.value.expiresAt).toBeNull();
  });

  it("rejects a token without three segments", () => {
    const result = decodeJwt("abc.def", now);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/three/i);
  });

  it("rejects a payload that is not a JSON object", () => {
    const token = [segment({ alg: "none" }), segment([1, 2, 3]), "sig"].join(".");
    const result = decodeJwt(token, now);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/payload/i);
  });

  it("rejects empty input", () => {
    expect(decodeJwt("   ", now).ok).toBe(false);
  });
});
