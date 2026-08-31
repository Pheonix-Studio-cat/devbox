export interface Point {
  x: number;
  y: number;
}

/** Right, down, left, up — clockwise in screen coordinates. */
const STEPS: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1]];

function directionOf(from: Point, to: Point): number {
  return STEPS.findIndex(([dx, dy]) => to.x - from.x === dx && to.y - from.y === dy);
}

/**
 * Walks the outline of every region holding `target`, following pixel edges.
 *
 * Each filled pixel contributes the edges its neighbours do not cover, wound
 * clockwise, so outer outlines come back clockwise and holes counter-clockwise.
 * Rendering the result with fill-rule="evenodd" therefore punches holes out
 * without any nesting analysis.
 */
export function traceRegions(
  indices: Int16Array,
  width: number,
  height: number,
  target: number,
): Point[][] {
  // Negative indices mark transparency in a quantised image; there is no
  // region to walk, and tracing one would outline the holes as if filled.
  if (target < 0) return [];

  const inside = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && indices[y * width + x] === target;

  const stride = width + 1;
  const keyOf = (x: number, y: number): number => y * stride + x;
  const edges = new Map<number, number[]>();

  const addEdge = (x0: number, y0: number, x1: number, y1: number): void => {
    const from = keyOf(x0, y0);
    const to = keyOf(x1, y1);
    const existing = edges.get(from);
    if (existing) existing.push(to);
    else edges.set(from, [to]);
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) addEdge(x, y, x + 1, y);
      if (!inside(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
      if (!inside(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
      if (!inside(x - 1, y)) addEdge(x, y + 1, x, y);
    }
  }

  const pointOf = (key: number): Point => ({ x: key % stride, y: Math.floor(key / stride) });
  const loops: Point[][] = [];

  for (const start of [...edges.keys()]) {
    while ((edges.get(start)?.length ?? 0) > 0) {
      const loop: Point[] = [];
      let current = start;
      let incoming = -1;

      while (true) {
        const outgoing = edges.get(current);
        if (!outgoing || outgoing.length === 0) break;

        let chosen = 0;
        if (outgoing.length > 1 && incoming !== -1) {
          // Four edges meet where two regions touch diagonally. Always taking
          // the sharpest clockwise turn splits them the same way every time,
          // which keeps the loops from crossing each other.
          const here = pointOf(current);
          const preference = [(incoming + 1) % 4, incoming, (incoming + 3) % 4, (incoming + 2) % 4];
          for (const wanted of preference) {
            const found = outgoing.findIndex((to) => directionOf(here, pointOf(to)) === wanted);
            if (found !== -1) {
              chosen = found;
              break;
            }
          }
        }

        const next = outgoing.splice(chosen, 1)[0]!;
        const here = pointOf(current);
        loop.push(here);
        incoming = directionOf(here, pointOf(next));
        current = next;
        if (current === start) break;
      }

      if (loop.length >= 3) loops.push(loop);
    }
  }

  return loops;
}

/** Twice the signed area — positive clockwise in screen coordinates. */
export function signedArea(points: readonly Point[]): number {
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    total += a.x * b.y - b.x * a.y;
  }
  return total / 2;
}

function perpendicularDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  return (
    Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) / Math.hypot(dx, dy)
  );
}

function simplifyChain(points: readonly Point[], tolerance: number): Point[] {
  if (points.length < 3) return [...points];

  const first = points[0]!;
  const last = points[points.length - 1]!;
  let worst = 0;
  let index = 0;

  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = perpendicularDistance(points[i]!, first, last);
    if (distance > worst) {
      worst = distance;
      index = i;
    }
  }

  if (worst <= tolerance) return [first, last];
  return [
    ...simplifyChain(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplifyChain(points.slice(index), tolerance),
  ];
}

/**
 * Douglas–Peucker on a closed loop. The loop is cut at its two most distant
 * points first, so the anchors are not an artefact of where tracing started.
 */
export function simplifyLoop(loop: readonly Point[], tolerance: number): Point[] {
  if (tolerance <= 0 || loop.length < 4) return [...loop];

  const first = loop[0]!;
  let opposite = 0;
  let furthest = -1;
  for (let i = 1; i < loop.length; i += 1) {
    const distance = Math.hypot(loop[i]!.x - first.x, loop[i]!.y - first.y);
    if (distance > furthest) {
      furthest = distance;
      opposite = i;
    }
  }

  const head = simplifyChain(loop.slice(0, opposite + 1), tolerance);
  const tail = simplifyChain([...loop.slice(opposite), first], tolerance);
  const merged = [...head.slice(0, -1), ...tail.slice(0, -1)];
  if (merged.length >= 3) return merged;

  // Simplified past a usable outline. Falling back to the full loop would make
  // a coarser setting produce a more detailed shape, so keep the widest
  // triangle the loop supports instead.
  const anchor = loop[opposite]!;
  let apex = first;
  let widest = -1;
  for (const point of loop) {
    const distance = Math.abs(
      (anchor.y - first.y) * point.x -
        (anchor.x - first.x) * point.y +
        anchor.x * first.y -
        anchor.y * first.x,
    );
    if (distance > widest) {
      widest = distance;
      apex = point;
    }
  }
  return [first, anchor, apex];
}

const round = (value: number, precision: number): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

/** Straight-edged path data for one closed loop. */
function polygonPath(loop: readonly Point[], precision: number): string {
  const move = `M${round(loop[0]!.x, precision)} ${round(loop[0]!.y, precision)}`;
  const lines = loop
    .slice(1)
    .map((point) => `L${round(point.x, precision)} ${round(point.y, precision)}`)
    .join("");
  return `${move}${lines}Z`;
}

/**
 * Rounded path data: corners become quadratic control points and the curve
 * runs through the midpoint of every edge, which takes the staircase off
 * diagonal outlines without moving the outline far.
 */
function smoothPath(loop: readonly Point[], precision: number): string {
  const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = midpoint(loop[loop.length - 1]!, loop[0]!);

  let data = `M${round(start.x, precision)} ${round(start.y, precision)}`;
  for (let i = 0; i < loop.length; i += 1) {
    const corner = loop[i]!;
    const end = midpoint(corner, loop[(i + 1) % loop.length]!);
    data +=
      `Q${round(corner.x, precision)} ${round(corner.y, precision)} ` +
      `${round(end.x, precision)} ${round(end.y, precision)}`;
  }
  return `${data}Z`;
}

export function toPathData(
  loops: ReadonlyArray<readonly Point[]>,
  smooth: boolean,
  precision = 1,
): string {
  return loops
    .map((loop) => (smooth ? smoothPath(loop, precision) : polygonPath(loop, precision)))
    .join("");
}
