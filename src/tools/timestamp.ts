import { err, ok, type Result } from "./result";

export interface TimestampView {
  unixSeconds: number;
  unixMillis: number;
  iso: string;
  utc: string;
  local: string;
  relative: string;
  weekday: string;
}

/**
 * Accepts `now`, Unix seconds, Unix milliseconds, or anything `Date` can parse
 * (ISO 8601, RFC 2822, ...). Bare numbers are read as milliseconds once they
 * grow past the year 5138 in seconds, which is where the two ranges separate.
 */
export function parseTimestamp(input: string, now = new Date()): Result<Date> {
  const trimmed = input.trim();
  if (trimmed === "") return err("Nothing to convert — the input is empty.");
  if (trimmed.toLowerCase() === "now") return ok(new Date(now));

  if (/^-?\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (!Number.isSafeInteger(numeric)) return err("That number is too large to be a timestamp.");
    const millis = Math.abs(numeric) > 1e11 ? numeric : numeric * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? err("That number is not a valid timestamp.") : ok(date);
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return err("Unrecognised date. Try Unix seconds, Unix millis, or an ISO 8601 string.");
  }
  return ok(parsed);
}

const RELATIVE_UNITS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
  ["second", 1000],
];

/** Renders the gap between two instants as "3 days ago" / "in 2 hours". */
export function relativeTime(date: Date, now = new Date()): string {
  const diff = date.getTime() - now.getTime();
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  for (const [unit, millis] of RELATIVE_UNITS) {
    if (Math.abs(diff) >= millis) {
      return formatter.format(Math.trunc(diff / millis), unit);
    }
  }
  return "just now";
}

/** Expands one instant into every representation the panel shows. */
export function describeTimestamp(date: Date, now = new Date()): TimestampView {
  return {
    unixSeconds: Math.floor(date.getTime() / 1000),
    unixMillis: date.getTime(),
    iso: date.toISOString(),
    utc: date.toUTCString(),
    local: date.toLocaleString(undefined, { dateStyle: "full", timeStyle: "long" }),
    relative: relativeTime(date, now),
    weekday: date.toLocaleDateString("en", { weekday: "long", timeZone: "UTC" }),
  };
}
