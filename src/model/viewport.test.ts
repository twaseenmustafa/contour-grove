import { describe, it, expect } from "vitest";
import { zoomBox } from "./viewport";
describe("preview viewport", () => {
  it("keeps a zoomed camera centered", () =>
    expect(zoomBox([10, 20, 400, 200], 2)).toEqual([110, 70, 200, 100]));
  it("fits exactly and zooms out without modifying the base", () => {
    const b = [10, -20, 100, 200];
    expect(zoomBox(b, 1)).toEqual(b);
    expect(zoomBox(b, 0.5)).toEqual([-40, -120, 200, 400]);
    expect(b).toEqual([10, -20, 100, 200]);
  });
  it("rejects invalid and unbounded cameras", () => {
    for (const z of [NaN, Infinity, 0, -1, 0.049, 16.01])
      expect(() => zoomBox([0, 0, 100, 100], z)).toThrow();
    expect(() => zoomBox([0, 0, 0, 100], 1)).toThrow();
  });
});
