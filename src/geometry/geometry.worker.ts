/// <reference lib="webworker" />
import { runGeometry } from "./core";
import type { GeometryJob } from "./types";
self.onmessage = (event: MessageEvent<GeometryJob>) => {
  try {
    self.postMessage({ ok: true, value: runGeometry(event.data) });
  } catch (e) {
    self.postMessage({
      ok: false,
      error: e instanceof Error ? e.message : "Geometry operation failed.",
    });
  }
};
