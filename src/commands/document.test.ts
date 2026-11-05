import { it, expect } from "vitest";
import { demoProject } from "../demo/logo";
import { applyCommandRequest, shapePart } from "./document";
const create = {
  type: "create",
  shape: "rectangle",
  x: 20,
  y: 30,
  width: 100,
  height: 80,
} as const;
it("creates all five native shapes with neutral paint and unique IDs", () => {
  for (const shape of [
    "rectangle",
    "ellipse",
    "triangle",
    "star",
    "line",
  ] as const) {
    const p = shapePart(demoProject(), { ...create, shape });
    expect(p.fill).toBe(shape === "line" ? "none" : "#eeeeee");
    expect(p.geometry).toBeTruthy();
  }
});
it("applies a batch atomically and preserves source", () => {
  const p = demoProject(),
    r = applyCommandRequest(
      p,
      {
        version: 1,
        expectedRevision: 3,
        commands: [create, { type: "renameDocument", name: "My logo" }],
      },
      3,
    );
  expect(r.project.parts).toHaveLength(7);
  expect(r.project.name).toBe("My logo");
  expect(r.project.source).toEqual(p.source);
  expect(p.parts).toHaveLength(6);
  expect(r.revision).toBe(4);
});
it("rejects stale revisions and unsupported commands", () => {
  expect(() =>
    applyCommandRequest(
      demoProject(),
      { version: 1, expectedRevision: 2, commands: [create] },
      3,
    ),
  ).toThrow(/conflict/);
  expect(() =>
    applyCommandRequest(
      demoProject(),
      {
        version: 1,
        expectedRevision: 3,
        commands: [{ type: "eval", code: "alert(1)" }],
      },
      3,
    ),
  ).toThrow(/Unsupported/);
});
it("rejects unknown and prototype-polluting fields without partial edits", () => {
  const p = demoProject();
  expect(() =>
    applyCommandRequest(
      p,
      JSON.parse(
        '{"version":1,"expectedRevision":1,"commands":[{"type":"create","shape":"rectangle","x":0,"y":0,"width":10,"height":10},{"type":"set","ids":["petal-1"],"changes":{"__proto__":{"polluted":true}}}]}',
      ),
      1,
    ),
  ).toThrow(/Unknown/);
  expect(p.parts).toHaveLength(6);
});
it("rejects unsafe paint and invalid numeric data", () => {
  expect(() =>
    applyCommandRequest(
      demoProject(),
      {
        version: 1,
        expectedRevision: 1,
        commands: [{ ...create, fill: "url(https://evil.example)" }],
      },
      1,
    ),
  ).toThrow(/paint/);
  expect(() =>
    applyCommandRequest(
      demoProject(),
      { version: 1, expectedRevision: 1, commands: [{ ...create, x: NaN }] },
      1,
    ),
  ).toThrow(/position/);
});
it("does not silently clamp out-of-range command movement", () => {
  expect(() =>
    applyCommandRequest(
      demoProject(),
      {
        version: 1,
        expectedRevision: 1,
        commands: [{ type: "move", ids: ["petal-1"], dx: 1e7, dy: 0 }],
      },
      1,
    ),
  ).toThrow(/coordinates/);
});
it("rejects appearance edits on locked or missing targets", () => {
  const p = demoProject();
  p.parts[0].locked = true;
  expect(() =>
    applyCommandRequest(
      p,
      {
        version: 1,
        expectedRevision: 1,
        commands: [
          { type: "set", ids: ["petal-1"], changes: { fill: "#ffffff" } },
        ],
      },
      1,
    ),
  ).toThrow(/unlock/);
  expect(() =>
    applyCommandRequest(
      p,
      {
        version: 1,
        expectedRevision: 1,
        commands: [{ type: "move", ids: ["gone"], dx: 1, dy: 0 }],
      },
      1,
    ),
  ).toThrow(/missing/);
});
