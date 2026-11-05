import { validateProject, type Part, type Project } from "./project";
export type OrganizationAction =
  | "group"
  | "ungroup"
  | "duplicate"
  | "delete"
  | "hide"
  | "show"
  | "lock"
  | "unlock"
  | "forward"
  | "backward"
  | "front"
  | "back";
export function expandedIds(project: Project, ids: string[]): string[] {
  const chosen = new Set(ids),
    groups = new Set(
      project.parts
        .filter((p) => chosen.has(p.id) && p.groupId)
        .map((p) => p.groupId),
    );
  return project.parts
    .filter((p) => chosen.has(p.id) || (p.groupId && groups.has(p.groupId)))
    .map((p) => p.id);
}
export function pickIds(
  project: Project,
  current: string[],
  id: string | null,
  additive = false,
): string[] {
  if (!id) return [];
  const next = expandedIds(project, [id]);
  if (!additive) return next;
  const selected = new Set(current),
    remove = next.every((x) => selected.has(x));
  for (const x of next) {
    if (remove) selected.delete(x);
    else selected.add(x);
  }
  return project.parts.filter((p) => selected.has(p.id)).map((p) => p.id);
}
export function selectedParts(project: Project, ids: string[]): Part[] {
  const set = new Set(ids);
  return project.parts.filter((p) => set.has(p.id));
}
export function editable(parts: Part[]): boolean {
  return parts.length > 0 && parts.every((p) => !p.locked && !p.hidden);
}
export function identifier(prefix: string, existing: Set<string>): string {
  let n = 1;
  while (existing.has(prefix + "-" + n)) n++;
  const id = prefix + "-" + n;
  existing.add(id);
  return id;
}
function tidy(project: Project): Project {
  const counts = new Map<string, number>();
  for (const p of project.parts)
    if (p.groupId) counts.set(p.groupId, (counts.get(p.groupId) ?? 0) + 1);
  const groups = (project.groups ?? []).filter(
      (g) => (counts.get(g.id) ?? 0) > 1,
    ),
    valid = new Set(groups.map((g) => g.id));
  return {
    ...project,
    groups,
    parts: project.parts.map((p) =>
      p.groupId && !valid.has(p.groupId) ? { ...p, groupId: undefined } : p,
    ),
  };
}
export function clampMovement(parts: Part[], dx: number, dy: number) {
  if (!parts.length) throw Error("Select one or more parts first.");
  if (!Number.isFinite(dx) || !Number.isFinite(dy))
    throw Error("Enter a valid movement.");
  return {
    dx: Math.max(
      -1e6 - Math.min(...parts.map((p) => p.x)),
      Math.min(1e6 - Math.max(...parts.map((p) => p.x)), dx),
    ),
    dy: Math.max(
      -1e6 - Math.min(...parts.map((p) => p.y)),
      Math.min(1e6 - Math.max(...parts.map((p) => p.y)), dy),
    ),
  };
}
export function moveParts(
  project: Project,
  ids: string[],
  dx: number,
  dy: number,
): Project {
  const parts = selectedParts(project, expandedIds(project, ids));
  if (!editable(parts))
    throw Error("Show and unlock every selected part before moving it.");
  const delta = clampMovement(parts, dx, dy),
    set = new Set(parts.map((p) => p.id));
  return validateProject({
    ...project,
    parts: project.parts.map((p) =>
      set.has(p.id) ? { ...p, x: p.x + delta.dx, y: p.y + delta.dy } : p,
    ),
  });
}
export function organize(
  project: Project,
  requested: string[],
  action: OrganizationAction,
): { project: Project; ids: string[] } {
  const ids = expandedIds(project, requested),
    parts = selectedParts(project, ids),
    set = new Set(ids);
  if (!parts.length) throw Error("Select one or more parts first.");
  const flags = ["hide", "show", "lock", "unlock"].includes(action);
  if (!flags && !editable(parts))
    throw Error("Show and unlock the selected parts before editing them.");
  let next: Project = {
      ...project,
      parts: [...project.parts],
      groups: [...(project.groups ?? [])],
    },
    selection = ids;
  if (flags) {
    const key = action === "hide" || action === "show" ? "hidden" : "locked",
      value = action === "hide" || action === "lock";
    next.parts = next.parts.map((p) =>
      set.has(p.id) ? { ...p, [key]: value } : p,
    );
  } else if (action === "group") {
    if (parts.length < 2) throw Error("Select at least two parts to group.");
    const groupIds = new Set(next.groups!.map((g) => g.id));
    const id = identifier("group", groupIds);
    let n = 1;
    const names = new Set(next.groups!.map((g) => g.name));
    while (names.has("Group " + n)) n++;
    next.groups!.push({ id, name: "Group " + n });
    next.parts = next.parts.map((p) =>
      set.has(p.id) ? { ...p, groupId: id } : p,
    );
  } else if (action === "ungroup") {
    next.parts = next.parts.map((p) =>
      set.has(p.id) ? { ...p, groupId: undefined } : p,
    );
  } else if (action === "delete") {
    next.parts = next.parts.filter((p) => !set.has(p.id));
    selection = [];
  } else if (action === "duplicate") {
    if (next.parts.length + parts.length > 300)
      throw Error("A project can contain at most 300 parts.");
    const partIds = new Set(next.parts.map((p) => p.id)),
      groupIds = new Set(next.groups!.map((g) => g.id)),
      remap = new Map<string, string>();
    for (const group of next.groups!) {
      if (parts.some((p) => p.groupId === group.id)) {
        const id = identifier("group", groupIds);
        remap.set(group.id, id);
      }
    }
    const groupsToAdd = next
      .groups!.filter((g) => remap.has(g.id))
      .map((g) => ({
        id: remap.get(g.id)!,
        name: (g.name + " copy").slice(0, 80),
      }));
    next.groups!.push(...groupsToAdd);
    const offset = Math.max(
        2,
        Math.min(20, Math.min(project.viewBox[2], project.viewBox[3]) * 0.025),
      ),
      delta = clampMovement(parts, offset, offset);
    const copies = parts.map((p) => ({
      ...structuredClone(p),
      id: identifier("copy", partIds),
      name: (p.name + " copy").slice(0, 100),
      x: p.x + delta.dx,
      y: p.y + delta.dy,
      groupId: p.groupId ? remap.get(p.groupId) : undefined,
    }));
    next.parts.push(...copies);
    selection = copies.map((p) => p.id);
  } else if (action === "front" || action === "back") {
    const remaining = next.parts.filter((p) => !set.has(p.id));
    next.parts =
      action === "front" ? [...remaining, ...parts] : [...parts, ...remaining];
  } else if (action === "forward") {
    for (let i = next.parts.length - 2; i >= 0; i--)
      if (set.has(next.parts[i].id) && !set.has(next.parts[i + 1].id))
        [next.parts[i], next.parts[i + 1]] = [next.parts[i + 1], next.parts[i]];
  } else if (action === "backward") {
    for (let i = 1; i < next.parts.length; i++)
      if (set.has(next.parts[i].id) && !set.has(next.parts[i - 1].id))
        [next.parts[i], next.parts[i - 1]] = [next.parts[i - 1], next.parts[i]];
  }
  next = tidy(next);
  return { project: validateProject(next), ids: selection };
}
