import {
  editable,
  expandedIds,
  identifier,
  selectedParts,
} from "../model/organization";
import {
  identity,
  validateProject,
  type Part,
  type Project,
} from "../model/project";
import type { GeometryResult } from "./types";
export function geometryParts(
  project: Project,
  ids: string[],
  boolean = false,
): Part[] {
  if (ids.some((id) => !project.parts.some((p) => p.id === id)))
    throw Error("The selected geometry has changed.");
  const parts = selectedParts(project, expandedIds(project, ids));
  if (!editable(parts))
    throw Error("Show and unlock all selected paths first.");
  if (parts.length > (boolean ? 16 : 1) || parts.length < (boolean ? 2 : 1))
    throw Error(
      boolean
        ? "Select 2–16 closed vector shapes."
        : "Select one ungrouped vector shape to edit nodes.",
    );
  if (parts.some((p) => p.kind === "text"))
    throw Error("Text cannot be used with path tools yet.");
  if (parts.some((p) => p.kind === "image"))
    throw Error("Trace reference images before editing path geometry.");
  if (
    boolean &&
    parts.some(
      (p) => p.fill === "none" || (p.stroke !== "none" && p.strokeWidth > 0),
    )
  )
    throw Error(
      "Boolean operations use filled shapes without visible outlines. Keep an original copy before removing outlines.",
    );
  if (
    parts.reduce((sum, p) => sum + JSON.stringify(p.geometry).length, 0) > 80000
  )
    throw Error(
      "The selected geometry is too complex for an interactive operation.",
    );
  return structuredClone(parts);
}
export function replacePaths(
  project: Project,
  ids: string[],
  result: GeometryResult,
  name: string,
): { project: Project; ids: string[] } {
  const parts = selectedParts(project, ids),
    base = parts[0];
  if (!base || !result.pathData || result.pathData.length > 200000)
    throw Error("Invalid geometry result.");
  const id =
    ids.length === 1
      ? base.id
      : identifier("combined", new Set(project.parts.map((p) => p.id)));
  const next: Part = {
    ...base,
    id,
    name,
    kind: "path",
    geometry: { d: result.pathData },
    matrix: result.space === "local" ? base.matrix : [...identity],
    x: result.space === "local" ? base.x : 0,
    y: result.space === "local" ? base.y : 0,
    adjustment: result.space === "local" ? base.adjustment : undefined,
    groupId: undefined,
    assetId: undefined,
    fillRule: ids.length > 1 ? "nonzero" : base.fillRule,
  };
  const chosen = new Set(ids);
  const remaining = project.parts.flatMap((p) =>
    p.id === base.id ? [next] : chosen.has(p.id) ? [] : [p],
  );
  const counts = new Map<string, number>();
  for (const p of remaining)
    if (p.groupId) counts.set(p.groupId, (counts.get(p.groupId) ?? 0) + 1);
  const groups = (project.groups ?? []).filter(
      (g) => (counts.get(g.id) ?? 0) > 1,
    ),
    valid = new Set(groups.map((g) => g.id));
  return {
    project: validateProject({
      ...project,
      groups,
      parts: remaining.map((p) =>
        p.groupId && !valid.has(p.groupId) ? { ...p, groupId: undefined } : p,
      ),
    }),
    ids: [id],
  };
}

/** Replace an eligible line or filled shape with two independently editable pieces. */
export function cutParts(
  project: Project,
  id: string,
  paths: [string, string],
  mode: "line" | "shape" = "line",
) {
  const p = project.parts.find((x) => x.id === id);
  if (
    !p ||
    p.hidden ||
    p.locked ||
    p.groupId ||
    p.kind === "image" ||
    p.kind === "text" ||
    (mode === "line"
      ? p.fill !== "none" || p.stroke === "none" || p.strokeWidth <= 0
      : p.fill === "none") ||
    p.shadow.enabled ||
    (p.finish && (p.finish.grain > 0 || p.finish.depth > 0))
  )
    throw Error(
      mode === "shape"
        ? "Choose one visible, unlocked, ungrouped filled shape without effects."
        : "Choose one visible, unlocked, ungrouped open line without fill or effects.",
    );
  if (
    !paths.every(
      (d) => typeof d === "string" && d.length > 0 && d.length <= 200000,
    )
  )
    throw Error("Invalid cut result.");
  const newId = identifier("cut", new Set(project.parts.map((a) => a.id)));
  const first: Part = {
    ...p,
    kind: "path",
    geometry: { d: paths[0] },
    name: (p.name + " 1").slice(0, 100),
  };
  const second: Part = {
    ...p,
    id: newId,
    kind: "path",
    geometry: { d: paths[1] },
    name: (p.name + " 2").slice(0, 100),
  };
  return {
    project: validateProject({
      ...project,
      parts: project.parts.flatMap((a) =>
        a.id === id ? [first, second] : [a],
      ),
    }),
    ids: [first.id, second.id],
  };
}
