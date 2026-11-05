import { editable, expandedIds, selectedParts } from "./organization";
import { validateProject, type Project } from "./project";
import type { Bounds } from "./transform";
export type LayoutAction =
  | "left"
  | "center-x"
  | "right"
  | "top"
  | "center-y"
  | "bottom"
  | "distribute-x"
  | "distribute-y";
export type LayoutTarget = "selection" | "canvas";
export function layoutUnitCount(project: Project, ids: string[]) {
  return new Set(
    selectedParts(project, expandedIds(project, ids)).map((p) =>
      p.groupId ? `g:${p.groupId}` : `p:${p.id}`,
    ),
  ).size;
}
function union(boxes: Bounds[]): Bounds {
  const x = Math.min(...boxes.map((b) => b.x)),
    y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  };
}
/** Layout operates on geometric bounds; groups remain rigid translation units. */
export function arrange(
  project: Project,
  ids: string[],
  bounds: ReadonlyMap<string, Bounds>,
  action: LayoutAction,
  target: LayoutTarget,
): Project {
  if (ids.some((id) => !project.parts.some((p) => p.id === id)))
    throw Error("The selection has changed. Select the parts again.");
  const parts = selectedParts(project, expandedIds(project, ids));
  if (!editable(parts))
    throw Error("Show and unlock every selected part before arranging it.");
  const units = new Map<string, { ids: string[]; boxes: Bounds[] }>();
  for (const p of parts) {
    const b = bounds.get(p.id);
    if (
      !b ||
      ![b.x, b.y, b.width, b.height].every(Number.isFinite) ||
      b.width < 0 ||
      b.height < 0
    )
      throw Error("Could not measure every selected part.");
    const key = p.groupId ? `g:${p.groupId}` : `p:${p.id}`,
      unit = units.get(key) ?? { ids: [], boxes: [] };
    unit.ids.push(p.id);
    unit.boxes.push(b);
    units.set(key, unit);
  }
  const entries = [...units.values()].map((u) => ({
    ids: u.ids,
    box: union(u.boxes),
  }));
  const [x, y, width, height] = project.viewBox;
  const frame =
    target === "canvas" || entries.length === 1
      ? { x, y, width, height }
      : union(entries.map((u) => u.box));
  const horizontal = ["left", "center-x", "right", "distribute-x"].includes(
      action,
    ),
    axis = horizontal ? "x" : "y",
    size = horizontal ? "width" : "height";
  const deltas = new Map<string, { x: number; y: number }>();
  function assign(unit: (typeof entries)[number], position: number) {
    for (const id of unit.ids)
      deltas.set(id, {
        x: horizontal ? position - unit.box.x : 0,
        y: horizontal ? 0 : position - unit.box.y,
      });
  }
  if (action.startsWith("distribute")) {
    if (entries.length < 3)
      throw Error(
        "Select at least three independent shapes or groups to distribute.",
      );
    entries.sort((a, b) => a.box[axis] - b.box[axis]);
    const start = target === "canvas" ? frame[axis] : entries[0].box[axis];
    const last = entries[entries.length - 1].box;
    const end =
      target === "canvas" ? frame[axis] + frame[size] : last[axis] + last[size];
    const gap =
      (end - start - entries.reduce((sum, u) => sum + u.box[size], 0)) /
      (entries.length - 1);
    let position = start;
    for (const unit of entries) {
      assign(unit, position);
      position += unit.box[size] + gap;
    }
  } else {
    for (const unit of entries) {
      const offset =
        action === "right" || action === "bottom"
          ? frame[size] - unit.box[size]
          : action.startsWith("center")
            ? (frame[size] - unit.box[size]) / 2
            : 0;
      assign(unit, frame[axis] + offset);
    }
  }
  return validateProject({
    ...project,
    parts: project.parts.map((p) => {
      const d = deltas.get(p.id);
      return d ? { ...p, x: p.x + d.x, y: p.y + d.y } : p;
    }),
  });
}
