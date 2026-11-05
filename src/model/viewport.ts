import type { Point } from "./transform";
/** Preview camera only. Never serialize into a project or export. */
export function zoomBox(
  base: readonly number[],
  zoom: number,
  pan: Point = { x: 0, y: 0 },
): [number, number, number, number] {
  if (
    base.length !== 4 ||
    !base.every(Number.isFinite) ||
    base[2] <= 0 ||
    base[3] <= 0 ||
    !Number.isFinite(zoom) ||
    zoom < 0.05 ||
    zoom > 16 ||
    !Number.isFinite(pan.x) ||
    !Number.isFinite(pan.y) ||
    Math.abs(pan.x) > 1e6 ||
    Math.abs(pan.y) > 1e6
  )
    throw Error("Unsupported viewport camera.");
  const w = base[2] / zoom,
    h = base[3] / zoom;
  return [
    base[0] + (base[2] - w) / 2 + pan.x,
    base[1] + (base[3] - h) / 2 + pan.y,
    w,
    h,
  ];
}
export function panBy(origin: Point, dx: number, dy: number): Point {
  if (![origin.x, origin.y, dx, dy].every(Number.isFinite))
    throw Error("Invalid camera movement.");
  return {
    x: Math.max(-1e6, Math.min(1e6, origin.x + dx)),
    y: Math.max(-1e6, Math.min(1e6, origin.y + dy)),
  };
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 16;
/** Full-panel virtual world. The export frame is not the camera boundary. */
export function workspaceBox(
  base: readonly number[],
  zoom: number,
  pan: Point,
  pixels: { width: number; height: number },
): [number, number, number, number] {
  if (
    base.length !== 4 ||
    !base.every(Number.isFinite) ||
    base[2] <= 0 ||
    base[3] <= 0 ||
    !finiteCamera(zoom, pan) ||
    ![pixels.width, pixels.height].every((n) => Number.isFinite(n) && n > 0)
  )
    throw Error("Unsupported workspace camera.");
  const margin = Math.min(64, pixels.width * 0.1, pixels.height * 0.1),
    scale =
      Math.max(
        1e-8,
        Math.min(
          (pixels.width - margin * 2) / base[2],
          (pixels.height - margin * 2) / base[3],
        ),
      ) * zoom;
  const w = pixels.width / scale,
    h = pixels.height / scale;
  return [
    base[0] + base[2] / 2 - w / 2 + pan.x,
    base[1] + base[3] / 2 - h / 2 + pan.y,
    w,
    h,
  ];
}
function finiteCamera(zoom: number, pan: Point) {
  return (
    Number.isFinite(zoom) &&
    zoom >= MIN_ZOOM &&
    zoom <= MAX_ZOOM &&
    Number.isFinite(pan.x) &&
    Number.isFinite(pan.y) &&
    Math.abs(pan.x) <= 1e6 &&
    Math.abs(pan.y) <= 1e6
  );
}
/** Keep a world anchor stationary while zooming within the current camera. */
export function anchoredPan(
  pan: Point,
  anchor: Point,
  center: Point,
  oldZoom: number,
  newZoom: number,
): Point {
  return panBy(
    pan,
    (anchor.x - center.x) * (1 - oldZoom / newZoom),
    (anchor.y - center.y) * (1 - oldZoom / newZoom),
  );
}
