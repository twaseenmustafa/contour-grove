export interface TraceOptions {
  mode: "silhouette" | "color";
  threshold: number;
  colors: 4 | 8 | 12;
  detail: "smooth" | "balanced" | "detailed";
  removeBackground: boolean;
}
export const defaultTraceOptions: TraceOptions = {
  mode: "silhouette",
  threshold: 160,
  colors: 8,
  detail: "balanced",
  removeBackground: true,
};
export function validTraceOptions(value: unknown): value is TraceOptions {
  if (!value || typeof value !== "object") return false;
  const o = value as TraceOptions;
  return (
    ["silhouette", "color"].includes(o.mode) &&
    Number.isInteger(o.threshold) &&
    o.threshold >= 30 &&
    o.threshold <= 240 &&
    [4, 8, 12].includes(o.colors) &&
    ["smooth", "balanced", "detailed"].includes(o.detail) &&
    typeof o.removeBackground === "boolean"
  );
}
export interface RasterSource {
  dataURL: string;
  width: number;
  height: number;
  tracedWidth: number;
  tracedHeight: number;
  options: TraceOptions;
}
export interface RasterImage {
  name: string;
  dataURL: string;
  width: number;
  height: number;
  traceWidth: number;
  traceHeight: number;
  pixels: Uint8ClampedArray;
}
export interface TracedShape {
  d: string;
  fill: string;
  opacity: number;
}
export interface TraceResult {
  shapes: TracedShape[];
  width: number;
  height: number;
  elapsedMs: number;
}
export interface TraceJob {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  options: TraceOptions;
}
export type WorkerReply =
  { ok: true; result: TraceResult } | { ok: false; error: string };
