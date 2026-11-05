import type { RasterSource } from "../tracing/types";
import { validTraceOptions } from "../tracing/types";
import { inspectDataURL } from "../tracing/image-header";
import type { Adjustment } from "./transform";
export type Matrix = [number, number, number, number, number, number];
export type Kind =
  | "path"
  | "text"
  | "rect"
  | "circle"
  | "ellipse"
  | "polygon"
  | "polyline"
  | "line"
  | "image";
export interface Shadow {
  enabled: boolean;
  color: string;
  opacity: number;
  blur: number;
  dx: number;
  dy: number;
}
export interface SurfaceFinish {
  grain: number;
  depth: number;
  angle: number;
  color: string;
}
export function hasTextControls(value: string) {
  return [...value].some((ch) => {
    const n = ch.codePointAt(0)!;
    return (
      n < 32 ||
      (n >= 0x7f && n <= 0x9f) ||
      (n >= 0xd800 && n <= 0xdfff) ||
      n === 0xfffe ||
      n === 0xffff
    );
  });
}
export interface TextData {
  value: string;
  font:
    | "sans-serif"
    | "serif"
    | "monospace"
    | "Arial"
    | "Georgia"
    | "Times New Roman"
    | "Verdana"
    | "Courier New";
  size: number;
  bold: boolean;
  italic?: boolean;
  letterSpacing?: number;
}
export interface Part {
  textData?: TextData;
  finish?: SurfaceFinish;
  id: string;
  name: string;
  group: string;
  kind: Kind;
  geometry: Record<string, string>;
  matrix: Matrix;
  x: number;
  y: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  fillRule: "evenodd" | "nonzero";
  lineCap: "butt" | "round" | "square";
  lineJoin: "miter" | "round" | "bevel";
  shadow: Shadow;
  adjustment?: Adjustment;
  hidden?: boolean;
  locked?: boolean;
  groupId?: string;
  assetId?: string;
}
export type Asset =
  | {
      id: string;
      name: string;
      kind: "vector";
      viewBox: [number, number, number, number];
      parts: Part[];
    }
  | {
      id: string;
      name: string;
      kind: "image";
      dataURL: string;
      width: number;
      height: number;
    };
export interface Project {
  schemaVersion: 1;
  assets?: Asset[];
  name: string;
  source: { name: string; text: string; raster?: RasterSource };
  viewBox: [number, number, number, number];
  background: string | null;
  parts: Part[];
  groups?: { id: string; name: string }[];
}
export const identity: Matrix = [1, 0, 0, 1, 0, 0];
export const defaultShadow = (): Shadow => ({
  enabled: false,
  color: "#111111",
  opacity: 0.24,
  blur: 8,
  dx: 6,
  dy: 10,
});
export const geometryKeys: Record<Kind, string[]> = {
  image: ["x", "y", "width", "height"],
  path: ["d"],
  text: ["x", "y"],
  rect: ["x", "y", "width", "height", "rx", "ry"],
  circle: ["cx", "cy", "r"],
  ellipse: ["cx", "cy", "rx", "ry"],
  polygon: ["points"],
  polyline: ["points"],
  line: ["x1", "y1", "x2", "y2"],
};
export const finite = (n: unknown, min = -1e6, max = 1e6): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
export function isPaint(s: unknown): s is string {
  return (
    typeof s === "string" &&
    s.length < 100 &&
    !/^(currentcolor|inherit|unset|initial|revert)$/i.test(s) &&
    (/^#[0-9a-f]{3,8}$/i.test(s) ||
      /^[a-z]{1,25}$/i.test(s) ||
      /^(rgb|rgba|hsl|hsla)\([\d\s.,%+\-/]+\)$/i.test(s))
  );
}
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw Error("Invalid project data.");
  return v as Record<string, unknown>;
}
export function validateProject(value: unknown): Project {
  const p = object(value);
  if (p.schemaVersion !== 1) throw Error("Unsupported project version.");
  if (typeof p.name !== "string" || p.name.length > 120)
    throw Error("Invalid project name.");
  const source = object(p.source);
  if (
    typeof source.name !== "string" ||
    source.name.length > 200 ||
    typeof source.text !== "string" ||
    source.text.length > 2e6
  )
    throw Error("Invalid source.");
  if (source.raster !== undefined) {
    const r = object(source.raster);
    if (typeof r.dataURL !== "string" || !validTraceOptions(r.options))
      throw Error("Invalid original image.");
    const h = inspectDataURL(r.dataURL);
    if (
      r.width !== h.width ||
      r.height !== h.height ||
      !Number.isInteger(r.tracedWidth) ||
      !Number.isInteger(r.tracedHeight) ||
      !finite(r.tracedWidth, 1, 1024) ||
      !finite(r.tracedHeight, 1, 1024)
    )
      throw Error("Invalid traced image dimensions.");
  }
  if (
    !Array.isArray(p.viewBox) ||
    p.viewBox.length !== 4 ||
    !p.viewBox.every((x) => finite(x)) ||
    !finite(p.viewBox[2], 1, 100000) ||
    !finite(p.viewBox[3], 1, 100000)
  )
    throw Error("Invalid canvas size.");
  if (p.background !== null && !isPaint(p.background))
    throw Error("Invalid background.");
  if (!Array.isArray(p.parts) || p.parts.length > 300)
    throw Error("Use a logo with 0–300 parts.");
  const assets = new Map<string, Record<string, unknown>>();
  let templateCount = 0,
    templateChars = 0,
    rasterChars = 0,
    rasterPixels = 0;
  if (p.assets !== undefined) {
    if (!Array.isArray(p.assets) || p.assets.length > 24)
      throw Error("A library can contain at most 24 assets.");
    for (const raw of p.assets) {
      const a = object(raw);
      if (
        typeof a.id !== "string" ||
        !/^[a-zA-Z][a-zA-Z0-9_-]{0,70}$/.test(a.id) ||
        assets.has(a.id) ||
        typeof a.name !== "string" ||
        !a.name.trim() ||
        a.name.length > 120
      )
        throw Error("Invalid asset identity.");
      if (a.kind === "image") {
        if (typeof a.dataURL !== "string")
          throw Error("Invalid reference image.");
        const h = inspectDataURL(a.dataURL);
        if (a.width !== h.width || a.height !== h.height)
          throw Error("Invalid image asset dimensions.");
        rasterChars += a.dataURL.length;
        rasterPixels += h.width * h.height;
      } else if (a.kind === "vector") {
        if (
          !Array.isArray(a.parts) ||
          !a.parts.length ||
          a.parts.some(
            (p) =>
              object(p).kind === "image" ||
              object(p).groupId !== undefined ||
              object(p).assetId !== undefined,
          )
        )
          throw Error("Vector assets need standalone vector parts.");
        const v = validateProject({
          schemaVersion: 1,
          name: a.name,
          source: { name: a.name, text: "" },
          viewBox: a.viewBox,
          background: null,
          parts: a.parts,
        });
        templateCount += v.parts.length;
        for (const part of v.parts)
          for (const text of Object.values(part.geometry))
            templateChars += text.length;
      } else throw Error("Unsupported asset kind.");
      assets.set(a.id, a);
    }
    if (templateCount > 1000 || templateChars > 1e6)
      throw Error(
        "The asset library is too complex. Remove unused vector assets.",
      );
    if (rasterChars > 6e6 || rasterPixels > 32e6)
      throw Error(
        "This image library is too large. Use fewer or smaller reference images.",
      );
  }
  const groupIds = new Set<string>();
  if (p.groups !== undefined) {
    if (!Array.isArray(p.groups) || p.groups.length > 300)
      throw Error("Invalid groups.");
    for (const raw of p.groups) {
      const g = object(raw);
      if (
        typeof g.id !== "string" ||
        !/^[a-zA-Z][a-zA-Z0-9_-]{0,70}$/.test(g.id) ||
        groupIds.has(g.id) ||
        typeof g.name !== "string" ||
        !g.name.trim() ||
        g.name.length > 80
      )
        throw Error("Invalid group.");
      groupIds.add(g.id);
    }
  }
  const ids = new Set<string>();
  let chars = 0;
  for (const raw of p.parts) {
    const a = object(raw);
    if (
      typeof a.id !== "string" ||
      !/^[a-zA-Z][a-zA-Z0-9_-]{0,70}$/.test(a.id) ||
      ids.has(a.id)
    )
      throw Error("Invalid part ID.");
    ids.add(a.id);
    if (
      typeof a.name !== "string" ||
      a.name.length > 100 ||
      typeof a.group !== "string" ||
      a.group.length > 500 ||
      typeof a.kind !== "string" ||
      !Object.hasOwn(geometryKeys, a.kind)
    )
      throw Error("Invalid shape.");
    if (
      (a.hidden !== undefined && typeof a.hidden !== "boolean") ||
      (a.locked !== undefined && typeof a.locked !== "boolean") ||
      (a.groupId !== undefined &&
        (typeof a.groupId !== "string" || !groupIds.has(a.groupId)))
    )
      throw Error("Invalid part organization.");
    if (a.kind === "image") {
      if (
        typeof a.assetId !== "string" ||
        assets.get(a.assetId)?.kind !== "image"
      )
        throw Error("Image parts must reference a valid library image.");
    } else if (a.assetId !== undefined)
      throw Error("Only image parts can reference raster assets.");
    if (a.kind === "text") {
      const t = object(a.textData);
      if (
        Object.keys(t).some(
          (k) =>
            ![
              "value",
              "font",
              "size",
              "bold",
              "italic",
              "letterSpacing",
            ].includes(k),
        ) ||
        typeof t.value !== "string" ||
        !t.value.trim() ||
        t.value.length > 200 ||
        hasTextControls(t.value) ||
        ![
          "sans-serif",
          "serif",
          "monospace",
          "Arial",
          "Georgia",
          "Times New Roman",
          "Verdana",
          "Courier New",
        ].includes(String(t.font)) ||
        !finite(t.size, 6, 1000) ||
        typeof t.bold !== "boolean" ||
        (t.italic !== undefined && typeof t.italic !== "boolean") ||
        (t.letterSpacing !== undefined && !finite(t.letterSpacing, -200, 200))
      )
        throw Error("Invalid text settings.");
      chars += t.value.length;
    } else if (a.textData !== undefined)
      throw Error("Text settings require a text layer.");
    const g = object(a.geometry);
    const keys = geometryKeys[a.kind as Kind];
    for (const [k, v] of Object.entries(g)) {
      if (!keys.includes(k) || typeof v !== "string" || v.length > 200000)
        throw Error("Unsupported shape attribute.");
      chars += v.length;
      if (k === "d") {
        if (!/^[MmZzLlHhVvCcSsQqTtAaEe0-9.,+\-\s]*$/.test(v))
          throw Error("Invalid path.");
      } else if (k === "points") {
        const points = v
          .trim()
          .split(/[\s,]+/)
          .map(Number);
        if (
          !/^[\d.eE,+\-\s]+$/.test(v) ||
          points.length < 4 ||
          points.length % 2 ||
          !points.every((x) => finite(x))
        )
          throw Error("Invalid points.");
      } else if (!v.trim() || !finite(Number(v)))
        throw Error("Invalid coordinate.");
    }
    if (
      a.kind === "image" &&
      (!finite(Number(g.width), 1, 8000) || !finite(Number(g.height), 1, 8000))
    )
      throw Error("Invalid reference image size.");
    if (
      (a.kind === "path" && !g.d) ||
      (["polygon", "polyline"].includes(a.kind) && !g.points)
    )
      throw Error("Empty shape.");
    if (
      !Array.isArray(a.matrix) ||
      a.matrix.length !== 6 ||
      !a.matrix.every((x) => finite(x)) ||
      Math.abs(a.matrix[0] * a.matrix[3] - a.matrix[1] * a.matrix[2]) < 1e-12
    )
      throw Error("Invalid transform.");
    if (
      !finite(a.x) ||
      !finite(a.y) ||
      !isPaint(a.fill) ||
      !isPaint(a.stroke) ||
      !finite(a.strokeWidth, 0, 1000) ||
      !finite(a.opacity, 0, 1)
    )
      throw Error("Invalid appearance.");
    if (
      !["nonzero", "evenodd"].includes(String(a.fillRule)) ||
      !["butt", "round", "square"].includes(String(a.lineCap)) ||
      !["miter", "round", "bevel"].includes(String(a.lineJoin))
    )
      throw Error("Invalid outline.");
    if (a.adjustment !== undefined) {
      const t = object(a.adjustment);
      if (
        !finite(t.scaleX, 0.01, 100) ||
        !finite(t.scaleY, 0.01, 100) ||
        !finite(t.rotation, -180, 180) ||
        !finite(t.cx) ||
        !finite(t.cy)
      )
        throw Error("Invalid size or rotation.");
    }
    if (a.finish !== undefined) {
      const f = object(a.finish);
      if (
        Object.keys(f).some(
          (k) => !["grain", "depth", "angle", "color"].includes(k),
        ) ||
        !finite(f.grain, 0, 0.45) ||
        !finite(f.depth, 0, 24) ||
        !finite(f.angle, -180, 180) ||
        typeof f.color !== "string" ||
        !/^#[0-9a-f]{6}$/i.test(f.color)
      )
        throw Error("Invalid surface finish.");
    }
    const s = object(a.shadow);
    if (
      typeof s.enabled !== "boolean" ||
      !isPaint(s.color) ||
      !finite(s.opacity, 0, 1) ||
      !finite(s.blur, 0, 100) ||
      !finite(s.dx, -500, 500) ||
      !finite(s.dy, -500, 500)
    )
      throw Error("Invalid shadow.");
  }
  if (chars > 1e6) throw Error("This logo is too complex.");
  if (
    p.assets !== undefined &&
    new TextEncoder().encode(JSON.stringify(value, null, 2)).byteLength > 8e6
  )
    throw Error(
      "This project exceeds the 8 MB backup limit. Remove unused assets or use smaller images.",
    );
  return structuredClone(value) as Project;
}
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
export function parseTransform(text: string): Matrix {
  let out: Matrix = [...identity],
    at = 0;
  const regex = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  for (const m of text.matchAll(regex)) {
    if (text.slice(at, m.index).replace(/[\s,]/g, ""))
      throw Error("Unsupported transform.");
    if (!/^[\d.eE+\-\s,]*$/.test(m[2])) throw Error("Invalid transform.");
    const n = m[2]
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    if (!n.every((x) => finite(x))) throw Error("Transform too large.");
    let t: Matrix;
    if (m[1] === "matrix" && n.length === 6) t = n as Matrix;
    else if (m[1] === "translate" && (n.length === 1 || n.length === 2))
      t = [1, 0, 0, 1, n[0], n[1] ?? 0];
    else if (m[1] === "scale" && (n.length === 1 || n.length === 2))
      t = [n[0], 0, 0, n[1] ?? n[0], 0, 0];
    else if (m[1] === "rotate" && (n.length === 1 || n.length === 3)) {
      const r = (n[0] * Math.PI) / 180;
      t = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
      if (n.length === 3)
        t = multiply(multiply([1, 0, 0, 1, n[1], n[2]], t), [
          1,
          0,
          0,
          1,
          -n[1],
          -n[2],
        ]);
    } else if ((m[1] === "skewX" || m[1] === "skewY") && n.length === 1) {
      const r = Math.tan((n[0] * Math.PI) / 180);
      t = m[1] === "skewX" ? [1, 0, r, 1, 0, 0] : [1, r, 0, 1, 0, 0];
    } else throw Error("Unsupported transform.");
    out = multiply(out, t);
    at = m.index! + m[0].length;
  }
  if (text.slice(at).trim()) throw Error("Invalid transform.");
  return out;
}
export function changePart(
  p: Project,
  id: string,
  edit: Partial<Part>,
): Project {
  return {
    ...p,
    parts: p.parts.map((a) => (a.id === id ? { ...a, ...edit } : a)),
  };
}
