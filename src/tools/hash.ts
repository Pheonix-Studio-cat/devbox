import { err, messageOf, ok, type Result } from "./result";

export const HASH_ALGORITHMS = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"] as const;
export type HashAlgorithm = (typeof HASH_ALGORITHMS)[number];

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Hashes UTF-8 text using the Web Crypto API. */
export async function hashText(
  text: string,
  algorithm: HashAlgorithm,
): Promise<Result<string>> {
  try {
    const digest = await crypto.subtle.digest(algorithm, new TextEncoder().encode(text));
    return ok(toHex(digest));
  } catch (cause) {
    return err(messageOf(cause));
  }
}

/** Hashes every algorithm at once, for side-by-side comparison. */
export async function hashAll(text: string): Promise<Record<HashAlgorithm, string>> {
  const entries = await Promise.all(
    HASH_ALGORITHMS.map(async (algorithm) => {
      const result = await hashText(text, algorithm);
      return [algorithm, result.ok ? result.value : result.error] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<HashAlgorithm, string>;
}
