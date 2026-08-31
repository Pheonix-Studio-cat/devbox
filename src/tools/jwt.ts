import { decodeBase64 } from "./base64";
import { err, ok, type Result } from "./result";

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
  issuedAt: Date | null;
  notBefore: Date | null;
  expiresAt: Date | null;
  /** null when the token carries no `exp` claim. */
  isExpired: boolean | null;
}

function decodeSegment(segment: string, label: string): Result<Record<string, unknown>> {
  const decoded = decodeBase64(segment);
  if (!decoded.ok) return err(`The ${label} is not valid Base64url: ${decoded.error}`);

  try {
    const parsed = JSON.parse(decoded.value) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return err(`The ${label} is not a JSON object.`);
    }
    return ok(parsed as Record<string, unknown>);
  } catch {
    return err(`The ${label} is not valid JSON.`);
  }
}

function claimAsDate(claims: Record<string, unknown>, name: string): Date | null {
  const value = claims[name];
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value * 1000);
}

/**
 * Decodes a JWT for inspection. The signature is returned verbatim and is NOT
 * verified — that needs the signing key and belongs on the server.
 */
export function decodeJwt(token: string, now = new Date()): Result<DecodedJwt> {
  const trimmed = token.trim().replace(/^Bearer\s+/i, "");
  if (trimmed === "") return err("Nothing to decode — the input is empty.");

  const segments = trimmed.split(".");
  if (segments.length !== 3) {
    return err(
      `A JWT has three dot-separated segments, this one has ${segments.length}.`,
    );
  }
  const [headerSegment, payloadSegment, signature] = segments as [string, string, string];

  const header = decodeSegment(headerSegment, "header");
  if (!header.ok) return header;
  const payload = decodeSegment(payloadSegment, "payload");
  if (!payload.ok) return payload;

  const expiresAt = claimAsDate(payload.value, "exp");
  return ok({
    header: header.value,
    payload: payload.value,
    signature,
    issuedAt: claimAsDate(payload.value, "iat"),
    notBefore: claimAsDate(payload.value, "nbf"),
    expiresAt,
    isExpired: expiresAt === null ? null : expiresAt.getTime() <= now.getTime(),
  });
}
