import { describe, it, expect } from "vitest";
import { demoProject } from "../demo/logo";
import { arrange } from "./layout";
const boxes = new Map([
  ["petal-1", { x: 10, y: 20, width: 20, height: 30 }],
  ["petal-2", { x: 80, y: 60, width: 40, height: 20 }],
  ["petal-3", { x: 200, y: 100, width: 10, height: 10 }],
]);
function fixture() {
  const p = demoProject();
  p.parts = p.parts
    .slice(0, 3)
    .map((part, i) => ({ ...part, id: `petal-${i + 1}`, x: 0, y: 0 }));
  return p;
}
describe("geometric layout", () => {
  it("centers a single shape on the actual artboard origin", () => {
    const p = fixture(),
      r = arrange(p, ["petal-1"], boxes, "center-x", "canvas");
    expect(r.parts[0].x).toBe(220);
    expect(p.parts[0].x).toBe(0);
    expect(r.source).toEqual(p.source);
  });
  it("aligns selected edges without changing geometry", () => {
    const p = fixture(),
      r = arrange(p, ["petal-1", "petal-2"], boxes, "left", "selection");
    expect(r.parts[1].x).toBe(-70);
    expect(r.parts[1].geometry).toEqual(p.parts[1].geometry);
  });
  it("distributes equal gaps rather than centers", () => {
    const r = arrange(
      fixture(),
      ["petal-1", "petal-2", "petal-3"],
      boxes,
      "distribute-x",
      "selection",
    );
    expect(r.parts.map((p) => p.x)).toEqual([0, 15, 0]);
  });
  it("treats expanded group siblings as one rigid unit", () => {
    const p = fixture();
    p.groups = [{ id: "group-1", name: "Group 1" }];
    p.parts[0].groupId = "group-1";
    p.parts[1].groupId = "group-1";
    const r = arrange(p, ["petal-1"], boxes, "left", "canvas");
    expect(r.parts[0].x).toBe(70);
    expect(r.parts[1].x).toBe(70);
    expect(r.parts[2].x).toBe(0);
  });
  it("rejects protected group siblings atomically", () => {
    const p = fixture();
    p.groups = [{ id: "group-1", name: "Group 1" }];
    p.parts[0].groupId = p.parts[1].groupId = "group-1";
    p.parts[1].locked = true;
    expect(() => arrange(p, ["petal-1"], boxes, "left", "canvas")).toThrow(
      /unlock/,
    );
    expect(p.parts[0].x).toBe(0);
  });
  it("rejects missing or invalid measurements", () => {
    expect(() =>
      arrange(fixture(), ["petal-1"], new Map(), "left", "canvas"),
    ).toThrow(/measure/);
    expect(() =>
      arrange(
        fixture(),
        ["petal-1"],
        new Map([["petal-1", { x: NaN, y: 0, width: 1, height: 1 }]]),
        "left",
        "canvas",
      ),
    ).toThrow(/measure/);
  });
  it("requires three independent layout units for distribution", () => {
    expect(() =>
      arrange(
        fixture(),
        ["petal-1", "petal-2"],
        boxes,
        "distribute-y",
        "selection",
      ),
    ).toThrow(/three/);
  });
  it("rejects stale selection IDs", () => {
    expect(() => arrange(fixture(), ["gone"], boxes, "left", "canvas")).toThrow(
      /changed/,
    );
  });
});
