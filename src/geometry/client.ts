import type { GeometryJob, GeometryResult } from "./types";
export function geometryJob(
  job: GeometryJob,
  signal?: AbortSignal,
): Promise<GeometryResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Error("Geometry operation canceled."));
      return;
    }
    const worker = new Worker(
      new URL("./geometry.worker.ts", import.meta.url),
      { type: "module" },
    );
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      worker.terminate();
    };
    const cancel = () => {
      cleanup();
      reject(Error("Geometry operation canceled."));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(
        Error(
          "Geometry operation exceeded 8 seconds. Originals are unchanged.",
        ),
      );
    }, 8000);
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onerror = () => {
      cleanup();
      reject(Error("Geometry worker unavailable. Originals are unchanged."));
    };
    worker.onmessage = (event) => {
      cleanup();
      if (event.data?.ok) resolve(event.data.value as GeometryResult);
      else reject(Error(event.data?.error || "Geometry operation failed."));
    };
    worker.postMessage(job);
  });
}
