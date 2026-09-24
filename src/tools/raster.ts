/**
 * Turns the icon fragments in `icons.ts` into pixels.
 *
 * A browser has SVG; a Cloudflare Worker does not, and the MCP server needs a
 * picture it can hand back to a model's chat window. This covers exactly the
 * subset the icon library uses — path, circle, ellipse and rect, filled or
 * stroked with round caps — and nothing else.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Shape {
  /** Closed outlines for a fill, or open ones for a stroke. */
  rings: Point[][];
  filled: boolean;
  width: number;
}

const CURVE_STEPS = 18;
const CIRCLE_STEPS = 48;

const attribute = (markup: string, name: string): string | undefined =>
  new RegExp(`${name}="([^"]*)"`).exec(markup)?.[1];

const numberAttribute = (markup: string, name: string, fallback = 0): number => {
  const raw = attribute(markup, name);
  const value = raw === undefined ? Number.NaN : Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
};

function ellipseRing(cx: number, cy: number, rx: number, ry: number): Point[] {
  return Array.from({ length: CIRCLE_STEPS }, (_, i) => {
    const angle = (i / CIRCLE_STEPS) * Math.PI * 2;
    return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
  });
}

function roundedRectRing(x: number, y: number, w: number, h: number, r: number): Point[] {
  const radius = Math.min(r, w / 2, h / 2);
  if (radius <= 0) {
    return [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
  }

  const corners: Array<[number, number, number]> = [
    [x + w - radius, y + radius, -Math.PI / 2],
    [x + w - radius, y + h - radius, 0],
    [x + radius, y + h - radius, Math.PI / 2],
    [x + radius, y + radius, Math.PI],
  ];

  const ring: Point[] = [];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= 8; i += 1) {
      const angle = start + (i / 8) * (Math.PI / 2);
      ring.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
    }
  }
  return ring;
}

function cubic(p0: Point, p1: Point, p2: Point, p3: Point, into: Point[]): void {
  for (let i = 1; i <= CURVE_STEPS; i += 1) {
    const t = i / CURVE_STEPS;
    const u = 1 - t;
    into.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
}

function quadratic(p0: Point, p1: Point, p2: Point, into: Point[]): void {
  for (let i = 1; i <= CURVE_STEPS; i += 1) {
    const t = i / CURVE_STEPS;
    const u = 1 - t;
    into.push({
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    });
  }
}

/** Endpoint-parameterised arc to sampled points, as SVG defines it. */
function arc(
  from: Point,
  rx: number,
  ry: number,
  rotation: number,
  largeArc: boolean,
  sweep: boolean,
  to: Point,
  into: Point[],
): void {
  if (rx === 0 || ry === 0) {
    into.push(to);
    return;
  }

  const phi = (rotation * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);

  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;

  let radiusX = Math.abs(rx);
  let radiusY = Math.abs(ry);
  // An arc too small to span its endpoints is scaled up, per the spec.
  const overshoot = (x1 * x1) / (radiusX * radiusX) + (y1 * y1) / (radiusY * radiusY);
  if (overshoot > 1) {
    const factor = Math.sqrt(overshoot);
    radiusX *= factor;
    radiusY *= factor;
  }

  const denominator =
    radiusX * radiusX * y1 * y1 + radiusY * radiusY * x1 * x1;
  const numerator = radiusX * radiusX * radiusY * radiusY - denominator;
  const ratio = Math.sqrt(Math.max(0, numerator / denominator)) * (largeArc === sweep ? -1 : 1);

  const cx1 = (ratio * radiusX * y1) / radiusY;
  const cy1 = (-ratio * radiusY * x1) / radiusX;
  const cx = cos * cx1 - sin * cy1 + (from.x + to.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (from.y + to.y) / 2;

  const angleOf = (x: number, y: number): number => Math.atan2((y - cy1) / radiusY, (x - cx1) / radiusX);
  const start = angleOf(x1, y1);
  let sweepAngle = angleOf(-x1, -y1) - start;
  if (!sweep && sweepAngle > 0) sweepAngle -= Math.PI * 2;
  if (sweep && sweepAngle < 0) sweepAngle += Math.PI * 2;

  const steps = Math.max(4, Math.ceil((Math.abs(sweepAngle) / (Math.PI / 2)) * 12));
  for (let i = 1; i <= steps; i += 1) {
    const angle = start + (sweepAngle * i) / steps;
    const px = Math.cos(angle) * radiusX;
    const py = Math.sin(angle) * radiusY;
    into.push({ x: cos * px - sin * py + cx, y: sin * px + cos * py + cy });
  }
}

const TOKENS = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi;

/** Flattens path data into polylines, one per subpath. */
export function flattenPath(data: string): Point[][] {
  const tokens = [...data.matchAll(TOKENS)];
  const rings: Point[][] = [];
  let ring: Point[] = [];

  let cursor: Point = { x: 0, y: 0 };
  let startPoint: Point = { x: 0, y: 0 };
  let lastControl: Point | null = null;
  let command = "";
  let index = 0;

  const nextNumber = (): number => {
    const token = tokens[index];
    index += 1;
    return token?.[2] === undefined ? 0 : Number.parseFloat(token[2]);
  };

  const closeRing = (): void => {
    if (ring.length > 1) rings.push(ring);
    ring = [];
  };

  while (index < tokens.length) {
    const token = tokens[index]!;
    if (token[1] !== undefined) {
      command = token[1];
      index += 1;
      if (command === "Z" || command === "z") {
        if (ring.length > 1) {
          ring.push({ ...startPoint });
          rings.push(ring);
        }
        ring = [];
        cursor = { ...startPoint };
        continue;
      }
    }

    const relative = command === command.toLowerCase();
    const base = relative ? cursor : { x: 0, y: 0 };

    switch (command.toUpperCase()) {
      case "M": {
        closeRing();
        cursor = { x: base.x + nextNumber(), y: base.y + nextNumber() };
        startPoint = { ...cursor };
        ring = [{ ...cursor }];
        // Further pairs after a moveto are implicit linetos.
        command = relative ? "l" : "L";
        lastControl = null;
        break;
      }
      case "L": {
        cursor = { x: base.x + nextNumber(), y: base.y + nextNumber() };
        ring.push({ ...cursor });
        lastControl = null;
        break;
      }
      case "H": {
        cursor = { x: base.x + nextNumber(), y: cursor.y };
        ring.push({ ...cursor });
        lastControl = null;
        break;
      }
      case "V": {
        cursor = { x: cursor.x, y: base.y + nextNumber() };
        ring.push({ ...cursor });
        lastControl = null;
        break;
      }
      case "C": {
        const c1 = { x: base.x + nextNumber(), y: base.y + nextNumber() };
        const c2 = { x: base.x + nextNumber(), y: base.y + nextNumber() };
        const end = { x: base.x + nextNumber(), y: base.y + nextNumber() };
        cubic(cursor, c1, c2, end, ring);
        lastControl = c2;
        cursor = end;
        break;
      }
      case "S": {
        const mirror = lastControl
          ? { x: 2 * cursor.x - lastControl.x, y: 2 * cursor.y - lastControl.y }
          : { ...cursor };
        const c2 = { x: base.x + nextNumber(), y: base.y + nextNumber() };
        const end = { x: base.x + nextNumber(), y: base.y + nextNumber() };
        cubic(cursor, mirror, c2, end, ring);
        lastControl = c2;
        cursor = end;
        break;
      }
      case "Q": {
        const c1 = { x: base.x + nextNumber(), y: base.y + nextNumber() };
        const end = { x: base.x + nextNumber(), y: base.y + nextNumber() };
        quadratic(cursor, c1, end, ring);
        lastControl = c1;
        cursor = end;
        break;
      }
      case "T": {
        const mirror: Point = lastControl
          ? { x: 2 * cursor.x - lastControl.x, y: 2 * cursor.y - lastControl.y }
          : { ...cursor };
        const end = { x: base.x + nextNumber(), y: base.y + nextNumber() };
        quadratic(cursor, mirror, end, ring);
        lastControl = mirror;
        cursor = end;
        break;
      }
      case "A": {
        const rx = nextNumber();
        const ry = nextNumber();
        const rotation = nextNumber();
        const largeArc = nextNumber() !== 0;
        const sweep = nextNumber() !== 0;
        const end = { x: base.x + nextNumber(), y: base.y + nextNumber() };
        arc(cursor, rx, ry, rotation, largeArc, sweep, end, ring);
        cursor = end;
        lastControl = null;
        break;
      }
      default: {
        index += 1;
        break;
      }
    }
  }

  closeRing();
  return rings;
}

/** Reads an icon fragment into shapes ready for rasterising. */
export function parseFragment(body: string): Shape[] {
  const shapes: Shape[] = [];

  for (const match of body.matchAll(/<(path|circle|ellipse|rect)\b([^>]*)>/g)) {
    const tag = match[1]!;
    const attrs = match[2]!;
    const filled = (attribute(attrs, "fill") ?? "none") !== "none";
    const width = numberAttribute(attrs, "stroke-width", 0);
    const stroked = /stroke="[^"]*"/.test(attrs) && !/stroke="none"/.test(attrs) && width > 0;

    let rings: Point[][] = [];
    if (tag === "path") rings = flattenPath(attribute(attrs, "d") ?? "");
    else if (tag === "circle") {
      const r = numberAttribute(attrs, "r");
      rings = [ellipseRing(numberAttribute(attrs, "cx"), numberAttribute(attrs, "cy"), r, r)];
    } else if (tag === "ellipse") {
      rings = [
        ellipseRing(
          numberAttribute(attrs, "cx"),
          numberAttribute(attrs, "cy"),
          numberAttribute(attrs, "rx"),
          numberAttribute(attrs, "ry"),
        ),
      ];
    } else {
      rings = [
        roundedRectRing(
          numberAttribute(attrs, "x"),
          numberAttribute(attrs, "y"),
          numberAttribute(attrs, "width"),
          numberAttribute(attrs, "height"),
          numberAttribute(attrs, "rx"),
        ),
      ];
    }

    if (rings.length === 0) continue;
    if (filled) shapes.push({ rings, filled: true, width: 0 });
    if (stroked) shapes.push({ rings, filled: false, width });
  }

  return shapes;
}

/** Non-zero winding test, the rule SVG fills by. */
function insideRings(rings: readonly Point[][], x: number, y: number): boolean {
  let winding = 0;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      if (a.y <= y) {
        if (b.y > y && (b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y) > 0) winding += 1;
      } else if (b.y <= y && (b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y) < 0) {
        winding -= 1;
      }
    }
  }
  return winding !== 0;
}

/** Squared distance from a point to a segment. */
function distanceSquared(px: number, py: number, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lengthSquared));
  const qx = a.x + t * dx - px;
  const qy = a.y + t * dy - py;
  return qx * qx + qy * qy;
}

/**
 * Coverage of one point, sampled on a grid so edges come out smooth. Strokes
 * are the set of points within half a line width of the outline, which gives
 * round caps and joins for free — exactly what the icons ask for.
 */
function coverageAt(shapes: readonly Shape[], x: number, y: number, step: number, samples: number): number {
  let hits = 0;
  for (let sy = 0; sy < samples; sy += 1) {
    for (let sx = 0; sx < samples; sx += 1) {
      const px = x + ((sx + 0.5) / samples) * step;
      const py = y + ((sy + 0.5) / samples) * step;
      let inside = false;
      for (const shape of shapes) {
        if (shape.filled) {
          if (insideRings(shape.rings, px, py)) {
            inside = true;
            break;
          }
        } else {
          const limit = (shape.width / 2) ** 2;
          for (const ring of shape.rings) {
            for (let i = 0; i + 1 < ring.length; i += 1) {
              if (distanceSquared(px, py, ring[i]!, ring[i + 1]!) <= limit) {
                inside = true;
                break;
              }
            }
            if (inside) break;
          }
          if (inside) break;
        }
      }
      if (inside) hits += 1;
    }
  }
  return hits / (samples * samples);
}

/**
 * Draws an icon fragment into an alpha mask of `size` pixels square, scaled
 * from the 24-unit grid the icons are drawn on.
 */
export function rasteriseIcon(body: string, size: number, samples = 3): Float32Array {
  const shapes = parseFragment(body);
  const mask = new Float32Array(size * size);
  if (shapes.length === 0) return mask;

  const step = 24 / size;
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      mask[row * size + column] = coverageAt(shapes, column * step, row * step, step, samples);
    }
  }
  return mask;
}
