import { validateProject, type Project } from "../model/project";
export const STORAGE_KEY = "logo-workshop.project.v1";
export function readProject(text: string): Project {
  if (text.length > 8e6) throw Error("Project files must be under 8 MB.");
  return validateProject(JSON.parse(text));
}
export function legacySaveLocal(p: Project) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(validateProject(p)));
}
export function legacyLoadLocal(): Project | null {
  const text = localStorage.getItem(STORAGE_KEY);
  return text ? readProject(text) : null;
}
