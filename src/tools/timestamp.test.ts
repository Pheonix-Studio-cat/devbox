import { describe, expect, it } from "vitest";
import { describeTimestamp, parseTimestamp, relativeTime } from "./timestamp";

const now = new Date("2026-01-01T12:00:00Z");

describe("parseTimestamp", () => {
  it("reads a ten-digit number as Unix seconds", () => {
    const result = parseTimestamp("1767225600");
    expect(result.ok && result.value.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("reads a thirteen-digit number as Unix milliseconds", () => {
    const result = parseTimestamp("1767225600123");
    expect(result.ok && result.value.toISOString()).toBe("2026-01-01T00:00:00.123Z");
  });

  it("parses ISO 8601 strings", () => {
    const result = parseTimestamp("2026-01-01T00:00:00Z");
    expect(result.ok && result.value.getTime()).toBe(1_767_225_600_000);
  });

  it("resolves 'now' against the supplied clock", () => {
    const result = parseTimestamp("now", now);
    expect(result.ok && result.value.getTime()).toBe(now.getTime());
  });

  it("handles negative seconds before the epoch", () => {
    const result = parseTimestamp("-86400");
    expect(result.ok && result.value.toISOString()).toBe("1969-12-31T00:00:00.000Z");
  });

  it("rejects empty and unparseable input", () => {
    expect(parseTimestamp("").ok).toBe(false);
    expect(parseTimestamp("next tuesday-ish").ok).toBe(false);
  });

  it("rejects a number beyond the safe integer range", () => {
    const result = parseTimestamp("999999999999999999999");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/too large/i);
  });
});

describe("relativeTime", () => {
  it("describes the past and the future", () => {
    expect(relativeTime(new Date("2026-01-01T09:00:00Z"), now)).toBe("3 hours ago");
    expect(relativeTime(new Date("2026-01-03T12:00:00Z"), now)).toBe("in 2 days");
  });

  it("collapses sub-second gaps", () => {
    expect(relativeTime(new Date(now.getTime() + 200), now)).toBe("just now");
  });
});

describe("describeTimestamp", () => {
  it("expands one instant into every representation", () => {
    const view = describeTimestamp(new Date("2026-01-01T00:00:00Z"), now);
    expect(view).toMatchObject({
      unixSeconds: 1_767_225_600,
      unixMillis: 1_767_225_600_000,
      iso: "2026-01-01T00:00:00.000Z",
      weekday: "Thursday",
    });
    expect(view.utc).toContain("2026");
  });

  it("floors, rather than rounds, sub-second precision", () => {
    const view = describeTimestamp(new Date(1_767_225_600_999), now);
    expect(view.unixSeconds).toBe(1_767_225_600);
  });
});
