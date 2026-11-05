import { it, expect } from "vitest";
import { demoProject } from "../demo/logo";
import { addPenPath } from "./pen";
it("creates closed and open paths without mutating the original", () => {
  const input = demoProject(),
    points = [
      { x: 20, y: 30 },
      { x: 120, y: 30 },
      { x: 60, y: 90 },
    ];
  const closed = addPenPath(input, points, true),
    open = addPenPath(input, points, false);
  expect(input.parts).toHaveLength(6);
  expect(closed.project.parts).toHaveLength(7);
  const c = closed.project.parts.at(-1)!,
    o = open.project.parts.at(-1)!;
  expect(c.geometry.d).toBe("M 0 0 L 100 0 L 40 60 Z");
  expect(c.fill).toBe("#eeeeee");
  expect(o.fill).toBe("none");
  expect(o.stroke).toBe("#eeeeee");
  expect(closed.project.source).toEqual(input.source);
});
it("rejects invalid, degenerate and overly large drawings without changes", () => {
  const p = demoProject();
  for (const points of [
    [],
    [{ x: 1, y: 2 }],
    [
      { x: 1, y: 2 },
      { x: 1, y: 2 },
    ],
    [
      { x: NaN, y: 1 },
      { x: 1, y: 2 },
    ],
    [
      { x: -1e6, y: 0 },
      { x: 1e6, y: 0 },
    ],
    Array.from({ length: 201 }, (_, i) => ({ x: i, y: i })),
  ]) {
    expect(() => addPenPath(p, points, false)).toThrow();
  }
  expect(p.parts).toHaveLength(6);
});

it("builds smooth cubic segments and closes curves with valid control points", () => {
  const p = demoProject();
  const pts = [
    { x: 10, y: 20, handleX: 20, handleY: 0 },
    { x: 90, y: 40, handleX: 0, handleY: 15 },
    { x: 70, y: 80 },
  ];
  const open = addPenPath(p, pts, false).project.parts.at(-1)!;
  expect(open.geometry.d).toBe("M 0 0 C 20 0 80 5 80 20 C 80 35 60 60 60 60");
  const closed = addPenPath(p, pts, true).project.parts.at(-1)!;
  expect(closed.geometry.d).toContain("C 60 60 -20 0 0 0 Z");
  expect(() =>
    addPenPath(
      p,
      [
        { x: 0, y: 0, handleX: Infinity },
        { x: 3, y: 4 },
      ],
      false,
    ),
  ).toThrow();
});

it("rejects control points outside supported local geometry", () => {
  const p = demoProject();
  expect(() =>
    addPenPath(
      p,
      [
        { x: -900000, y: 0 },
        { x: -10000, y: 0, handleX: 900000 },
      ],
      false,
    ),
  ).toThrow(/too large/);
});
