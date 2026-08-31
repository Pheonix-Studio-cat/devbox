import { err, messageOf, ok, type Result } from "./result";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function bytesToBase64(bytes: Uint8Array): string {
  // btoa works on binary strings, so feed it in chunks to avoid blowing the
  // argument limit on large inputs.
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encodes UTF-8 text; `urlSafe` swaps in the RFC 4648 §5 alphabet. */
export function encodeBase64(text: string, urlSafe = false): Result<string> {
  try {
    const base64 = bytesToBase64(encoder.encode(text));
    if (!urlSafe) return ok(base64);
    return ok(base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
  } catch (cause) {
    return err(messageOf(cause));
  }
}

/** Decodes standard or URL-safe Base64, tolerating missing padding. */
export function decodeBase64(value: string): Result<string> {
  const compact = value.replace(/\s+/g, "");
  if (compact === "") return err("Nothing to decode — the input is empty.");

  const normalised = compact.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised.padEnd(Math.ceil(normalised.length / 4) * 4, "=");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(padded)) {
    return err("Not valid Base64 — it contains characters outside the alphabet.");
  }

  try {
    return ok(decoder.decode(base64ToBytes(padded)));
  } catch {
    return err("Decoded successfully, but the bytes are not valid UTF-8 text.");
  }
}

/** Decodes to a hex dump, for payloads that are not text at all. */
export function decodeBase64ToHex(value: string): Result<string> {
  const compact = value.replace(/\s+/g, "");
  const normalised = compact.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised.padEnd(Math.ceil(normalised.length / 4) * 4, "=");
  try {
    const bytes = base64ToBytes(padded);
    return ok(
      Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" "),
    );
  } catch (cause) {
    return err(messageOf(cause));
  }
}
