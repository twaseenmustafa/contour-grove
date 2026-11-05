import { describe, expect, it } from "vitest";
import { demoProject } from "../demo/logo";
import { validateProject } from "./project";
import {
  adjustment,
  adjustmentText,
  cornerResize,
  frame,
  normalizeAngle,
  rotateVector,
  rotatedPart,
  sizedPart,
  type Bounds,
  type Corner,
} from "./transform";
const bounds: Bounds = { x: 10, y: 20, width: 100, height: 60 };
const sample = () => ({ ...demoProject().parts[0], x: 0, y: 0 });
function corner(part: ReturnType<typeof sample>, name: Corner) {
  const f = frame(part, bounds),
    v = rotateVector(
      {
        x: ((name.endsWith("e") ? 1 : -1) * f.width) / 2,
        y: ((name.startsWith("s") ? 1 : -1) * f.height) / 2,
      },
      f.rotation,
    );
  return { x: f.cx + v.x, y: f.cy + v.y };
}
describe("non-destructive size and rotation", () => {
  it("defaults old projects to identity centered on geometry bounds", () => {
    const p = sample();
    expect(adjustment(p, bounds)).toEqual({
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      cx: 60,
      cy: 50,
    });
    expect(frame(p, bounds).width).toBe(100);
    expect(adjustmentText()).toBe("");
  });
  it("normalizes full turns and negative angles", () => {
    expect(normalizeAngle(370)).toBe(10);
    expect(normalizeAngle(-370)).toBe(-10);
    expect(normalizeAngle(180)).toBe(-180);
  });
  it("resizes proportionally without changing original geometry or matrix", () => {
    const p = sample(),
      next = sizedPart(p, bounds, "width", 200, true);
    expect(frame(next, bounds).height).toBe(120);
    expect(next.matrix).toEqual(p.matrix);
    expect(next.geometry).toEqual(p.geometry);
    expect(p.adjustment).toBeUndefined();
  });
  it("resizes one dimension with unlocked proportions", () => {
    const next = sizedPart(sample(), bounds, "width", 200, false);
    expect(frame(next, bounds).height).toBe(60);
  });
  it("rotates without changing dimensions", () => {
    const f = frame(rotatedPart(sample(), bounds, 45), bounds);
    expect(f.rotation).toBe(45);
    expect(f.width).toBe(100);
    expect(f.height).toBe(60);
  });
  it("anchors opposite corner in unlocked pointer resize", () => {
    const p = rotatedPart(sample(), bounds, 37),
      before = corner(p, "nw"),
      next = cornerResize(p, bounds, "se", { x: 40, y: 35 }, false),
      after = corner(next, "nw");
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });
  it("anchors opposite corner with locked proportions and rotation", () => {
    const p = rotatedPart(sample(), bounds, -70),
      before = corner(p, "se"),
      next = cornerResize(p, bounds, "nw", { x: -40, y: -35 }, true),
      after = corner(next, "se");
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(frame(next, bounds).width / frame(next, bounds).height).toBeCloseTo(
      100 / 60,
    );
  });
  it("never flips or collapses on dragging through the anchor", () => {
    const next = cornerResize(
      sample(),
      bounds,
      "se",
      { x: -9999, y: -9999 },
      false,
    );
    expect(next.adjustment?.scaleX).toBe(0.01);
    expect(next.adjustment?.scaleY).toBe(0.01);
  });
  it("rejects invalid or out-of-range numeric dimensions", () => {
    for (const n of [0, -1, NaN, Infinity, 999999])
      expect(() => sizedPart(sample(), bounds, "width", n, true)).toThrow();
  });
  it("handles zero-width geometry without invalid scales", () => {
    const p = sample();
    expect(
      cornerResize(p, { ...bounds, width: 0 }, "se", { x: 4, y: 5 }, false),
    ).toBe(p);
    expect(() =>
      sizedPart(p, { ...bounds, width: 0 }, "width", 10, true),
    ).toThrow();
  });
  it("validates optional adjustments and rejects malformed backups", () => {
    const p = demoProject();
    p.parts[0] = rotatedPart(p.parts[0], bounds, 25);
    expect(validateProject(p).parts[0].adjustment?.rotation).toBe(25);
    p.parts[0].adjustment!.scaleX = 0;
    expect(() => validateProject(p)).toThrow(/size or rotation/);
  });
  it("handles repeated dimensions and very small aspect ratios with bounded scales", () => {
    const p = sample();
    const next = cornerResize(p, bounds, "se", { x: 1e9, y: 1e9 }, true);
    expect(next.adjustment!.scaleX).toBeLessThanOrEqual(100);
    expect(next.adjustment!.scaleY).toBeLessThanOrEqual(100);
  });
});
