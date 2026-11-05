import {
  defaultShadow,
  finite,
  identity,
  isPaint,
  validateProject,
  type Part,
  type Project,
} from "../model/project";
import {
  editable,
  expandedIds,
  identifier,
  moveParts,
  organize,
  selectedParts,
  type OrganizationAction,
} from "../model/organization";
export type ShapeKind = "rectangle" | "ellipse" | "triangle" | "star" | "line";
export interface CreateShape {
  type: "create";
  shape: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
}
export type DocumentCommand =
  | CreateShape
  | {
      type: "set";
      ids: string[];
      changes: Partial<
        Pick<Part, "name" | "fill" | "stroke" | "strokeWidth" | "opacity">
      >;
    }
  | { type: "move"; ids: string[]; dx: number; dy: number }
  | { type: "organize"; ids: string[]; action: OrganizationAction }
  | { type: "renameDocument"; name: string }
  | { type: "frame"; x: number; y: number; width: number; height: number };
export interface CommandRequest {
  version: 1;
  expectedRevision: number;
  commands: DocumentCommand[];
}
function object(v: unknown): Record<string, unknown> {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.getPrototypeOf(v) !== Object.prototype
  )
    throw Error("Expected a plain command object.");
  return v as Record<string, unknown>;
}
function keys(o: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(o).some((k) => !allowed.includes(k)))
    throw Error("Unknown command field.");
}
function ids(v: unknown): string[] {
  if (
    !Array.isArray(v) ||
    !v.length ||
    v.length > 300 ||
    !v.every((x) => typeof x === "string" && /^[A-Za-z][\w-]{0,79}$/.test(x)) ||
    new Set(v).size !== v.length
  )
    throw Error("Invalid command selection.");
  return v;
}
function selection(project: Project, value: unknown) {
  const chosen = ids(value);
  if (chosen.some((id) => !project.parts.some((p) => p.id === id)))
    throw Error("A command references a missing part.");
  return expandedIds(project, chosen);
}
export function shapePart(project: Project, input: CreateShape): Part {
  if (
    !["rectangle", "ellipse", "triangle", "star", "line"].includes(
      input.shape,
    ) ||
    ![input.x, input.y].every((n) => finite(n)) ||
    ![input.width, input.height].every((n) => finite(n, 1, 100000))
  )
    throw Error("Invalid shape size or position.");
  const w = input.width,
    h = input.height;
  let kind: Part["kind"] = "rect",
    geometry: Record<string, string> = {
      x: "0",
      y: "0",
      width: String(w),
      height: String(h),
      rx: "0",
    };
  if (input.shape === "ellipse") {
    kind = "ellipse";
    geometry = {
      cx: String(w / 2),
      cy: String(h / 2),
      rx: String(w / 2),
      ry: String(h / 2),
    };
  }
  if (input.shape === "triangle") {
    kind = "polygon";
    geometry = { points: `${w / 2},0 ${w},${h} 0,${h}` };
  }
  if (input.shape === "star") {
    kind = "polygon";
    geometry = {
      points: Array.from({ length: 10 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 5,
          r = i % 2 ? 0.42 : 1;
        return `${w / 2 + ((Math.cos(a) * w) / 2) * r},${h / 2 + ((Math.sin(a) * h) / 2) * r}`;
      }).join(" "),
    };
  }
  if (input.shape === "line") {
    kind = "line";
    geometry = { x1: "0", y1: "0", x2: String(w), y2: String(h) };
  }
  const fill = input.fill ?? (kind === "line" ? "none" : "#eeeeee"),
    stroke = input.stroke ?? (kind === "line" ? "#eeeeee" : "none");
  if (!isPaint(fill) || !isPaint(stroke)) throw Error("Invalid shape paint.");
  return {
    id: identifier("shape", new Set(project.parts.map((p) => p.id))),
    name: input.shape[0].toUpperCase() + input.shape.slice(1),
    group: "Created shape",
    kind,
    geometry,
    matrix: [...identity],
    x: input.x,
    y: input.y,
    fill,
    stroke,
    strokeWidth: kind === "line" ? 2 : 0,
    opacity: 1,
    fillRule: "nonzero",
    lineCap: "round",
    lineJoin: "round",
    shadow: defaultShadow(),
  };
}
/** Strict, atomic and transport-independent. No DOM, network, scripts or arbitrary property merge. */
export function applyCommandRequest(
  input: Project,
  raw: unknown,
  revision: number,
): { project: Project; ids: string[]; revision: number } {
  const request = object(raw);
  keys(request, ["version", "expectedRevision", "commands"]);
  if (
    request.version !== 1 ||
    !Number.isSafeInteger(request.expectedRevision) ||
    request.expectedRevision !== revision
  )
    throw Error(
      "Document revision conflict. Refresh the document snapshot before editing.",
    );
  if (
    !Array.isArray(request.commands) ||
    !request.commands.length ||
    request.commands.length > 100 ||
    JSON.stringify(request).length > 128000
  )
    throw Error("Commands exceed the allowed batch size.");
  let project = validateProject(input),
    chosen: string[] = [];
  for (const value of request.commands) {
    const c = object(value);
    if (c.type === "create") {
      keys(c, ["type", "shape", "x", "y", "width", "height", "fill", "stroke"]);
      const part = shapePart(project, c as unknown as CreateShape);
      project = validateProject({
        ...project,
        parts: [...project.parts, part],
      });
      chosen = [part.id];
    } else if (c.type === "set") {
      keys(c, ["type", "ids", "changes"]);
      chosen = selection(project, c.ids);
      const parts = selectedParts(project, chosen);
      if (!editable(parts))
        throw Error("Show and unlock every command target first.");
      const patch = object(c.changes);
      keys(patch, ["name", "fill", "stroke", "strokeWidth", "opacity"]);
      if (!Object.keys(patch).length)
        throw Error("No appearance changes supplied.");
      project = validateProject({
        ...project,
        parts: project.parts.map((p) =>
          chosen.includes(p.id) ? { ...p, ...patch } : p,
        ),
      });
    } else if (c.type === "move") {
      keys(c, ["type", "ids", "dx", "dy"]);
      chosen = selection(project, c.ids);
      if (
        !finite(c.dx) ||
        !finite(c.dy) ||
        selectedParts(project, chosen).some(
          (p) =>
            !finite(p.x + (c.dx as number)) || !finite(p.y + (c.dy as number)),
        )
      )
        throw Error("Movement exceeds safe coordinates.");
      project = moveParts(project, chosen, c.dx, c.dy);
    } else if (c.type === "organize") {
      keys(c, ["type", "ids", "action"]);
      chosen = selection(project, c.ids);
      if (
        ![
          "group",
          "ungroup",
          "duplicate",
          "delete",
          "hide",
          "show",
          "lock",
          "unlock",
          "forward",
          "backward",
          "front",
          "back",
        ].includes(String(c.action))
      )
        throw Error("Unsupported organization command.");
      const result = organize(project, chosen, c.action as OrganizationAction);
      project = result.project;
      chosen = result.ids;
    } else if (c.type === "renameDocument") {
      keys(c, ["type", "name"]);
      project = validateProject({ ...project, name: c.name });
    } else if (c.type === "frame") {
      keys(c, ["type", "x", "y", "width", "height"]);
      project = validateProject({
        ...project,
        viewBox: [c.x, c.y, c.width, c.height],
      });
    } else throw Error("Unsupported command.");
  }
  return {
    project: validateProject(project),
    ids: chosen,
    revision: revision + 1,
  };
}
