import { expect, it } from "vitest";
import { snapMove, snapResize } from "./snap";
import { demoProject } from "../demo/logo";
import { frame, rotateVector } from "./transform";
const a = { x: 0, y: 0, width: 100, height: 100 },
  b = { x: 200, y: 200, width: 100, height: 100 };
it("aligns the nearest edges or centers within tolerance independently", () => {
  expect(snapMove(a, [b], 98, 98, 5)).toEqual({
    dx: 100,
    dy: 100,
    xGuide: 200,
    yGuide: 200,
  });
  expect(snapMove(a, [b], 90, 40, 5)).toEqual({
    dx: 90,
    dy: 40,
    xGuide: null,
    yGuide: null,
  });
});
it("keeps movement unchanged when there are no targets", () => {
  expect(snapMove(a, [], 13, -9, 6)).toEqual({
    dx: 13,
    dy: -9,
    xGuide: null,
    yGuide: null,
  });
});

it("resize snapping retains the opposite corner and locked proportions under rotation", () => {
  const p = demoProject().parts[0],
    bounds = { x: 0, y: 0, width: 100, height: 80 };
  p.x = 10;
  p.y = 20;
  p.adjustment = { cx: 15, cy: 25, scaleX: 1, scaleY: 1, rotation: 30 };
  const corner = (part: typeof p, sign: number) => {
    const f = frame(part, bounds),
      o = rotateVector(
        { x: (sign * f.width) / 2, y: (sign * f.height) / 2 },
        f.rotation,
      );
    return { x: f.cx + o.x, y: f.cy + o.y };
  };
  const initial = corner(p, -1);
  const raw = snapResize(p, bounds, "se", { x: 25, y: 20 }, true, [], 6);
  const c = corner(raw.part, 1);
  const aligned = snapResize(
    p,
    bounds,
    "se",
    { x: 25, y: 20 },
    true,
    [{ x: c.x + 2, y: 10000, width: 100, height: 100 }],
    6,
  );
  const end = corner(aligned.part, 1),
    fixed = corner(aligned.part, -1);
  expect(aligned.xGuide).toBeCloseTo(c.x + 2, 6);
  expect(end.x).toBeCloseTo(c.x + 2, 5);
  expect(fixed.x).toBeCloseTo(initial.x, 5);
  expect(fixed.y).toBeCloseTo(initial.y, 5);
  expect(aligned.part.adjustment!.scaleX).toBeCloseTo(
    aligned.part.adjustment!.scaleY,
    6,
  );
});
