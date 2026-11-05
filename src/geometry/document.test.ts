import { it, expect } from "vitest";
import { demoProject } from "../demo/logo";
import { geometryParts, replacePaths } from "./document";
import type { GeometryResult } from "./types";
const result: GeometryResult = {
  pathData: "M0 0L100 0L100 100Z",
  paths: [],
  area: 5000,
  space: "world",
};
it("rejects protected, missing, raster, and visible outlined Boolean inputs", () => {
  const p = demoProject();
  p.parts[0].locked = true;
  expect(() => geometryParts(p, ["petal-1", "petal-2"], true)).toThrow(
    /unlock/,
  );
  p.parts[0].locked = false;
  p.parts[0].stroke = "#ffffff";
  p.parts[0].strokeWidth = 2;
  expect(() => geometryParts(p, ["petal-1", "petal-2"], true)).toThrow(
    /outlines/,
  );
  expect(() => geometryParts(p, ["missing"], false)).toThrow(/changed/);
});
it("replaces selected paths in stable stacking order and preserves original source", () => {
  const p = demoProject(),
    r = replacePaths(p, ["petal-1", "petal-2"], result, "Union");
  expect(r.project.parts).toHaveLength(5);
  expect(r.project.parts[0].name).toBe("Union");
  expect(r.project.parts[1].id).toBe("petal-3");
  expect(r.project.source).toEqual(p.source);
  expect(p.parts).toHaveLength(6);
});
it("retains transforms and stroke behavior for local node edits", () => {
  const p = demoProject();
  p.parts[0].x = 23;
  p.parts[0].matrix = [2, 0, 0, 3, 10, 20];
  const r = replacePaths(
    p,
    ["petal-1"],
    { ...result, space: "local" },
    "Petal 1",
  );
  expect(r.project.parts[0].matrix).toEqual(p.parts[0].matrix);
  expect(r.project.parts[0].x).toBe(23);
});
it("does not accept empty geometry output", () => {
  expect(() =>
    replacePaths(
      demoProject(),
      ["petal-1"],
      { ...result, pathData: "" },
      "Empty",
    ),
  ).toThrow(/Invalid/);
});
