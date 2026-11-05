import { validateProject, type Project } from "./project";
import type { Bounds } from "./transform";

/** Change the frame, never the original artwork. Coordinates are canvas units. */
export function resizeCanvas(
  project: Project,
  width: number,
  height: number,
): Project {
  if (
    ![width, height].every((n) => Number.isFinite(n) && n >= 1 && n <= 100000)
  )
    throw Error("Canvas width and height must be between 1 and 100,000 units.");
  const [x, y, w, h] = project.viewBox;
  return validateProject({
    ...project,
    viewBox: [x + (w - width) / 2, y + (h - height) / 2, width, height],
  });
}
export function trimCanvas(
  project: Project,
  boxes: Bounds[],
  padding: number,
): Project {
  if (!Number.isFinite(padding) || padding < 0 || padding > 5000)
    throw Error("Padding must be between 0 and 5,000 canvas units.");
  if (!boxes.length)
    throw Error("Show at least one visible shape before trimming the canvas.");
  if (
    !boxes.every(
      (b) =>
        [b.x, b.y, b.width, b.height].every(Number.isFinite) &&
        b.width >= 0 &&
        b.height >= 0,
    )
  )
    throw Error("Could not measure this artwork safely.");
  const x = Math.min(...boxes.map((b) => b.x)) - padding,
    y = Math.min(...boxes.map((b) => b.y)) - padding,
    right = Math.max(...boxes.map((b) => b.x + b.width)) + padding,
    bottom = Math.max(...boxes.map((b) => b.y + b.height)) + padding;
  return validateProject({
    ...project,
    viewBox: [x, y, Math.max(1, right - x), Math.max(1, bottom - y)],
  });
}
