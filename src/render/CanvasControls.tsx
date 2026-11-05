import { useState, type ReactNode } from "react";
import type { Project } from "../model/project";
import { resizeCanvas, trimCanvas } from "../model/framing";
import { measureArtwork } from "./measureArtwork";
type Props = {
  children?: ReactNode;
  project: Project;
  onApply: (next: Project) => void;
  onError: (message: string) => void;
};
function report(error: unknown, onError: Props["onError"]) {
  onError(
    error instanceof Error ? error.message : "Could not change the canvas.",
  );
}
function CanvasSizeForm({ project, onApply, onError }: Props) {
  const [width, setWidth] = useState(
      String(Number(project.viewBox[2].toFixed(3))),
    ),
    [height, setHeight] = useState(
      String(Number(project.viewBox[3].toFixed(3))),
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        try {
          onApply(resizeCanvas(project, Number(width), Number(height)));
        } catch (e) {
          report(e, onError);
        }
      }}
    >
      <div className="two-fields">
        <label>
          Width
          <input
            aria-label="Canvas width"
            type="number"
            required
            min="1"
            max="100000"
            step="any"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
          />
        </label>
        <label>
          Height
          <input
            aria-label="Canvas height"
            type="number"
            required
            min="1"
            max="100000"
            step="any"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
          />
        </label>
      </div>
      <button className="full">Apply canvas size</button>
    </form>
  );
}
export default function CanvasControls({
  project,
  onApply,
  onError,
  children,
}: Props) {
  const [padding, setPadding] = useState("16");
  return (
    <details className="canvas-setup">
      <summary>
        Canvas setup{" "}
        <span>
          {Math.round(project.viewBox[2])} × {Math.round(project.viewBox[3])}
        </span>
      </summary>
      <p className="control-hint">Export frame only. Shapes stay unchanged.</p>
      <CanvasSizeForm
        key={project.viewBox.join(",")}
        project={project}
        onApply={onApply}
        onError={onError}
      />
      <div className="trim-controls">
        <h3>Trim empty space</h3>
        <label>
          Padding (canvas units)
          <input
            aria-label="Trim padding"
            type="number"
            min="0"
            max="5000"
            step="any"
            value={padding}
            onChange={(e) => setPadding(e.target.value)}
          />
        </label>
        <button
          className="full"
          disabled={!project.parts.some((p) => !p.hidden)}
          onClick={() => {
            try {
              onApply(
                trimCanvas(
                  project,
                  measureArtwork(project),
                  padding.trim() ? Number(padding) : NaN,
                ),
              );
            } catch (e) {
              report(e, onError);
            }
          }}
        >
          Trim to artwork
        </button>
        <p className="control-hint">
          Fits visible artwork with safe room for outlines and shadows.
        </p>
      </div>
      {children}
    </details>
  );
}
