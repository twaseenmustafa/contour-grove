import type { Project } from "./project";
export interface History {
  past: Project[];
  present: Project;
  future: Project[];
}
export const history = (p: Project): History => ({
  past: [],
  present: p,
  future: [],
});
export function commit(s: History, p: Project): History {
  const metadata = (value: Project) =>
    JSON.stringify({
      ...value,
      source: {
        ...value.source,
        text: "",
        raster: value.source.raster
          ? { ...value.source.raster, dataURL: "" }
          : undefined,
      },
    });
  if (
    s.present.source.text === p.source.text &&
    s.present.source.raster?.dataURL === p.source.raster?.dataURL &&
    metadata(s.present) === metadata(p)
  )
    return s;
  return { past: [...s.past.slice(-19), s.present], present: p, future: [] };
}
export function undo(s: History): History {
  return s.past.length
    ? {
        past: s.past.slice(0, -1),
        present: s.past.at(-1)!,
        future: [s.present, ...s.future],
      }
    : s;
}
export function redo(s: History): History {
  return s.future.length
    ? {
        past: [...s.past, s.present],
        present: s.future[0],
        future: s.future.slice(1),
      }
    : s;
}
