import { describe, expect, it } from "vitest";
import { ICONS, ICON_IDS, findIcon } from "./icons";

describe("the icon library", () => {
  it("offers a music note, since that is what people ask for first", () => {
    expect(findIcon("music")?.label).toBe("Music note");
  });

  it("offers a broad spread to choose from", () => {
    expect(ICONS.length).toBeGreaterThanOrEqual(24);
  });

  it("gives every icon a unique id and a readable label", () => {
    expect(new Set(ICON_IDS).size).toBe(ICONS.length);
    for (const icon of ICONS) {
      expect(icon.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(icon.label.length).toBeGreaterThan(2);
      expect(icon.body.length).toBeGreaterThan(10);
    }
  });

  it("draws everything with currentColor, so one colour drives the icon", () => {
    for (const icon of ICONS) {
      expect(icon.body, icon.id).toContain("currentColor");
      // A literal colour would ignore the chosen one and break on dark plates.
      expect(icon.body, icon.id).not.toMatch(/(fill|stroke)="#/);
    }
  });

  it("references nothing outside itself", () => {
    for (const icon of ICONS) {
      expect(icon.body, icon.id).not.toMatch(/href|url\(|<image|<script/);
    }
  });

  it("uses only the shapes the renderer understands", () => {
    const allowed = new Set(["path", "circle", "ellipse", "rect", "line", "polygon", "g"]);
    for (const icon of ICONS) {
      for (const [, tag] of icon.body.matchAll(/<([a-z]+)/g)) {
        expect(allowed.has(tag as string), `${icon.id} uses <${tag}>`).toBe(true);
      }
    }
  });

  it("closes every element it opens", () => {
    for (const icon of ICONS) {
      const opened = [...icon.body.matchAll(/<[a-z]+/g)].length;
      const closed = [...icon.body.matchAll(/\/>|<\/[a-z]+>/g)].length;
      expect(closed, icon.id).toBe(opened);
    }
  });

  it("keeps every number near the 24-unit grid's scale", () => {
    // Path data mixes absolute coordinates with relative deltas, so this
    // cannot prove a shape stays inside the box — it catches the mistyped
    // coordinate, a 240 where 24 was meant. Whether each icon actually looks
    // like its label is a question for the eye, not for a number range.
    for (const icon of ICONS) {
      for (const match of icon.body.matchAll(/-?\d+(?:\.\d+)?/g)) {
        const numeric = Number(match[0]);
        expect(numeric, `${icon.id}: ${match[0]}`).toBeGreaterThan(-30);
        expect(numeric, `${icon.id}: ${match[0]}`).toBeLessThan(30);
      }
    }
  });

  it("finds nothing for an unknown id", () => {
    expect(findIcon("no-such-icon")).toBeUndefined();
  });
});
