import { tracePixels } from "./core";
import type { TraceJob, WorkerReply } from "./types";
self.onmessage = (event: MessageEvent<TraceJob>) => {
  let reply: WorkerReply;
  try {
    reply = { ok: true, result: tracePixels(event.data) };
  } catch (error) {
    reply = {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "The image could not be traced.",
    };
  }
  self.postMessage(reply);
};
