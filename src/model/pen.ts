import { shapePart } from "../commands/document";
import { finite, validateProject, type Project } from "./project";
import type { Point } from "./transform";
export type PenPoint = Point & { handleX?: number; handleY?: number };
/** Symmetrical handles: drag from an anchor in the direction of the outgoing curve. */
export function penPathData(
  points: PenPoint[],
  closed: boolean,
  origin: Point = { x: 0, y: 0 },
) {
  if (!points.length) return "";
  const n = (value: number) => String(Number(value.toFixed(3)));
  const xy = (x: number, y: number) => n(x - origin.x) + " " + n(y - origin.y);
  let d = "M " + xy(points[0].x, points[0].y);
  const segment = (a: PenPoint, b: PenPoint) => {
    const ax = a.handleX ?? 0,
      ay = a.handleY ?? 0,
      bx = b.handleX ?? 0,
      by = b.handleY ?? 0;
    return ax || ay || bx || by
      ? " C " +
          xy(a.x + ax, a.y + ay) +
          " " +
          xy(b.x - bx, b.y - by) +
          " " +
          xy(b.x, b.y)
      : " L " + xy(b.x, b.y);
  };
  for (let i = 1; i < points.length; i++)
    d += segment(points[i - 1], points[i]);
  if (closed) {
    const a = points[points.length - 1],
      b = points[0];
    if (a.handleX || a.handleY || b.handleX || b.handleY) d += segment(a, b);
    d += " Z";
  }
  return d;
}
/** Bounded path creation; the document changes only when drawing is finished. */
export function addPenPath(
  project: Project,
  points: PenPoint[],
  closed: boolean,
) {
  if (
    points.length < (closed ? 3 : 2) ||
    points.length > 200 ||
    points.some(
      (p) =>
        !finite(p.x) ||
        !finite(p.y) ||
        !finite(p.handleX ?? 0) ||
        !finite(p.handleY ?? 0) ||
        !finite(p.x + (p.handleX ?? 0)) ||
        !finite(p.y + (p.handleY ?? 0)) ||
        !finite(p.x - (p.handleX ?? 0)) ||
        !finite(p.y - (p.handleY ?? 0)),
    )
  )
    throw Error("Add more points within the supported canvas area.");
  const origin = points[0];
  const coords = points.map((p) => ({
    x: Number((p.x - origin.x).toFixed(3)),
    y: Number((p.y - origin.y).toFixed(3)),
  }));
  if (
    coords.some((p) => !finite(p.x) || !finite(p.y)) ||
    points.some((p) =>
      [
        p.x + (p.handleX ?? 0) - origin.x,
        p.x - (p.handleX ?? 0) - origin.x,
        p.y + (p.handleY ?? 0) - origin.y,
        p.y - (p.handleY ?? 0) - origin.y,
      ].some((n) => !finite(n)),
    )
  )
    throw Error("This drawing is too large. Try a smaller drawing.");
  if (coords.every((p) => p.x === 0 && p.y === 0))
    throw Error("Add another point away from the first.");
  const d = penPathData(points, closed, origin);
  const part = {
    ...shapePart(project, {
      type: "create",
      shape: "rectangle",
      x: origin.x,
      y: origin.y,
      width: 1,
      height: 1,
    }),
    name: closed ? "Pen shape" : "Pen line",
    group: "Drawing",
    kind: "path" as const,
    geometry: { d },
    fill: closed ? "#eeeeee" : "none",
    stroke: closed ? "none" : "#eeeeee",
    strokeWidth: closed ? 0 : 2,
  };
  return {
    project: validateProject({ ...project, parts: [...project.parts, part] }),
    id: part.id,
  };
}
