import { describe, it, expect } from "vitest";
import { demoProject } from "../demo/logo";
import { resizeCanvas, trimCanvas } from "./framing";
describe("non-destructive canvas framing", () => {
  it("resizes about the existing center", () => {
    const p = demoProject();
    const n = resizeCanvas(p, 640, 160);
    expect(n.viewBox).toEqual([-80, 160, 640, 160]);
    expect(n.parts).toEqual(p.parts);
    expect(n.source).toEqual(p.source);
    expect(p.viewBox).toEqual([80, 80, 320, 320]);
  });
  it("trims union bounds with explicit padding", () => {
    const p = demoProject();
    const n = trimCanvas(
      p,
      [
        { x: -10, y: 20, width: 40, height: 50 },
        { x: 50, y: -5, width: 10, height: 30 },
      ],
      8,
    );
    expect(n.viewBox).toEqual([-18, -13, 86, 91]);
    expect(n.parts).toEqual(p.parts);
  });
  it("rejects empty and unmeasurable artwork", () => {
    const p = demoProject();
    expect(() => trimCanvas(p, [], 16)).toThrow(/visible/);
    expect(() =>
      trimCanvas(p, [{ x: NaN, y: 0, width: 2, height: 2 }], 16),
    ).toThrow(/safely/);
  });
  it("bounds padding and dimensions without mutation", () => {
    const p = demoProject();
    for (const n of [0, -1, NaN, Infinity, 100001])
      expect(() => resizeCanvas(p, n, 100)).toThrow();
    for (const n of [-1, NaN, 5001])
      expect(() =>
        trimCanvas(p, [{ x: 0, y: 0, width: 3, height: 2 }], n),
      ).toThrow();
    expect(p.viewBox).toEqual([80, 80, 320, 320]);
  });
  it("supports empty document framing and tiny geometry", () => {
    const p = { ...demoProject(), parts: [] };
    expect(resizeCanvas(p, 1, 1).parts).toEqual([]);
    expect(
      trimCanvas(p, [{ x: 10, y: 10, width: 0, height: 0 }], 0).viewBox,
    ).toEqual([10, 10, 1, 1]);
  });
  it("preserves organization metadata and hidden shapes", () => {
    const p = demoProject();
    p.parts[0].hidden = true;
    p.parts[1].locked = true;
    const n = trimCanvas(p, [{ x: 2, y: 3, width: 50, height: 60 }], 0);
    expect(n.parts).toEqual(p.parts);
  });
});
