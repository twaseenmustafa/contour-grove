import { describe, it, expect } from "vitest";
import { zoomBox, panBy } from "./viewport";
describe("preview pan", () => {
  it("offsets the fitted camera without changing document bounds", () => {
    const base = [-20, 10, 400, 200];
    expect(zoomBox(base, 2, { x: 30, y: -10 })).toEqual([110, 50, 200, 100]);
    expect(base).toEqual([-20, 10, 400, 200]);
  });
  it("clamps preview movement and rejects nonfinite values", () => {
    expect(panBy({ x: 999999, y: 0 }, 20, -5)).toEqual({ x: 1e6, y: -5 });
    expect(() => panBy({ x: 0, y: 0 }, NaN, 0)).toThrow();
    expect(() => zoomBox([0, 0, 10, 10], 1, { x: Infinity, y: 0 })).toThrow();
  });
});
