import { describe, it, expect } from "vitest";
import { demoProject } from "../demo/logo";
import { validateProject, type Asset, type Project } from "./project";
import { appendAssets, placeAsset, removeAsset, vectorAsset } from "./assets";
import { organize } from "./organization";
const dataURL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const image = (): Asset => ({
  id: "draft",
  name: "Reference.png",
  kind: "image",
  dataURL,
  width: 1,
  height: 1,
});
const base = () => demoProject();
describe("reusable asset library", () => {
  it("appends several assets without replacing the scene", () => {
    const p = base(),
      r = appendAssets(p, [image(), vectorAsset(p)]);
    expect(r.ids).toEqual(["asset-1", "asset-2"]);
    expect(r.project.parts).toEqual(p.parts);
    expect(r.project.viewBox).toEqual(p.viewBox);
    expect(r.project.source).toEqual(p.source);
    expect(p.assets).toBeUndefined();
  });
  it("reuses a raster source across independent placed copies", () => {
    const p = appendAssets(base(), [image()]).project;
    const a = placeAsset(p, "asset-1"),
      b = placeAsset(a.project, "asset-1", { x: 160, y: 200 });
    expect(b.project.parts).toHaveLength(p.parts.length + 2);
    expect(a.ids[0]).not.toBe(b.ids[0]);
    expect(b.project.assets).toHaveLength(1);
    const part = b.project.parts.at(-1)!;
    expect(part.assetId).toBe("asset-1");
    expect(part.geometry).not.toHaveProperty("href");
    expect(part.kind).toBe("image");
    expect(part.matrix[4]).toBeCloseTo(72);
    expect(part.matrix[5]).toBeCloseTo(112);
  });
  it("places vector logos as independent grouped shapes with source geometry unchanged", () => {
    const p = base(),
      r = appendAssets(p, [vectorAsset(p)]),
      a = placeAsset(r.project, r.ids[0]);
    expect(a.project.parts).toHaveLength(p.parts.length * 2);
    expect(a.ids).toHaveLength(p.parts.length);
    expect(a.project.groups).toHaveLength(1);
    expect(new Set(a.project.parts.map((p) => p.id)).size).toBe(
      a.project.parts.length,
    );
    expect(a.project.parts.slice(-6).map((p) => p.geometry)).toEqual(
      p.parts.map((p) => p.geometry),
    );
    expect(a.project.viewBox).toEqual(p.viewBox);
    expect(a.project.source).toEqual(p.source);
  });
  it("bakes source adjustments safely and clears template protection on placement", () => {
    const p = base();
    p.parts[0].x = 12;
    p.parts[0].adjustment = {
      scaleX: 1.2,
      scaleY: 0.7,
      rotation: 30,
      cx: 200,
      cy: 220,
    };
    p.parts[0].hidden = true;
    p.parts[0].locked = true;
    const r = appendAssets(base(), [vectorAsset(p)]),
      a = placeAsset(r.project, r.ids[0]);
    const placed = a.project.parts.find((p) => p.id === a.ids[0])!;
    expect(placed.adjustment).toBeUndefined();
    expect(placed.hidden).toBe(false);
    expect(placed.locked).toBe(false);
    expect(placed.geometry).toEqual(p.parts[0].geometry);
    expect(placed.matrix.every(Number.isFinite)).toBe(true);
  });
  it("blocks deleting an in-use image but allows removal after canvas copies are deleted", () => {
    let p = appendAssets(base(), [image()]).project;
    const r = placeAsset(p, "asset-1");
    p = r.project;
    expect(() => removeAsset(p, "asset-1")).toThrow(/canvas copies/);
    p = organize(p, r.ids, "delete").project;
    expect(removeAsset(p, "asset-1").assets).toEqual([]);
  });
  it("removing a vector template leaves its placed shapes intact", () => {
    let p = appendAssets(base(), [vectorAsset(base())]).project;
    p = placeAsset(p, "asset-1").project;
    const n = removeAsset(p, "asset-1");
    expect(n.parts).toEqual(p.parts);
    expect(n.assets).toEqual([]);
  });
  it("duplicate, hide and lock remain compatible with image parts", () => {
    let p = appendAssets(base(), [image()]).project;
    const a = placeAsset(p, "asset-1");
    p = organize(a.project, a.ids, "duplicate").project;
    expect(p.parts.at(-1)!.assetId).toBe("asset-1");
    expect(p.assets).toHaveLength(1);
    expect(validateProject(p)).toEqual(p);
  });
  it("rejects unknown raster references and executable/external image URLs", () => {
    const r = appendAssets(base(), [image()]),
      p = placeAsset(r.project, r.ids[0]).project;
    p.parts.at(-1)!.assetId = "missing";
    expect(() => validateProject(p)).toThrow(/valid library image/);
    for (const url of [
      "https://example.com/a.png",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "javascript:alert(1)",
    ])
      expect(() =>
        appendAssets(base(), [{ ...image(), dataURL: url } as Asset]),
      ).toThrow();
  });
  it("rejects nested asset templates and dangling groups", () => {
    const r = appendAssets(base(), [image()]),
      p = placeAsset(r.project, r.ids[0]).project;
    expect(() => vectorAsset(p)).toThrow(/cannot contain/);
    const v = vectorAsset(base());
    if (v.kind !== "vector") throw Error();
    v.parts[0].groupId = "missing";
    expect(() => appendAssets(base(), [v])).toThrow(/standalone/);
  });
  it("checks image dimensions and validates library count", () => {
    const im = image();
    expect(() =>
      appendAssets(base(), [{ ...im, width: 200 } as Asset]),
    ).toThrow(/dimensions/);
    expect(() =>
      appendAssets(base(), Array.from({ length: 25 }, image)),
    ).toThrow(/24/);
    expect(() => appendAssets(base(), [])).toThrow(/at least/);
  });
  it("refuses unavailable assets or unsafe drop coordinates without mutating the input", () => {
    const p = appendAssets(base(), [image()]).project;
    for (const x of [NaN, Infinity, 1000001])
      expect(() => placeAsset(p, "asset-1", { x, y: 0 })).toThrow();
    expect(() => placeAsset(p, "missing")).toThrow(/no longer/);
    expect(p.parts).toHaveLength(6);
  });
  it("enforces the existing scene part cap on placement", () => {
    const p = appendAssets(base(), [image()]).project;
    const many: Project = {
      ...p,
      parts: Array.from({ length: 300 }, (_, i) => ({
        ...p.parts[0],
        id: "part-" + i,
      })),
    };
    expect(() => placeAsset(many, "asset-1")).toThrow(/300/);
    expect(many.parts).toHaveLength(300);
  });
});
