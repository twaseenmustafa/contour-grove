import {
  defaultShadow,
  identity,
  validateProject,
  type Project,
} from "../model/project";
import { inspectImage, MAX_FILE_BYTES } from "./image-header";
import type {
  RasterImage,
  TraceOptions,
  TraceResult,
  WorkerReply,
} from "./types";

export async function prepareRaster(file: File): Promise<RasterImage> {
  if (file.size > MAX_FILE_BYTES)
    throw Error("Use a PNG or JPG smaller than 4 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = inspectImage(bytes);
  const bitmap = await createImageBitmap(
    new Blob([bytes], { type: header.mime }),
  );
  try {
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw Error("Your browser could not prepare this image.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataURL = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () =>
        reject(Error("Could not read the original image."));
      reader.readAsDataURL(new Blob([bytes], { type: header.mime }));
    });
    return {
      name: file.name.slice(0, 200),
      dataURL,
      width: header.width,
      height: header.height,
      traceWidth: canvas.width,
      traceHeight: canvas.height,
      pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
    };
  } finally {
    bitmap.close();
  }
}

export function traceRaster(
  image: RasterImage,
  options: TraceOptions,
  signal: AbortSignal,
): Promise<TraceResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Canceled", "AbortError"));
      return;
    }
    const worker = new Worker(new URL("./trace.worker.ts", import.meta.url), {
      type: "module",
    });
    const finish = (error?: Error, result?: TraceResult) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      worker.terminate();
      if (error) reject(error);
      else resolve(result!);
    };
    const abort = () => finish(new DOMException("Canceled", "AbortError"));
    const timer = setTimeout(
      () =>
        finish(Error("Tracing took too long. Try a smaller or simpler image.")),
      20000,
    );
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }: MessageEvent<WorkerReply>) =>
      data.ok ? finish(undefined, data.result) : finish(Error(data.error));
    worker.onerror = () =>
      finish(
        Error("The tracing worker could not run. Try refreshing this page."),
      );
    const pixels = new Uint8ClampedArray(image.pixels);
    worker.postMessage(
      { width: image.traceWidth, height: image.traceHeight, pixels, options },
      [pixels.buffer],
    );
  });
}

export function tracedProject(
  image: RasterImage,
  result: TraceResult,
  options: TraceOptions,
): Project {
  return validateProject({
    schemaVersion: 1,
    name: image.name.replace(/\.[^.]+$/, "").slice(0, 120),
    source: {
      name: image.name,
      text: "",
      raster: {
        dataURL: image.dataURL,
        width: image.width,
        height: image.height,
        tracedWidth: result.width,
        tracedHeight: result.height,
        options,
      },
    },
    viewBox: [0, 0, result.width, result.height],
    background: null,
    parts: result.shapes.map((shape, i) => ({
      id: `trace-${i + 1}`,
      name: `Part ${i + 1}`,
      group: "Traced image",
      kind: "path",
      geometry: { d: shape.d },
      matrix: [...identity],
      x: 0,
      y: 0,
      fill: shape.fill,
      stroke: "none",
      strokeWidth: 0,
      opacity: shape.opacity,
      fillRule: "evenodd",
      lineCap: "round",
      lineJoin: "round",
      shadow: defaultShadow(),
    })),
  });
}
