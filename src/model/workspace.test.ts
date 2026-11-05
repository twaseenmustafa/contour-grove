import { it, expect } from "vitest";
import { workspaceBox, anchoredPan } from "./viewport";
it("uses the full panel aspect and includes space around the export frame", () => {
  const b = workspaceBox(
    [0, 0, 320, 320],
    1,
    { x: 0, y: 0 },
    { width: 1000, height: 600 },
  );
  expect(b[2] / b[3]).toBeCloseTo(1000 / 600);
  expect(b[0]).toBeLessThan(0);
  expect(b[1]).toBeLessThan(0);
});
it("supports broad zoom, negative coordinates and finite limits", () => {
  expect(
    workspaceBox(
      [-200, -100, 320, 240],
      0.05,
      { x: -500, y: 800 },
      { width: 800, height: 600 },
    ).every(Number.isFinite),
  ).toBe(true);
  expect(() =>
    workspaceBox(
      [0, 0, 320, 320],
      0,
      { x: 0, y: 0 },
      { width: 800, height: 600 },
    ),
  ).toThrow();
});
it("keeps the pointer anchor fixed in world space during zoom", () => {
  const p = anchoredPan(
    { x: 10, y: 20 },
    { x: 200, y: 100 },
    { x: 100, y: 100 },
    1,
    2,
  );
  expect(p).toEqual({ x: 60, y: 20 });
});
