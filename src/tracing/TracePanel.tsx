import { useEffect, useRef, useState } from "react";
import type { Project } from "../model/project";
import { createLogoSVG } from "../export/logo";
import { traceRaster, tracedProject } from "./raster";
import {
  defaultTraceOptions,
  type RasterImage,
  type TraceOptions,
  type TraceResult,
} from "./types";
export default function TracePanel({
  image,
  initialOptions,
  onCancel,
  onAccept,
  acceptLabel = "Use these shapes",
  cancelLabel = "Keep current logo",
}: {
  image: RasterImage;
  acceptLabel?: string;
  cancelLabel?: string;
  initialOptions?: TraceOptions;
  onCancel: () => void;
  onAccept: (project: Project) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    preview = useRef<HTMLDivElement>(null);
  const [options, setOptions] = useState<TraceOptions>(
    initialOptions ?? defaultTraceOptions,
  );
  const [result, setResult] = useState<TraceResult | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError("");
    preview.current?.replaceChildren();
    const timer = setTimeout(() => {
      void traceRaster(image, options, controller.signal)
        .then((value) => {
          if (controller.signal.aborted) return;
          const project = tracedProject(image, value, options);
          preview.current?.replaceChildren(
            createLogoSVG(project, { effects: false, background: false }),
          );
          setResult(value);
        })
        .catch((e) => {
          if (!controller.signal.aborted)
            setError(
              e instanceof Error ? e.message : "Could not trace this image.",
            );
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [image, options]);
  const change = (patch: Partial<TraceOptions>) => {
    setResult(null);
    setOptions((o) => ({ ...o, ...patch }));
  };
  return (
    <dialog
      ref={dialog}
      className="trace-dialog"
      aria-labelledby="trace-heading"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <div className="trace-header">
        <div>
          <span className="eyebrow">IMAGE TO EDITABLE SHAPES</span>
          <h2 id="trace-heading">Turn your image into shapes</h2>
          <p>
            We follow the visible edges to make an editable copy. The original
            image stays unchanged. Original layers, fonts and hidden parts
            cannot be recovered.
          </p>
        </div>
        <button aria-label="Cancel tracing" onClick={onCancel}>
          ×
        </button>
      </div>
      <div className="trace-comparison">
        <section>
          <h3>Original · kept untouched</h3>
          <div className="trace-preview">
            <img src={image.dataURL} alt="Original uploaded logo" />
          </div>
          <p>
            {image.width} × {image.height} pixels
          </p>
        </section>
        <section>
          <h3>Editable shapes</h3>
          <div
            className="trace-preview trace-result-preview"
            ref={preview}
            data-testid="trace-preview"
          />
          <p role="status">
            {error ||
              (result
                ? `${result.shapes.length} editable shapes · preview ${result.width} × ${result.height}`
                : "Tracing in your browser…")}
          </p>
        </section>
      </div>
      <div className="trace-settings">
        <label>
          Shape colors
          <select
            aria-label="Shape colors"
            value={options.mode}
            onChange={(e) =>
              change({ mode: e.target.value as TraceOptions["mode"] })
            }
          >
            <option value="silhouette">One color (dark areas)</option>
            <option value="color">Multiple colors</option>
          </select>
        </label>
      </div>
      <details className="trace-advanced">
        <summary>More options</summary>
        <div className="trace-settings">
          {options.mode === "silhouette" ? (
            <label>
              Include lighter areas · {options.threshold}
              <span className="trace-setting-hint">
                Move right to include more light areas.
              </span>
              <input
                aria-label="Include lighter areas"
                type="range"
                min="30"
                max="240"
                value={options.threshold}
                onChange={(e) => change({ threshold: +e.target.value })}
              />
            </label>
          ) : (
            <>
              <label>
                Number of colors
                <select
                  aria-label="Number of colors"
                  value={options.colors}
                  onChange={(e) =>
                    change({ colors: +e.target.value as 4 | 8 | 12 })
                  }
                >
                  {[4, 8, 12].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="trace-check">
                <input
                  type="checkbox"
                  checked={options.removeBackground}
                  onChange={(e) =>
                    change({ removeBackground: e.target.checked })
                  }
                />
                Remove light outer background
              </label>
            </>
          )}
          <label>
            Shape detail
            <select
              aria-label="Shape detail"
              value={options.detail}
              onChange={(e) =>
                change({ detail: e.target.value as TraceOptions["detail"] })
              }
            >
              <option value="smooth">Smoother</option>
              <option value="balanced">Balanced</option>
              <option value="detailed">More detail</option>
            </select>
          </label>
        </div>
      </details>
      <p className="trace-caveat">
        Best for simple logos with clear edges. Touching areas may become one
        shape. One color keeps dark areas; multiple colors simplifies the image.
        Textures and gradients may not be kept. Check the preview before
        continuing.
      </p>
      <div className="trace-footer">
        <button onClick={onCancel}>{cancelLabel}</button>
        <button
          className="primary"
          disabled={!result || !!error}
          onClick={() =>
            result && onAccept(tracedProject(image, result, options))
          }
        >
          {acceptLabel}
        </button>
      </div>
    </dialog>
  );
}
