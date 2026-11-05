import { describe, expect, it } from "vitest";
import { demoProject } from "../demo/logo";
import { validateProject } from "./project";
import {
  expandedIds,
  organize,
  pickIds,
  moveParts,
  clampMovement,
} from "./organization";
const ids = ["petal-1", "petal-2"];
describe("reversible part organization", () => {
  it("groups without changing layer order, geometry or source", () => {
    const p = demoProject(),
      r = organize(p, ids, "group");
    expect(r.project.groups).toHaveLength(1);
    expect(r.project.parts.map((x) => x.id)).toEqual(p.parts.map((x) => x.id));
    expect(r.project.parts[0].geometry).toEqual(p.parts[0].geometry);
    expect(r.project.source).toEqual(p.source);
    expect(p.groups).toBeUndefined();
  });
  it("expands a grouped member and toggles the full group", () => {
    const p = organize(demoProject(), ids, "group").project;
    expect(expandedIds(p, ["petal-1"])).toEqual(ids);
    expect(pickIds(p, [], "petal-1")).toEqual(ids);
    expect(pickIds(p, ids, "petal-2", true)).toEqual([]);
  });
  it("ungroups without changing shapes", () => {
    const p = organize(demoProject(), ids, "group").project,
      r = organize(p, ["petal-1"], "ungroup").project;
    expect(r.groups).toEqual([]);
    expect(r.parts[0].groupId).toBeUndefined();
    expect(r.parts[0].geometry).toEqual(p.parts[0].geometry);
  });
  it("moves a group by a shared displacement, not independently clamped offsets", () => {
    const p = organize(demoProject(), ids, "group").project;
    p.parts[0].x = 999999;
    const r = moveParts(p, ["petal-2"], 100, 20);
    expect(r.parts[0].x).toBe(1000000);
    expect(r.parts[1].x).toBe(1);
    expect(r.parts[1].y).toBe(20);
  });
  it("duplicates a group with distinct part and group identities", () => {
    const p = organize(demoProject(), ids, "group").project,
      r = organize(p, ["petal-1"], "duplicate");
    expect(r.project.parts).toHaveLength(8);
    expect(new Set(r.project.parts.map((x) => x.id)).size).toBe(8);
    const copies = r.project.parts.slice(-2);
    expect(copies[0].groupId).toBe(copies[1].groupId);
    expect(copies[0].groupId).not.toBe(p.parts[0].groupId);
    expect(copies[0].matrix).toEqual(p.parts[0].matrix);
    expect(r.project.groups).toHaveLength(2);
  });
  it("can delete all parts and preserve an empty editable document", () => {
    const p = demoProject(),
      r = organize(
        p,
        p.parts.map((x) => x.id),
        "delete",
      );
    expect(r.project.parts).toEqual([]);
    expect(r.ids).toEqual([]);
    expect(validateProject(r.project).source).toEqual(p.source);
  });
  it("cleans group metadata after deletion", () => {
    const p = organize(demoProject(), ids, "group").project,
      r = organize(p, ["petal-1"], "delete");
    expect(r.project.parts).toHaveLength(4);
    expect(r.project.groups).toEqual([]);
  });
  it("locks block edits and permit unlock/visibility recovery", () => {
    const p = organize(demoProject(), ids, "lock").project;
    for (const a of ["delete", "duplicate", "group", "front"] as const)
      expect(() => organize(p, ids, a)).toThrow(/unlock/);
    expect(() => moveParts(p, ids, 1, 2)).toThrow();
    const hidden = organize(p, ids, "hide").project;
    expect(hidden.parts[0].hidden).toBe(true);
    expect(organize(hidden, ids, "unlock").project.parts[0].locked).toBe(false);
  });
  it("hidden members block grouped movement", () => {
    const p = organize(demoProject(), ids, "group").project;
    p.parts[1].hidden = true;
    expect(() => moveParts(p, ["petal-1"], 1, 1)).toThrow(/Show/);
  });
  it("reorders selected parts stably to front/back and by one step", () => {
    const p = demoProject();
    const r = organize(p, ids, "front").project;
    expect(r.parts.slice(-2).map((x) => x.id)).toEqual(ids);
    expect(organize(r, ids, "back").project.parts.map((x) => x.id)).toEqual(
      p.parts.map((x) => x.id),
    );
    const f = organize(p, ids, "forward").project;
    expect(f.parts.slice(0, 3).map((x) => x.id)).toEqual(["petal-3", ...ids]);
    expect(organize(f, ids, "backward").project.parts.map((x) => x.id)).toEqual(
      p.parts.map((x) => x.id),
    );
  });
  it("rejects malformed group and visibility metadata", () => {
    const p = demoProject();
    expect(() =>
      validateProject({ ...p, parts: [{ ...p.parts[0], groupId: "missing" }] }),
    ).toThrow(/organization/);
    expect(() =>
      validateProject({ ...p, parts: [{ ...p.parts[0], hidden: "yes" }] }),
    ).toThrow();
    expect(() =>
      validateProject({
        ...p,
        groups: [
          { id: "g", name: "A" },
          { id: "g", name: "B" },
        ],
      }),
    ).toThrow(/group/);
  });
  it("enforces part count and existing geometry complexity caps when duplicating", () => {
    const p = demoProject();
    p.parts = Array.from({ length: 300 }, (_, i) => ({
      ...p.parts[0],
      id: "p-" + i,
    }));
    expect(() => organize(p, ["p-0"], "duplicate")).toThrow(/300/);
  });
  it("rejects empty selections, nonfinite movement and grouping one part", () => {
    const p = demoProject();
    expect(() => organize(p, [], "delete")).toThrow(/Select/);
    expect(() => organize(p, ["petal-1"], "group")).toThrow(/two/);
    expect(() => clampMovement(p.parts, NaN, 2)).toThrow();
  });
});
