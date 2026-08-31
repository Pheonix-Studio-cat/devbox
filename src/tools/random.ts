export type TokenEncoding = "hex" | "base64url" | "alphanumeric";

const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** RFC 4122 version 4 UUID, from the platform CSPRNG. */
export function uuidV4(): string {
  return crypto.randomUUID();
}

/**
 * A cryptographically random token. `bytes` is the entropy drawn; the rendered
 * length depends on the encoding.
 */
export function randomToken(bytes: number, encoding: TokenEncoding = "hex"): string {
  const size = Math.max(1, Math.min(1024, Math.trunc(bytes)));
  const buffer = crypto.getRandomValues(new Uint8Array(size));

  if (encoding === "hex") {
    return Array.from(buffer, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  if (encoding === "alphanumeric") {
    // Reject bytes past the largest whole multiple of the alphabet so every
    // character stays equally likely.
    const limit = Math.floor(256 / ALPHANUMERIC.length) * ALPHANUMERIC.length;
    let out = "";
    let pool = buffer;
    while (out.length < size) {
      for (const byte of pool) {
        if (byte >= limit) continue;
        out += ALPHANUMERIC[byte % ALPHANUMERIC.length];
        if (out.length === size) break;
      }
      if (out.length < size) pool = crypto.getRandomValues(new Uint8Array(size));
    }
    return out;
  }

  let binary = "";
  for (const byte of buffer) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Generates `count` values using `generator`. */
export function generateMany(count: number, generator: () => string): string[] {
  const total = Math.max(1, Math.min(500, Math.trunc(count)));
  return Array.from({ length: total }, generator);
}
