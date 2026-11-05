import type { Part } from "./project";
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Adjustment {
  scaleX: number;
  scaleY: number;
  rotation: number;
  cx: number;
  cy: number;
}
export interface Point {
  x: number;
  y: number;
}
export type Corner = "nw" | "ne" | "sw" | "se";
export const clampScale = (value: number) =>
  Math.min(100, Math.max(0.01, value));
export const normalizeAngle = (angle: number) =>
  ((((angle + 180) % 360) + 360) % 360) - 180;
export function adjustment(part: Part, bounds: Bounds): Adjustment {
  return (
    part.adjustment ?? {
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      cx: bounds.x + bounds.width / 2,
      cy: bounds.y + bounds.height / 2,
    }
  );
}
export function adjustmentText(a?: Adjustment): string {
  return a
    ? `translate(${a.cx} ${a.cy}) rotate(${a.rotation}) scale(${a.scaleX} ${a.scaleY}) translate(${-a.cx} ${-a.cy})`
    : "";
}
export function rotateVector(point: Point, angle: number): Point {
  const r = (angle * Math.PI) / 180,
    c = Math.cos(r),
    s = Math.sin(r);
  return { x: point.x * c - point.y * s, y: point.x * s + point.y * c };
}
export function frame(part: Part, bounds: Bounds) {
  const a = adjustment(part, bounds),
    offset = rotateVector(
      {
        x: (bounds.x + bounds.width / 2 - a.cx) * a.scaleX,
        y: (bounds.y + bounds.height / 2 - a.cy) * a.scaleY,
      },
      a.rotation,
    );
  return {
    cx: a.cx + offset.x + part.x,
    cy: a.cy + offset.y + part.y,
    width: bounds.width * a.scaleX,
    height: bounds.height * a.scaleY,
    rotation: a.rotation,
  };
}
export function sizedPart(
  part: Part,
  bounds: Bounds,
  dimension: "width" | "height",
  value: number,
  locked: boolean,
): Part {
  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    bounds.width < 1e-6 ||
    bounds.height < 1e-6
  )
    throw Error("Enter a positive size for a shape with width and height.");
  const a = adjustment(part, bounds),
    key = dimension === "width" ? "scaleX" : "scaleY",
    base = dimension === "width" ? bounds.width : bounds.height,
    target = value / base;
  if (target < 0.01 || target > 100)
    throw Error("Size must be between 1% and 10,000% of the original shape.");
  const ratio = target / a[key],
    next = { ...a, [key]: target };
  if (locked) {
    next.scaleX = a.scaleX * ratio;
    next.scaleY = a.scaleY * ratio;
    if (
      next.scaleX < 0.01 ||
      next.scaleX > 100 ||
      next.scaleY < 0.01 ||
      next.scaleY > 100
    )
      throw Error("That size exceeds the supported range.");
  }
  return { ...part, adjustment: next };
}
export function rotatedPart(part: Part, bounds: Bounds, angle: number): Part {
  if (!Number.isFinite(angle)) throw Error("Enter a valid angle.");
  return {
    ...part,
    adjustment: {
      ...adjustment(part, bounds),
      rotation: normalizeAngle(angle),
    },
  };
}
export function cornerResize(
  part: Part,
  bounds: Bounds,
  corner: Corner,
  delta: Point,
  locked: boolean,
): Part {
  if (bounds.width < 1e-6 || bounds.height < 1e-6) return part;
  const a = adjustment(part, bounds),
    f = frame(part, bounds),
    local = rotateVector(delta, -a.rotation),
    sx = corner.endsWith("e") ? 1 : -1,
    sy = corner.startsWith("s") ? 1 : -1;
  let scaleX = (f.width + sx * local.x) / bounds.width,
    scaleY = (f.height + sy * local.y) / bounds.height;
  if (locked) {
    const ratio =
      ((f.width + sx * local.x) * f.width +
        (f.height + sy * local.y) * f.height) /
      (f.width * f.width + f.height * f.height);
    const k = Math.min(
      100 / a.scaleX,
      100 / a.scaleY,
      Math.max(0.01 / a.scaleX, 0.01 / a.scaleY, ratio),
    );
    scaleX = a.scaleX * k;
    scaleY = a.scaleY * k;
  } else {
    scaleX = clampScale(scaleX);
    scaleY = clampScale(scaleY);
  }
  const shift = rotateVector(
    {
      x: (sx * (bounds.width * scaleX - f.width)) / 2,
      y: (sy * (bounds.height * scaleY - f.height)) / 2,
    },
    a.rotation,
  );
  // Changing scale around a noncentral pivot also shifts the box center. Compensate for it.
  const oldOffset = rotateVector(
      {
        x: (bounds.x + bounds.width / 2 - a.cx) * a.scaleX,
        y: (bounds.y + bounds.height / 2 - a.cy) * a.scaleY,
      },
      a.rotation,
    ),
    newOffset = rotateVector(
      {
        x: (bounds.x + bounds.width / 2 - a.cx) * scaleX,
        y: (bounds.y + bounds.height / 2 - a.cy) * scaleY,
      },
      a.rotation,
    );
  return {
    ...part,
    x: part.x + shift.x + oldOffset.x - newOffset.x,
    y: part.y + shift.y + oldOffset.y - newOffset.y,
    adjustment: { ...a, scaleX, scaleY },
  };
}
