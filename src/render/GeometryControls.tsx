import { useEffect, useRef, useState } from "react";
import { geometryJob } from "../geometry/client";
import { geometryParts } from "../geometry/document";
import type {
  BooleanOperation,
  GeometryResult,
  NodePath,
  PathNode,
} from "../geometry/types";
import type { Project } from "../model/project";
export interface NodeOverlay {
  paths: NodePath[];
  pathIndex: number;
  nodeIndex: number;
}
export default function GeometryControls({
  project,
  ids,
  overlay,
  keyboardEnabled,
  onOverlay,
  onResult,
}: {
  project: Project;
  ids: string[];
  overlay: NodeOverlay | null;
  keyboardEnabled: boolean;
  onOverlay: (overlay: NodeOverlay | null) => void;
  onResult: (
    before: Project,
    ids: string[],
    result: GeometryResult,
    name: string,
  ) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [draft, setDraft] = useState<PathNode | null>(null),
    controller = useRef<AbortController | null>(null);
  const pendingPath = useRef<string | null>(null);
  const signature = ids.join("|");
  useEffect(() => {
    controller.current?.abort();
    setBusy(false);
    setError("");
    if (
      pendingPath.current &&
      ids.length === 1 &&
      project.parts.find((p) => p.id === ids[0])?.geometry.d ===
        pendingPath.current
    ) {
      pendingPath.current = null;
    } else {
      pendingPath.current = null;
      onOverlay(null);
    }
    return () => controller.current?.abort();
  }, [project, signature, onOverlay]);
  const current = overlay?.paths[overlay.pathIndex]?.nodes[overlay.nodeIndex];
  useEffect(() => {
    setDraft(current ? { ...current } : null);
  }, [current]);
  async function perform(
    operation:
      | BooleanOperation
      | "inspect"
      | "node"
      | "addPoint"
      | "removePoint"
      | "insertPoint",
    mode?: "corner" | "smooth",
    direct?: { path: number; node: number; value: PathNode },
    insertion?: { x: number; y: number; tolerance: number },
  ) {
    setError("");
    const abort = new AbortController();
    controller.current?.abort();
    controller.current = abort;
    try {
      const parts = geometryParts(
        project,
        ids,
        !["inspect", "node", "addPoint", "removePoint", "insertPoint"].includes(
          operation,
        ),
      );
      setBusy(true);
      const result = await geometryJob(
        operation === "inspect"
          ? { type: "inspect", parts }
          : (operation === "addPoint" || operation === "removePoint") && overlay
            ? {
                type: operation,
                parts,
                path: overlay.pathIndex,
                node: overlay.nodeIndex,
              }
            : operation === "insertPoint" && insertion
              ? { type: "insertPoint", parts, ...insertion }
              : operation === "node" && overlay && (draft || direct)
                ? {
                    type: "node",
                    parts,
                    path: direct?.path ?? overlay.pathIndex,
                    node: direct?.node ?? overlay.nodeIndex,
                    value: direct?.value ?? draft!,
                    mode,
                  }
                : {
                    type: "boolean",
                    parts,
                    operation: operation as BooleanOperation,
                  },
        abort.signal,
      );
      if (abort.signal.aborted) return;
      if (operation === "inspect")
        onOverlay({ paths: result.paths, pathIndex: 0, nodeIndex: 0 });
      else {
        const pointEdit = [
          "node",
          "addPoint",
          "removePoint",
          "insertPoint",
        ].includes(operation);
        if (pointEdit) pendingPath.current = result.pathData;
        onResult(
          project,
          parts.map((p) => p.id),
          result,
          pointEdit
            ? parts[0].name
            : {
                union: "Union",
                subtract: "Subtract",
                intersect: "Intersect",
                exclude: "Exclude",
              }[operation as BooleanOperation],
        );
        onOverlay(
          pointEdit && overlay
            ? {
                ...overlay,
                paths: result.paths,
                pathIndex: result.selectedNode?.path ?? overlay.pathIndex,
                nodeIndex: result.selectedNode?.node ?? overlay.nodeIndex,
              }
            : null,
        );
      }
    } catch (e) {
      pendingPath.current = null;
      if (!abort.signal.aborted)
        setError(e instanceof Error ? e.message : "Geometry operation failed.");
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        setBusy(false);
      }
    }
  }
  useEffect(() => {
    const commit = (event: Event) => {
      const detail = (
        event as CustomEvent<{ path: number; node: number; value: PathNode }>
      ).detail;
      if (
        overlay &&
        detail &&
        detail.path === overlay.pathIndex &&
        detail.node === overlay.nodeIndex &&
        !busy
      )
        void perform("node", undefined, detail);
    };
    const insert = (event: Event) => {
      const detail = (
        event as CustomEvent<{ x: number; y: number; tolerance: number }>
      ).detail;
      if (overlay && detail && !busy)
        void perform("insertPoint", undefined, undefined, detail);
    };
    const remove = () => {
      if (overlay && !busy) void perform("removePoint");
    };
    const nudge = (event: KeyboardEvent) => {
      if (
        !overlay ||
        !keyboardEnabled ||
        busy ||
        event.defaultPrevented ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        !(event.target instanceof Element) ||
        !event.target.matches(".canvas-host:not(.is-manipulating)") ||
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      )
        return;
      const point = overlay.paths[overlay.pathIndex]?.nodes[overlay.nodeIndex];
      if (!point) return;
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const x =
        point.x +
        (event.key === "ArrowLeft"
          ? -step
          : event.key === "ArrowRight"
            ? step
            : 0);
      const y =
        point.y +
        (event.key === "ArrowUp"
          ? -step
          : event.key === "ArrowDown"
            ? step
            : 0);
      if (Math.abs(x) > 1e6 || Math.abs(y) > 1e6) return;
      void perform("node", undefined, {
        path: overlay.pathIndex,
        node: overlay.nodeIndex,
        value: { ...point, x, y },
      });
    };
    document.addEventListener("keydown", nudge);
    document.addEventListener("logo-node-remove", remove);
    document.addEventListener("logo-node-insert", insert);
    document.addEventListener("logo-node-commit", commit);
    return () => {
      document.removeEventListener("keydown", nudge);
      document.removeEventListener("logo-node-commit", commit);
      document.removeEventListener("logo-node-insert", insert);
      document.removeEventListener("logo-node-remove", remove);
    };
  });
  return (
    <details
      className="geometry-controls control-section"
      open={ids.length > 1 ? true : undefined}
    >
      <summary>Path tools</summary>
      <p>
        Select 2–16 filled, closed shapes without outlines to combine them. The
        bottom shape sets the color. The result replaces the originals; Undo
        brings them back.
      </p>
      <div className="boolean-tools">
        {(["union", "subtract", "intersect", "exclude"] as const).map((op) => (
          <button
            key={op}
            disabled={busy || ids.length < 2}
            onClick={() => void perform(op)}
          >
            {op[0].toUpperCase() + op.slice(1)}
          </button>
        ))}
      </div>
      <button
        className="inspect-nodes"
        disabled={busy || ids.length !== 1}
        onClick={() => void perform("inspect")}
      >
        Edit path nodes
      </button>
      {busy && (
        <div className="geometry-progress" role="status">
          Working…
          <button
            onClick={() => {
              controller.current?.abort();
              setBusy(false);
            }}
          >
            Cancel
          </button>
        </div>
      )}
      {error && (
        <p className="geometry-error" role="alert">
          {error}
        </p>
      )}
      {overlay && draft && (
        <div className="node-editor">
          <div className="node-pickers">
            <label>
              Subpath
              <select
                aria-label="Node subpath"
                value={overlay.pathIndex}
                onChange={(e) =>
                  onOverlay({
                    ...overlay,
                    pathIndex: Number(e.target.value),
                    nodeIndex: 0,
                  })
                }
              >
                {overlay.paths.map((p, i) => (
                  <option key={i} value={i}>
                    {i + 1} · {p.closed ? "Closed" : "Open"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Anchor
              <select
                aria-label="Path anchor"
                value={overlay.nodeIndex}
                onChange={(e) =>
                  onOverlay({ ...overlay, nodeIndex: Number(e.target.value) })
                }
              >
                {overlay.paths[overlay.pathIndex].nodes.map((_, i) => (
                  <option key={i} value={i}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p>
            Drag a point; hold Shift to move it straight. Alt/Option-drag a
            point to create a curve handle; add Shift for the other handle.
            Double-click a line to add a point. With the canvas focused, use
            arrow keys to move a point (Shift moves farther); Escape exits.
          </p>
          <div className="node-fields">
            {(["x", "y", "inX", "inY", "outX", "outY"] as const).map((key) => (
              <label key={key}>
                {
                  {
                    x: "X",
                    y: "Y",
                    inX: "In X",
                    inY: "In Y",
                    outX: "Out X",
                    outY: "Out Y",
                  }[key]
                }
                <input
                  type="number"
                  aria-label={`Node ${key}`}
                  min="-1000000"
                  max="1000000"
                  step="any"
                  value={draft[key]}
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
          </div>
          <div className="node-actions">
            <button disabled={busy} onClick={() => void perform("node")}>
              Apply node
            </button>
            <button
              disabled={busy}
              onClick={() => void perform("node", "corner")}
            >
              Corner
            </button>
            <button
              disabled={busy}
              onClick={() => void perform("node", "smooth")}
            >
              Smooth
            </button>
          </div>
          <div className="node-actions">
            <button disabled={busy} onClick={() => void perform("addPoint")}>
              Add point after
            </button>
            <button disabled={busy} onClick={() => void perform("removePoint")}>
              Remove point
            </button>
          </div>
          <button onClick={() => onOverlay(null)}>Exit node editing</button>
        </div>
      )}
    </details>
  );
}
