import type { Part } from "./project";
import {
  cornerResize,
  frame,
  rotateVector,
  type Bounds,
  type Corner,
  type Point,
} from "./transform";
export interface SnapResult {
  dx: number;
  dy: number;
  xGuide: number | null;
  yGuide: number | null;
}
/** Snap moving bounds to visible target edges and centers within a screen-sized threshold. */
export function snapMove(
  moving: Bounds,
  targets: Bounds[],
  dx: number,
  dy: number,
  threshold: number,
): SnapResult {
  const edges = (v: number, size: number) => [v, v + size / 2, v + size];
  function axis(
    start: number,
    size: number,
    delta: number,
    others: number[][],
  ): [number, number | null] {
    let best = threshold + 1,
      correction = 0,
      guide: number | null = null;
    for (const source of edges(start + delta, size))
      for (const target of others.flat()) {
        const diff = target - source,
          distance = Math.abs(diff);
        if (distance <= threshold && distance < best) {
          best = distance;
          correction = diff;
          guide = target;
        }
      }
    return [delta + correction, guide];
  }
  const [x, xGuide] = axis(
    moving.x,
    moving.width,
    dx,
    targets.map((b) => edges(b.x, b.width)),
  );
  const [y, yGuide] = axis(
    moving.y,
    moving.height,
    dy,
    targets.map((b) => edges(b.y, b.height)),
  );
  return { dx: x, dy: y, xGuide, yGuide };
}

/** Snap the moving corner while leaving the opposite corner fixed. */
export function snapResize(
  part: Part,
  bounds: Bounds,
  corner: Corner,
  delta: Point,
  locked: boolean,
  targets: Bounds[],
  threshold: number,
) {
  const sx = corner.endsWith("e") ? 1 : -1,
    sy = corner.startsWith("s") ? 1 : -1;
  const point = (p: Part, side: number) => {
    const f = frame(p, bounds);
    const q = rotateVector(
      { x: (side * sx * f.width) / 2, y: (side * sy * f.height) / 2 },
      f.rotation,
    );
    return { x: f.cx + q.x, y: f.cy + q.y };
  };
  const candidate = cornerResize(part, bounds, corner, delta, locked),
    current = point(candidate, 1),
    fixed = point(part, -1);
  const xs = targets.flatMap((b) => [b.x, b.x + b.width / 2, b.x + b.width]);
  const ys = targets.flatMap((b) => [b.y, b.y + b.height / 2, b.y + b.height]);
  let correction: Point = { x: 0, y: 0 },
    xGuide: number | null = null,
    yGuide: number | null = null;
  if (locked) {
    const vx = current.x - fixed.x,
      vy = current.y - fixed.y;
    let best = threshold + 1;
    for (const x of xs) {
      if (Math.abs(vx) < 1e-9) continue;
      const factor = (x - fixed.x) / vx;
      if (factor <= 0) continue;
      const dx = vx * (factor - 1),
        dy = vy * (factor - 1),
        dist = Math.hypot(dx, dy);
      if (dist <= threshold && dist < best) {
        best = dist;
        correction = { x: dx, y: dy };
        xGuide = x;
        yGuide = null;
      }
    }
    for (const y of ys) {
      if (Math.abs(vy) < 1e-9) continue;
      const factor = (y - fixed.y) / vy;
      if (factor <= 0) continue;
      const dx = vx * (factor - 1),
        dy = vy * (factor - 1),
        dist = Math.hypot(dx, dy);
      if (dist <= threshold && dist < best) {
        best = dist;
        correction = { x: dx, y: dy };
        yGuide = y;
        xGuide = null;
      }
    }
  } else {
    const r = snapMove(
      { x: current.x, y: current.y, width: 0, height: 0 },
      targets,
      0,
      0,
      threshold,
    );
    correction = { x: r.dx, y: r.dy };
    xGuide = r.xGuide;
    yGuide = r.yGuide;
  }
  const result = cornerResize(
      part,
      bounds,
      corner,
      { x: delta.x + correction.x, y: delta.y + correction.y },
      locked,
    ),
    final = point(result, 1);
  if (xGuide !== null && Math.abs(final.x - xGuide) > 1e-4) xGuide = null;
  if (yGuide !== null && Math.abs(final.y - yGuide) > 1e-4) yGuide = null;
  return { part: result, xGuide, yGuide };
}
