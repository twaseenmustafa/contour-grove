import { validateProject, type Project } from "../model/project";
import { legacyLoadLocal } from "./project";
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("logo-workshop", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("projects");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(Error("Close older Logo Workshop tabs to enable autosave."));
  });
}
export async function saveLocal(project: Project): Promise<void> {
  const value = validateProject(project),
    db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("projects", "readwrite");
    tx.objectStore("projects").put(value, "current");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function loadLocal(): Promise<Project | null> {
  const db = await database();
  const value = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction("projects", "readonly");
    const request = tx.objectStore("projects").get("current");
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
  if (value !== undefined) return validateProject(value);
  const project = legacyLoadLocal();
  if (project) await saveLocal(project);
  return project;
}
