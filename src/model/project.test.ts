import { describe, it, expect } from "vitest";
import { demoProject } from "../demo/logo";
import {
  validateProject,
  parseTransform,
  multiply,
  identity,
  changePart,
} from "./project";
import { history, commit, undo, redo } from "./history";
describe("project validation", () => {
  it("accepts and clones the demo", () => {
    const p = demoProject();
    expect(validateProject(p)).toEqual(p);
    expect(validateProject(p)).not.toBe(p);
  });
  it("rejects unsupported versions", () => {
    expect(() =>
      validateProject({ ...demoProject(), schemaVersion: 2 }),
    ).toThrow("version");
  });
  it("rejects event attributes masquerading as geometry", () => {
    const p = demoProject();
    p.parts[0].geometry.onclick = "alert(1)";
    expect(() => validateProject(p)).toThrow();
  });
  it("rejects external paint", () => {
    const p = demoProject();
    p.parts[0].fill = "url(https://example.com/x)";
    expect(() => validateProject(p)).toThrow();
  });
  it("rejects nonfinite coordinates and duplicate IDs", () => {
    const p = demoProject();
    p.parts[0].x = Infinity;
    expect(() => validateProject(p)).toThrow();
    p.parts[0].x = 0;
    p.parts[1].id = p.parts[0].id;
    expect(() => validateProject(p)).toThrow();
  });
  it("rejects arbitrary shadow values", () => {
    const p = demoProject();
    p.parts[0].shadow.blur = 1e9;
    expect(() => validateProject(p)).toThrow();
  });
  it("rejects unsupported geometry type", () => {
    const p = demoProject();
    expect(() =>
      validateProject({ ...p, parts: [{ ...p.parts[0], kind: "image" }] }),
    ).toThrow();
  });
});
describe("transforms and reversible edits", () => {
  it("keeps matrix multiplication order", () => {
    expect(parseTransform("translate(10,20) scale(2)")).toEqual([
      2, 0, 0, 2, 10, 20,
    ]);
    expect(multiply(identity, identity)).toEqual(identity);
  });
  it("handles rotation around a center", () => {
    const m = parseTransform("rotate(90 10 20)");
    expect(m[0]).toBeCloseTo(0);
    expect(m[1]).toBeCloseTo(1);
    expect(m[4]).toBeCloseTo(30);
    expect(m[5]).toBeCloseTo(10);
  });
  it("rejects invalid or partial transform strings", () => {
    expect(() => parseTransform("translate(2) bad")).toThrow();
    expect(() => parseTransform("url(foo)")).toThrow();
  });
  it("undoes and redoes edits without touching the source", () => {
    const p = demoProject();
    const next = changePart(p, p.parts[0].id, {
      x: 42,
      shadow: { ...p.parts[0].shadow, enabled: true },
    });
    const s = commit(history(p), next);
    expect(undo(s).present).toEqual(p);
    expect(redo(undo(s)).present).toEqual(next);
    expect(next.source).toEqual(p.source);
  });
  it("clears redo after a new edit", () => {
    const p = demoProject();
    let s = commit(history(p), changePart(p, p.parts[0].id, { x: 4 }));
    s = undo(s);
    s = commit(s, changePart(p, p.parts[0].id, { x: 8 }));
    expect(s.future).toHaveLength(0);
  });
  it("does not record no-op changes", () => {
    const s = history(demoProject());
    expect(commit(s, s.present)).toBe(s);
  });
});
