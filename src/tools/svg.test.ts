import { describe, expect, it } from "vitest";
import { isSvg, readSvgSize, renderSize } from "./svg";

const size = (source: string) => {
  const result = readSvgSize(source);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

describe("readSvgSize", () => {
  it("prefers an explicit width and height", () => {
    expect(size('<svg width="320" height="200" viewBox="0 0 16 10"></svg>')).toEqual({
      width: 320,
      height: 200,
      fromViewBox: false,
    });
  });

  it("converts absolute units to pixels", () => {
    expect(size('<svg width="1in" height="72pt"/>')).toMatchObject({ width: 96, height: 96 });
    expect(size('<svg width="25.4mm" height="2.54cm"/>')).toMatchObject({ width: 96, height: 96 });
  });

  it("falls back to the viewBox when there is no usable size", () => {
    expect(size('<svg viewBox="0 0 45 45"/>')).toEqual({
      width: 45,
      height: 45,
      fromViewBox: true,
    });
  });

  it("treats a percentage as no size, since it is a share of something else", () => {
    expect(size('<svg width="100%" height="100%" viewBox="0 0 30 20"/>')).toMatchObject({
      width: 30,
      height: 20,
      fromViewBox: true,
    });
  });

  it("reads single quotes and odd spacing", () => {
    expect(size("<svg  width = '40'   height='20' >")).toMatchObject({ width: 40, height: 20 });
  });

  it("ignores a width on some other element", () => {
    const source = '<svg viewBox="0 0 8 4"><rect width="999" height="999"/></svg>';
    expect(size(source)).toMatchObject({ width: 8, height: 4 });
  });

  it("refuses a file with no size to go on", () => {
    const result = readSvgSize("<svg><circle r='4'/></svg>");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/pick the output size/i);
  });

  it("refuses something that is not an SVG at all", () => {
    const result = readSvgSize("<html><body>hello</body></html>");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/does not look like an SVG/i);
  });

  it("rejects a zero or negative size", () => {
    expect(readSvgSize('<svg width="0" height="10" viewBox="0 0 0 0"/>').ok).toBe(false);
  });
});

describe("renderSize", () => {
  it("scales the longest edge to the target", () => {
    expect(renderSize({ width: 100, height: 50, fromViewBox: false }, 1000)).toEqual({
      width: 1000,
      height: 500,
    });
  });

  it("works when the height is the longer edge", () => {
    expect(renderSize({ width: 50, height: 100, fromViewBox: false }, 400)).toEqual({
      width: 200,
      height: 400,
    });
  });

  it("scales down as readily as up", () => {
    expect(renderSize({ width: 2000, height: 1000, fromViewBox: true }, 100)).toEqual({
      width: 100,
      height: 50,
    });
  });

  it("never rounds an edge away to nothing", () => {
    expect(renderSize({ width: 1000, height: 2, fromViewBox: false }, 10).height).toBe(1);
  });
});

describe("isSvg", () => {
  it("recognises the media type and the extension", () => {
    expect(isSvg("logo.svg", "image/svg+xml")).toBe(true);
    expect(isSvg("logo.svg", "")).toBe(true);
    expect(isSvg("LOGO.SVG", "application/octet-stream")).toBe(true);
    expect(isSvg("photo.png", "image/png")).toBe(false);
  });
});
