import { describe, expect, it } from "vitest";
import { buildQuery, decodeUrl, encodeUrl, parseUrl } from "./url";

describe("encodeUrl / decodeUrl", () => {
  it("round-trips reserved characters", () => {
    const text = "a b&c=d/e?f#g";
    const encoded = encodeUrl(text);
    expect(encoded.ok && encoded.value).toBe("a%20b%26c%3Dd%2Fe%3Ff%23g");
    expect(encoded.ok && decodeUrl(encoded.value)).toMatchObject({ value: text });
  });

  it("treats '+' as a space when decoding form-encoded input", () => {
    expect(decodeUrl("hello+world")).toMatchObject({ value: "hello world" });
  });

  it("reports a malformed percent escape", () => {
    const result = decodeUrl("%zz");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/percent-encoded/i);
  });
});

describe("parseUrl", () => {
  it("splits an absolute URL into its parts", () => {
    const result = parseUrl("https://example.com:8443/search?q=hello+world&lang=de#top");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const parts = Object.fromEntries(result.value.parts.map((p) => [p.key, p.value]));
    expect(parts).toMatchObject({
      protocol: "https",
      host: "example.com:8443",
      pathname: "/search",
      port: "8443",
      fragment: "top",
    });
    expect(result.value.query).toEqual([
      { key: "q", value: "hello world" },
      { key: "lang", value: "de" },
    ]);
  });

  it("accepts a bare query string", () => {
    const result = parseUrl("?a=1&b=2");
    expect(result.ok && result.value.query).toEqual([
      { key: "a", value: "1" },
      { key: "b", value: "2" },
    ]);
  });

  it("keeps repeated keys instead of collapsing them", () => {
    const result = parseUrl("tag=a&tag=b");
    expect(result.ok && result.value.query).toHaveLength(2);
  });

  it("rejects empty input", () => {
    expect(parseUrl("  ").ok).toBe(false);
  });
});

describe("buildQuery", () => {
  it("builds and escapes a query string from key=value lines", () => {
    const result = buildQuery("q = hello world\nlang=de");
    expect(result.ok && result.value).toBe("q=hello+world&lang=de");
  });

  it("keeps values that themselves contain '='", () => {
    const result = buildQuery("token=abc=def");
    expect(result.ok && result.value).toBe("token=abc%3Ddef");
  });

  it("reports when no pairs were found", () => {
    expect(buildQuery("\n\n").ok).toBe(false);
  });
});
