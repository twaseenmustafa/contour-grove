import { shapePart } from "../commands/document";
import { validateProject, type Part, type Project } from "./project";
import type { Point } from "./transform";
export function addText(project: Project, point: Point, size = 64) {
  const part: Part = {
    ...shapePart(project, {
      type: "create",
      shape: "rectangle",
      x: point.x,
      y: point.y,
      width: 1,
      height: 1,
    }),
    name: "Text",
    group: "Text",
    kind: "text",
    geometry: { x: "0", y: "0" },
    textData: { value: "Your text", font: "sans-serif", size, bold: false },
  };
  return {
    project: validateProject({ ...project, parts: [...project.parts, part] }),
    id: part.id,
  };
}
