import { snapMove, snapResize, type SnapResult } from "../model/snap";
import { penPathData, type PenPoint } from "../model/pen";
import type { NodeOverlay } from "./GeometryControls";
import {
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Part, Project } from "../model/project";
import {
  adjustmentText,
  cornerResize,
  frame,
  normalizeAngle,
  rotatedPart,
  type Bounds,
  type Corner,
  type Point,
} from "../model/transform";
import { createLogoSVG, type RenderOptions } from "../export/logo";
import { clampMovement, editable } from "../model/organization";
import {
  zoomBox,
  panBy,
  workspaceBox,
  anchoredPan,
  MIN_ZOOM,
  MAX_ZOOM,
} from "../model/viewport";
import { ASSET_DRAG_TYPE } from "../model/assets";
const NS = "http://www.w3.org/2000/svg";
interface Props {
  inkEdges?: boolean;
  grid?: boolean;
  snap?: boolean;
  nodeOverlay?: NodeOverlay | null;
  onNodePick?: (path: number, node: number) => void;
  onExitNodes?: () => void;
  onEditText?: (id: string) => void;
  workspace?: boolean;
  onCameraChange?: (zoom: number, pan: Point) => void;
  tool?: "select" | "hand" | "pen" | "scissors";
  onCut?: (
    id: string | null,
    point: Point,
    tolerance: number,
    end?: Point,
  ) => void;
  onPenFinish?: (points: PenPoint[], closed: boolean) => boolean;
  pan?: Point;
  onPanChange?: (point: Point) => void;
  onDropAsset?: (id: string, point: Point) => void;
  onDropFiles?: (files: File[], point: Point) => void;
  zoom?: number;
  project: Project;
  selected: string | null;
  options: RenderOptions;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  onTransform?: (id: string, edit: Partial<Part>) => boolean | void;
  onBounds?: (value: { id: string; bounds: Bounds } | null) => void;
  keepProportions?: boolean;
  selection?: string[];
  onPick?: (id: string | null, additive: boolean) => string[];
  onMoveMany?: (ids: string[], dx: number, dy: number) => boolean;
}
interface Gesture {
  id: string;
  part: Part;
  bounds: Bounds;
  project: Project;
  start: Point;
  pointer: number;
  mode: "move" | "rotate" | Corner;
  latest: Part;
  locked: boolean;
  lastAngle: number;
  rotation: number;
}
function node(tag: string, attributes: Record<string, string | number> = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes))
    el.setAttribute(key, String(value));
  return el;
}
export default function LogoCanvas({
  inkEdges = true,
  grid = true,
  snap = false,
  nodeOverlay,
  onNodePick,
  onExitNodes,
  onEditText,
  workspace = true,
  onCameraChange,
  onPenFinish,
  onCut,
  tool = "select",
  pan = { x: 0, y: 0 },
  onPanChange,
  project,
  selected,
  options,
  onSelect,
  onMove,
  onTransform,
  onBounds,
  keepProportions = true,
  selection,
  onPick,
  onMoveMany,
  zoom = 1,
  onDropAsset,
  onDropFiles,
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    drag = useRef<Gesture | null>(null),
    boundsRef = useRef<{ id: string; bounds: Bounds } | null>(null);
  const multi = useRef<{
    project: Project;
    ids: string[];
    parts: Part[];
    start: Point;
    pointer: number;
    dx: number;
    dy: number;
  } | null>(null);
  const cameraDrag = useRef<{
    pointer: number;
    start: Point;
    origin: Point;
    unit: number;
  } | null>(null);
  const nodeDrag = useRef<{
    pointer: number;
    path: number;
    index: number;
    kind: "anchor" | "in" | "out" | "new-in" | "new-out";
    original: NodeOverlay;
    value: NodeOverlay;
    start: Point;
    moved: boolean;
    project: Project;
  } | null>(null);
  const overlayRef = useRef(nodeOverlay);
  overlayRef.current = nodeOverlay;
  const exitNodesRef = useRef(onExitNodes);
  exitNodesRef.current = onExitNodes;
  const scene = useRef<{
    project: Project;
    options: RenderOptions;
    selected: string | null;
    selection: string;
    workspace: boolean;
    inkEdges: boolean;
  } | null>(null);
  const cutDrag = useRef<{
    pointer: number;
    id: string | null;
    start: Point;
    end: Point;
    clientX: number;
    clientY: number;
    unit: number;
    project: Project;
  } | null>(null);
  function drawCut() {
    const svg = host.current?.querySelector<SVGSVGElement>("svg");
    if (!svg) return;
    svg.querySelector("[data-cut-preview]")?.remove();
    const d = cutDrag.current;
    if (!d) return;
    svg.append(
      node("line", {
        "data-cut-preview": "true",
        x1: d.start.x,
        y1: d.start.y,
        x2: d.end.x,
        y2: d.end.y,
        stroke: "#e6c2ee",
        "stroke-width": 2,
        "stroke-dasharray": "6 4",
        "vector-effect": "non-scaling-stroke",
        "pointer-events": "none",
      }),
    );
  }
  function clearCut() {
    const d = cutDrag.current;
    cutDrag.current = null;
    if (d && host.current?.hasPointerCapture(d.pointer))
      host.current.releasePointerCapture(d.pointer);
    drawCut();
  }
  const penPoints = useRef<PenPoint[]>([]);
  const penDrag = useRef<{
    pointer: number;
    index: number;
    startX: number;
    startY: number;
  } | null>(null);
  const penHover = useRef<Point | null>(null);
  const penProject = useRef(project);
  const penFinish = useRef(onPenFinish);
  penFinish.current = onPenFinish;
  function drawPen() {
    const svg = host.current?.querySelector<SVGSVGElement>("svg");
    if (!svg) return;
    svg.querySelector("[data-pen-preview]")?.remove();
    const pts = penPoints.current;
    if (!pts.length) return;
    const group = node("g", {
      "data-pen-preview": "true",
      "pointer-events": "none",
    });
    const all = penHover.current ? [...pts, penHover.current] : pts;
    group.append(
      node("path", {
        d: penPathData(all, false),
        fill: "none",
        stroke: "#bba6ff",
        "stroke-width": 1.5,
        "vector-effect": "non-scaling-stroke",
      }),
    );
    const m = svg.getScreenCTM(),
      unit = m ? 1 / Math.max(Math.hypot(m.a, m.b), 1e-8) : 1;
    for (const p of pts) {
      if (p.handleX || p.handleY) {
        const x = p.handleX ?? 0,
          y = p.handleY ?? 0;
        group.append(
          node("path", {
            "data-pen-handle": "true",
            d: `M ${p.x - x} ${p.y - y} L ${p.x + x} ${p.y + y}`,
            fill: "none",
            stroke: "#bba6ff",
            "stroke-width": 1,
            "vector-effect": "non-scaling-stroke",
          }),
        );
      }
      group.append(
        node("circle", {
          cx: p.x,
          cy: p.y,
          r: 4 * unit,
          fill: "#ffffff",
          stroke: "#9877f0",
          "stroke-width": 1.5,
          "vector-effect": "non-scaling-stroke",
        }),
      );
    }
    svg.append(group);
  }
  function clearPen() {
    const active = penDrag.current;
    penDrag.current = null;
    if (active && host.current?.hasPointerCapture(active.pointer))
      host.current.releasePointerCapture(active.pointer);
    penPoints.current = [];
    penHover.current = null;
    drawPen();
  }
  function finishPen(closed: boolean) {
    if (penPoints.current.length < (closed ? 3 : 2)) return;
    if (penFinish.current?.([...penPoints.current], closed)) clearPen();
  }
  const snapState = useRef<{
    moving: Bounds;
    targets: Bounds[];
    unit: number;
  } | null>(null);
  function clearSnap() {
    snapState.current = null;
    host.current?.querySelector("[data-snap-guides]")?.remove();
  }
  function beginSnap(ids: string[], svg: SVGSVGElement) {
    clearSnap();
    if (!snap) return;
    const boxes = project.parts
      .filter((p) => !p.hidden)
      .map((p) => ({ id: p.id, box: findPart(svg, p.id)?.getBBox() }))
      .filter((v): v is { id: string; box: DOMRect } => !!v.box);
    const selectedBoxes = boxes
      .filter((v) => ids.includes(v.id))
      .map((v) => v.box);
    if (!selectedBoxes.length) return;
    const x = Math.min(...selectedBoxes.map((b) => b.x)),
      y = Math.min(...selectedBoxes.map((b) => b.y));
    const right = Math.max(...selectedBoxes.map((b) => b.x + b.width)),
      bottom = Math.max(...selectedBoxes.map((b) => b.y + b.height));
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    snapState.current = {
      moving: { x, y, width: right - x, height: bottom - y },
      targets: [
        ...boxes.filter((v) => !ids.includes(v.id)).map((v) => v.box),
        {
          x: project.viewBox[0],
          y: project.viewBox[1],
          width: project.viewBox[2],
          height: project.viewBox[3],
        },
      ],
      unit: 1 / Math.max(Math.hypot(matrix.a, matrix.b), 1e-8),
    };
  }
  function snapped(dx: number, dy: number, alt: boolean): SnapResult {
    const s = snapState.current;
    if (!s || alt || Math.hypot(dx, dy) < 2 * s.unit)
      return { dx, dy, xGuide: null, yGuide: null };
    return snapMove(s.moving, s.targets, dx, dy, 6 * s.unit);
  }
  function drawSnap(result: SnapResult) {
    const svg = host.current?.querySelector<SVGSVGElement>("svg");
    if (!svg) return;
    svg.querySelector("[data-snap-guides]")?.remove();
    if (result.xGuide === null && result.yGuide === null) return;
    const box = svg.viewBox.baseVal,
      guides = node("g", {
        "data-snap-guides": "true",
        "pointer-events": "none",
        "aria-hidden": "true",
      });
    const base = {
      stroke: "#e48cc8",
      "stroke-width": 1,
      "vector-effect": "non-scaling-stroke",
    };
    if (result.xGuide !== null)
      guides.append(
        node("line", {
          ...base,
          x1: result.xGuide,
          x2: result.xGuide,
          y1: box.y,
          y2: box.y + box.height,
        }),
      );
    if (result.yGuide !== null)
      guides.append(
        node("line", {
          ...base,
          y1: result.yGuide,
          y2: result.yGuide,
          x1: box.x,
          x2: box.x + box.width,
        }),
      );
    svg.append(guides);
  }
  const gridRef = useRef(grid);
  gridRef.current = grid;
  const space = useRef(false);
  const cameraInfo = useRef({ base: [0, 0, 320, 320], workspace, zoom, pan });
  const cameraChange = useRef(onCameraChange);
  cameraChange.current = onCameraChange;
  function viewport(svg: SVGSVGElement) {
    const h = host.current,
      c = cameraInfo.current;
    if (!h) return;
    const b = c.workspace
      ? workspaceBox(c.base, c.zoom, c.pan, {
          width: Math.max(1, h.clientWidth),
          height: Math.max(1, h.clientHeight),
        })
      : zoomBox(c.base, c.zoom, c.pan);
    svg.setAttribute("viewBox", b.join(" "));
    const gridRect = svg.querySelector<SVGRectElement>("[data-workspace-grid]");
    const pattern = svg.querySelector<SVGPatternElement>("[data-grid-pattern]");
    const dot = svg.querySelector<SVGCircleElement>("[data-grid-dot]");
    if (gridRect && pattern && dot) {
      const worldPerPixel = b[2] / Math.max(1, h.clientWidth);
      // A quiet, camera-aligned texture. Density stays useful at extreme zooms.
      const pixels = Math.max(14, Math.min(24, 18 * c.zoom));
      const step = pixels * worldPerPixel;
      for (const [key, value] of Object.entries({
        x: b[0],
        y: b[1],
        width: b[2],
        height: b[3],
      }))
        gridRect.setAttribute(key, String(value));
      gridRect.setAttribute("display", gridRef.current ? "inline" : "none");
      pattern.setAttribute("x", "0");
      pattern.setAttribute("y", "0");
      pattern.setAttribute("width", String(step));
      pattern.setAttribute("height", String(step));
      dot.setAttribute("cx", String(step / 2));
      dot.setAttribute("cy", String(step / 2));
      dot.setAttribute("r", String(0.75 * worldPerPixel));
    }
    const label = svg.querySelector<SVGTextElement>("[data-artboard-name]"),
      frame = svg.querySelector("[data-export-frame]");
    const matrix = svg.getScreenCTM(),
      unit = matrix ? 1 / Math.max(Math.hypot(matrix.a, matrix.b), 1e-8) : 1;
    if (label && frame) {
      label.setAttribute("font-size", String(11 * unit));
      label.setAttribute(
        "y",
        String(Number(frame.getAttribute("y")) - 10 * unit),
      );
    }
  }
  const cameraCallback = useRef(onPanChange);
  cameraCallback.current = onPanChange;
  const panRef = useRef(pan);
  panRef.current = pan;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const lastCamera = useRef({ x: pan.x, y: pan.y, tool });
  function endPan(restore = true) {
    const d = cameraDrag.current;
    if (!d) return;
    cameraDrag.current = null;
    host.current?.classList.remove("is-panning");
    if (restore) cameraCallback.current?.(d.origin);
    release(d.pointer);
  }
  const zoomRef = useRef(zoom);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const manyRef = useRef(onMoveMany);
  manyRef.current = onMoveMany;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const callbacks = useRef({ onTransform, onMove });
  callbacks.current = { onTransform, onMove };
  const findPart = (svg: SVGSVGElement, id: string) =>
    Array.from(svg.querySelectorAll<SVGGElement>("[data-part]")).find(
      (el) => el.dataset.part === id,
    );
  function drawNodes(svg: SVGSVGElement) {
    svg.querySelector("[data-node-overlay]")?.remove();
    const overlay = overlayRef.current;
    if (!overlay) return;
    const matrix = svg.getScreenCTM(),
      unit = matrix ? 1 / Math.max(Math.hypot(matrix.a, matrix.b), 1e-8) : 1;
    const group = node("g", {
      "data-node-overlay": "true",
      "aria-hidden": "true",
    });
    if (nodeDrag.current) {
      const d = overlay.paths
        .map((path) => {
          const nodes = path.nodes;
          if (!nodes.length) return "";
          let out = `M ${nodes[0].x} ${nodes[0].y}`;
          const count = path.closed ? nodes.length : nodes.length - 1;
          for (let i = 0; i < count; i++) {
            const a = nodes[i],
              b = nodes[(i + 1) % nodes.length];
            out += ` C ${a.x + a.outX} ${a.y + a.outY} ${b.x + b.inX} ${b.y + b.inY} ${b.x} ${b.y}`;
          }
          return out + (path.closed ? " Z" : "");
        })
        .join(" ");
      group.append(
        node("path", {
          d,
          fill: "none",
          stroke: "#d8bfff",
          "stroke-width": 1.5,
          "stroke-dasharray": "5 3",
          "vector-effect": "non-scaling-stroke",
          "pointer-events": "none",
          "data-node-preview": "true",
        }),
      );
    }
    let count = 0;
    for (const [pi, path] of overlay.paths.entries())
      for (const [ni, n] of path.nodes.entries()) {
        if (++count > 4000) break;
        const vb = svg.viewBox.baseVal;
        if (
          n.x < vb.x - 30 * unit ||
          n.x > vb.x + vb.width + 30 * unit ||
          n.y < vb.y - 30 * unit ||
          n.y > vb.y + vb.height + 30 * unit
        )
          continue;
        const selected = pi === overlay.pathIndex && ni === overlay.nodeIndex;
        if (selected)
          for (const [kind, dx, dy] of [
            ["in", n.inX, n.inY],
            ["out", n.outX, n.outY],
          ] as const)
            if (dx || dy) {
              group.append(
                node("line", {
                  x1: n.x,
                  y1: n.y,
                  x2: n.x + dx,
                  y2: n.y + dy,
                  stroke: "#c4a3ff",
                  "stroke-width": unit,
                  "pointer-events": "none",
                }),
              );
              group.append(
                node("circle", {
                  cx: n.x + dx,
                  cy: n.y + dy,
                  r: 4 * unit,
                  fill: "#c4a3ff",
                  stroke: "transparent",
                  "stroke-width": 8 * unit,
                  "data-node-handle": kind,
                  "data-handle-path": pi,
                  "data-handle-index": ni,
                  style: "cursor:crosshair",
                }),
              );
            }
        group.append(
          node("circle", {
            cx: n.x,
            cy: n.y,
            r: (selected ? 5 : 3.5) * unit,
            fill: selected ? "#ffffff" : "#111111",
            stroke: "#b28aff",
            "stroke-width": 1.5 * unit,
            "data-node-path": pi,
            "data-node-index": ni,
          }),
        );
      }
    svg.append(group);
  }
  function drawSelection(svg: SVGSVGElement, part: Part, bounds: Bounds) {
    if (overlayRef.current) {
      svg.querySelector("[data-selection]")?.remove();
      return;
    }
    svg.querySelector("[data-selection]")?.remove();
    const f = frame(part, bounds),
      screen = svg.getScreenCTM();
    const unit = screen
      ? 1 / Math.max(Math.hypot(screen.a, screen.b), 0.00001)
      : 1;
    const group = node("g", {
      "data-selection": "true",
      transform: `translate(${f.cx} ${f.cy}) rotate(${f.rotation})`,
      "aria-hidden": "true",
    });
    const gap = 5 * unit,
      w = f.width / 2 + gap,
      h = f.height / 2 + gap;
    group.append(
      node("rect", {
        x: -w,
        y: -h,
        width: 2 * w,
        height: 2 * h,
        rx: 5 * unit,
        fill: "none",
        stroke: "#bca4ff",
        "stroke-width": 1.5 * unit,
        "pointer-events": "none",
      }),
    );
    if (part.locked) {
      svg.append(group);
      return;
    }
    const handle = (name: string, x: number, y: number) => {
      const g = node("g", {
        "data-handle": name,
        class: `canvas-handle handle-${name}`,
        transform: `translate(${x} ${y})`,
      });
      if (name !== "rotate") {
        const angle =
          (((f.rotation + (name === "nw" || name === "se" ? 45 : -45)) % 180) +
            180) %
          180;
        const cursor =
          angle < 22.5 || angle >= 157.5
            ? "ew-resize"
            : angle < 67.5
              ? "nwse-resize"
              : angle < 112.5
                ? "ns-resize"
                : "nesw-resize";
        g.setAttribute("style", "cursor:" + cursor);
      }
      g.append(
        node("circle", {
          r: 22 * unit,
          fill: "transparent",
          "pointer-events": "all",
        }),
      );
      g.append(
        node("circle", {
          r: 5.5 * unit,
          fill: "#fff",
          stroke: "#8061bc",
          "stroke-width": 1.7 * unit,
          class: "handle-ink",
          "pointer-events": "none",
        }),
      );
      group.append(g);
    };
    if (bounds.width > 1e-6 && bounds.height > 1e-6) {
      for (const [name, x, y] of [
        ["nw", -w, -h],
        ["ne", w, -h],
        ["sw", -w, h],
        ["se", w, h],
      ] as [Corner, number, number][])
        handle(name, x, y);
    }
    const top = -h - 40 * unit;
    // Keep the rotation hit target visible without placing it over the selected
    // artwork when zooming near an edge. Prefer above; fall back to a free side.
    const radians = (f.rotation * Math.PI) / 180,
      cos = Math.cos(radians),
      sin = Math.sin(radians);
    const viewport = svg.viewBox.baseVal,
      margin = 24 * unit;
    const clamp = (value: number, start: number, size: number) =>
      Math.min(
        start + size - Math.min(margin, size / 2),
        Math.max(start + Math.min(margin, size / 2), value),
      );
    const worldX = clamp(f.cx - sin * top, viewport.x, viewport.width),
      worldY = clamp(f.cy + cos * top, viewport.y, viewport.height);
    const preferredX = (worldX - f.cx) * cos + (worldY - f.cy) * sin,
      preferredY = -(worldX - f.cx) * sin + (worldY - f.cy) * cos;
    const candidates = [
      {
        x: preferredX,
        y: preferredY,
        ax: 0,
        ay: -h,
        clear: preferredY < -h - 7 * unit,
      },
      { x: w + 40 * unit, y: 0, ax: w, ay: 0, clear: true },
      { x: 0, y: h + 40 * unit, ax: 0, ay: h, clear: true },
      { x: -w - 40 * unit, y: 0, ax: -w, ay: 0, clear: true },
    ];
    const rotation = candidates.find((p) => {
      const x = f.cx + cos * p.x - sin * p.y,
        y = f.cy + sin * p.x + cos * p.y;
      return (
        p.clear &&
        x >= viewport.x + margin &&
        x <= viewport.x + viewport.width - margin &&
        y >= viewport.y + margin &&
        y <= viewport.y + viewport.height - margin
      );
    });
    if (rotation) {
      group.append(
        node("line", {
          x1: rotation.ax,
          y1: rotation.ay,
          x2: rotation.x,
          y2: rotation.y,
          stroke: "#bca4ff",
          "stroke-width": 1.5 * unit,
          "pointer-events": "none",
        }),
      );
      handle("rotate", rotation.x, rotation.y);
    }
    svg.append(group);
  }
  function preview(part: Part, bounds: Bounds) {
    const svg = host.current?.querySelector("svg");
    if (!svg) return;
    const wrapper = findPart(svg, part.id);
    wrapper
      ?.querySelector("[data-translation]")
      ?.setAttribute("transform", `translate(${part.x} ${part.y})`);
    wrapper
      ?.querySelector("[data-adjustment]")
      ?.setAttribute("transform", adjustmentText(part.adjustment));
    drawSelection(svg, part, bounds);
  }
  function drawMultiple(svg: SVGSVGElement, ids: string[]) {
    svg.querySelector("[data-selection]")?.remove();
    const boxes = ids
      .map((id) => findPart(svg, id))
      .filter((p): p is SVGGElement => !!p)
      .map((p) => p.getBBox());
    if (!boxes.length) return;
    const x = Math.min(...boxes.map((b) => b.x)),
      y = Math.min(...boxes.map((b) => b.y)),
      right = Math.max(...boxes.map((b) => b.x + b.width)),
      bottom = Math.max(...boxes.map((b) => b.y + b.height));
    const m = svg.getScreenCTM(),
      unit = m ? 1 / Math.max(Math.hypot(m.a, m.b), 0.00001) : 1,
      gap = 6 * unit;
    const overlay = node("g", {
      "data-selection": "true",
      "data-multiple": "true",
      "aria-hidden": "true",
    });
    overlay.append(
      node("rect", {
        x: x - gap,
        y: y - gap,
        width: right - x + gap * 2,
        height: bottom - y + gap * 2,
        rx: 6 * unit,
        fill: "none",
        stroke: "#bca4ff",
        "stroke-width": 1.7 * unit,
        "stroke-dasharray": `${5 * unit} ${3 * unit}`,
        "pointer-events": "none",
      }),
    );
    svg.append(overlay);
  }
  function previewMultiple(
    parts: Part[],
    dx: number,
    dy: number,
    ids: string[],
  ) {
    const svg = host.current?.querySelector("svg");
    if (!svg) return;
    for (const part of parts)
      findPart(svg, part.id)
        ?.querySelector("[data-translation]")
        ?.setAttribute("transform", `translate(${part.x + dx} ${part.y + dy})`);
    drawMultiple(svg, ids);
  }
  function release(pointer: number) {
    if (host.current?.hasPointerCapture(pointer))
      host.current.releasePointerCapture(pointer);
    host.current?.classList.remove("is-manipulating");
  }
  function cancel() {
    clearSnap();
    clearCut();
    const nd = nodeDrag.current;
    if (nd) {
      nodeDrag.current = null;
      overlayRef.current = nd.original;
      release(nd.pointer);
      const svg = host.current?.querySelector<SVGSVGElement>("svg");
      if (svg) drawNodes(svg);
    }
    const group = multi.current;
    if (group) {
      multi.current = null;
      release(group.pointer);
      previewMultiple(group.parts, 0, 0, group.ids);
    }
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    release(d.pointer);
    preview(d.part, d.bounds);
  }
  useLayoutEffect(() => {
    const h = host.current;
    if (!h) return;
    if (
      drag.current &&
      (drag.current.project !== project || drag.current.id !== selected)
    )
      cancel();
    if (nodeDrag.current && nodeDrag.current.project !== project) cancel();
    if (
      multi.current &&
      (multi.current.project !== project ||
        multi.current.ids.join("|") !== (selection ?? []).join("|"))
    )
      cancel();
    // A camera change cancels in-flight shape edits; it never commits history.
    if (
      zoomRef.current !== zoom ||
      lastCamera.current.x !== pan.x ||
      lastCamera.current.y !== pan.y ||
      lastCamera.current.tool !== tool
    )
      cancel();
    if (zoomRef.current !== zoom || lastCamera.current.tool !== tool)
      endPan(false);
    if (tool !== "pen" || penProject.current !== project) clearPen();
    penProject.current = project;
    lastCamera.current = { x: pan.x, y: pan.y, tool };
    zoomRef.current = zoom;
    const prior = scene.current,
      existing = h.querySelector<SVGSVGElement>("svg"),
      signature = (selection ?? []).join("|");
    if (
      existing &&
      prior?.project === project &&
      prior.options === options &&
      prior.selected === selected &&
      prior.selection === signature &&
      prior.workspace === workspace &&
      prior.inkEdges === inkEdges
    ) {
      cameraInfo.current = { ...cameraInfo.current, workspace, zoom, pan };
      viewport(existing);
      existing.dataset.zoom = String(zoom);
      const current = project.parts.find((p) => p.id === selected);
      if ((selection?.length ?? 0) > 1) drawMultiple(existing, selection!);
      else if (current && boundsRef.current)
        drawSelection(existing, current, boundsRef.current.bounds);
      drawNodes(existing);
      drawPen();
      return;
    }
    scene.current = {
      project,
      options,
      selected,
      selection: signature,
      workspace,
      inkEdges,
    };
    const svg = createLogoSVG(project, options);
    // Editor-only edge aid. Never mutate source paint, geometry or export output.
    if (!project.background || !options.background) {
      for (const p of project.parts) {
        if (p.kind === "image" || !/^#[0-9a-f]{6}$/i.test(p.fill)) continue;
        const channels = [1, 3, 5].map(
          (i) => parseInt(p.fill.slice(i, i + 2), 16) / 255,
        );
        if (
          channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 <
          0.28
        )
          findPart(svg, p.id)?.setAttribute("data-dark-ink", "true");
      }
    }
    const original = svg.viewBox.baseVal;
    const cameraBase = [
      original.x,
      original.y,
      original.width,
      original.height,
    ];
    cameraInfo.current = { base: cameraBase, workspace, zoom, pan };
    h.style.aspectRatio = workspace
      ? "auto"
      : cameraBase[2] + " / " + cameraBase[3];
    h.style.setProperty(
      "--artboard-ratio",
      String(cameraBase[2] / cameraBase[3]),
    );
    svg.dataset.zoom = String(zoom);
    svg.dataset.workspace = String(workspace);
    if (workspace) {
      // Preview-only canvas texture; not part of the saved or exported artwork.
      const defs = svg.querySelector("defs")!;
      const pattern = node("pattern", {
        id: "editor-world-grid",
        "data-grid-pattern": "true",
        patternUnits: "userSpaceOnUse",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      });
      pattern.append(
        node("circle", {
          "data-grid-dot": "true",
          fill: "#ffffff",
          "fill-opacity": 0.18,
        }),
      );
      defs.append(pattern);
      const gridRect = node("rect", {
        "data-workspace-grid": "true",
        fill: "url(#editor-world-grid)",
        "pointer-events": "none",
        "aria-hidden": "true",
      });
      svg.insertBefore(gridRect, defs.nextSibling);
      const [x, y, w, height] = project.viewBox;
      const frame = node("rect", {
        "data-export-frame": "true",
        x,
        y,
        width: w,
        height,
        fill: "none",
        stroke: "#555555",
        "stroke-width": 1,
        "vector-effect": "non-scaling-stroke",
        "pointer-events": "none",
      });
      svg.insertBefore(frame, svg.querySelector("[data-part]"));
      const label = node("text", {
        x,
        y: y - 10,
        fill: "#999999",
        "font-size": 10,
        "pointer-events": "none",
        "data-artboard-name": "true",
      });
      label.textContent = project.name;
      svg.append(label);
    } else if (zoom !== 1)
      svg.append(
        node("rect", {
          "data-export-frame": "true",
          x: cameraBase[0],
          y: cameraBase[1],
          width: cameraBase[2],
          height: cameraBase[3],
          fill: "none",
          stroke: "#aaaaaa",
          "stroke-width": 1.5,
          "vector-effect": "non-scaling-stroke",
          "stroke-dasharray": "6 4",
          "pointer-events": "none",
        }),
      );
    viewport(svg);
    svg.setAttribute("aria-label", "Editable logo canvas");
    h.replaceChildren(svg);
    // Screen-space label sizing requires a connected SVG and its real CTM.
    viewport(svg);
    drawNodes(svg);
    drawPen();
    if ((selection?.length ?? 0) > 1) {
      boundsRef.current = null;
      onBounds?.(null);
      if (multi.current)
        previewMultiple(
          multi.current.parts,
          multi.current.dx,
          multi.current.dy,
          multi.current.ids,
        );
      else drawMultiple(svg, selection!);
      return;
    }
    const p = project.parts.find((a) => a.id === selected);
    const base =
      p && findPart(svg, p.id)?.querySelector<SVGGElement>("[data-geometry]");
    if (p && base) {
      const b = base.getBBox();
      const bounds = { x: b.x, y: b.y, width: b.width, height: b.height };
      boundsRef.current = { id: p.id, bounds };
      onBounds?.({ id: p.id, bounds });
      preview(drag.current?.latest ?? p, bounds);
    } else {
      boundsRef.current = null;
      onBounds?.(null);
    }
  }, [
    project,
    selected,
    options,
    onBounds,
    selection,
    zoom,
    pan.x,
    pan.y,
    tool,
    workspace,
    grid,
    nodeOverlay,
  ]);
  useLayoutEffect(() => {
    const h = host.current;
    if (!h) return;
    const refreshTextBounds = () => {
      const svg = h.querySelector<SVGSVGElement>("svg");
      const part = project.parts.find(
        (p) => p.id === selected && p.kind === "text",
      );
      const base =
        svg &&
        part &&
        findPart(svg, part.id)?.querySelector<SVGGElement>("[data-geometry]");
      if (!svg || !part || !base) return;
      const b = base.getBBox();
      const bounds = { x: b.x, y: b.y, width: b.width, height: b.height };
      boundsRef.current = { id: part.id, bounds };
      drawSelection(svg, part, bounds);
    };
    h.addEventListener("logo-text-preview", refreshTextBounds);
    return () => h.removeEventListener("logo-text-preview", refreshTextBounds);
  }, [project, selected]);
  useLayoutEffect(() => {
    const h = host.current;
    if (!h) return;
    const observer = new ResizeObserver(() => {
      const value = boundsRef.current,
        svg = h.querySelector("svg");
      if (!svg) return;
      viewport(svg);
      drawNodes(svg);
      drawPen();
      if ((selectionRef.current?.length ?? 0) > 1) {
        drawMultiple(svg, selectionRef.current!);
        return;
      }
      if (!value) return;
      const p =
        drag.current?.latest ?? project.parts.find((a) => a.id === value.id);
      if (p) drawSelection(svg, p, value.bounds);
    });
    observer.observe(h);
    return () => observer.disconnect();
  }, [project]);
  useLayoutEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        toolRef.current === "pen" &&
        !document.querySelector("dialog[open]") &&
        !(e.target as HTMLElement).closest(
          "input,textarea,select,button,a,[contenteditable=true]",
        )
      ) {
        if (
          (e.key === "Backspace" || e.key === "Delete") &&
          penPoints.current.length &&
          !penDrag.current
        ) {
          e.preventDefault();
          penPoints.current.pop();
          penHover.current = null;
          drawPen();
          return;
        }
        if (e.key === "Escape" && penPoints.current.length) {
          e.preventDefault();
          clearPen();
        }
        if (e.key === "Enter" && penPoints.current.length >= 2) {
          e.preventDefault();
          finishPen(false);
        }
      }
      if (e.key === "Escape") {
        const hadGesture = !!(
          cameraDrag.current ||
          drag.current ||
          multi.current ||
          cutDrag.current ||
          nodeDrag.current
        );
        if (
          !hadGesture &&
          overlayRef.current &&
          toolRef.current === "select" &&
          document.activeElement === host.current
        ) {
          e.preventDefault();
          exitNodesRef.current?.();
        }
        if (cameraDrag.current) {
          e.preventDefault();
          endPan();
        }
        if (
          drag.current ||
          multi.current ||
          cutDrag.current ||
          nodeDrag.current
        ) {
          e.preventDefault();
          cancel();
        }
      }
      const target = e.target as HTMLElement;
      if (
        target.closest("input,textarea,select,button,a,[contenteditable=true]")
      )
        return;
      if (
        e.code === "Space" &&
        (host.current?.matches(":hover") ||
          document.activeElement === host.current)
      ) {
        e.preventDefault();
        space.current = true;
        host.current?.setAttribute("data-space", "true");
      }
      if (
        document.activeElement === host.current &&
        toolRef.current === "hand" &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 50 : 10;
        cameraCallback.current?.(
          panBy(
            panRef.current,
            e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0,
            e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0,
          ),
        );
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        space.current = false;
        host.current?.removeAttribute("data-space");
      }
    };
    const blur = () => {
      space.current = false;
      host.current?.removeAttribute("data-space");
      cancel();
      endPan();
      if (penDrag.current) clearPen();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);
  useLayoutEffect(() => {
    const h = host.current;
    if (!h) return;
    const wheel = (e: WheelEvent) => {
      if (!cameraInfo.current.workspace || !cameraChange.current) return;
      if (
        window.matchMedia("(pointer: coarse)").matches &&
        !e.ctrlKey &&
        !e.metaKey
      )
        return;
      e.preventDefault();
      cancel();
      endPan(false);
      const svg = h.querySelector("svg"),
        m = svg?.getScreenCTM();
      if (!svg || !m) return;
      const c = cameraInfo.current,
        unit = 1 / Math.max(Math.hypot(m.a, m.b), 1e-8),
        factor =
          e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? h.clientHeight : 1;
      if (e.ctrlKey || e.metaKey) {
        const next = Math.max(
          MIN_ZOOM,
          Math.min(
            MAX_ZOOM,
            Number((c.zoom * Math.exp(-e.deltaY * factor * 0.002)).toFixed(4)),
          ),
        );
        const anchor = new DOMPoint(e.clientX, e.clientY).matrixTransform(
            m.inverse(),
          ),
          vb = svg.viewBox.baseVal;
        cameraChange.current(
          next,
          anchoredPan(
            c.pan,
            anchor,
            { x: vb.x + vb.width / 2, y: vb.y + vb.height / 2 },
            c.zoom,
            next,
          ),
        );
      } else
        cameraChange.current(
          c.zoom,
          panBy(c.pan, e.deltaX * factor * unit, e.deltaY * factor * unit),
        );
    };
    h.addEventListener("wheel", wheel, { passive: false });
    return () => h.removeEventListener("wheel", wheel);
  }, []);
  const point = (e: { clientX: number; clientY: number }): Point | null => {
    const matrix = host.current?.querySelector("svg")?.getScreenCTM();
    if (!matrix) return null;
    return new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
  };
  function down(e: ReactPointerEvent<HTMLDivElement>) {
    if (
      drag.current ||
      multi.current ||
      cameraDrag.current ||
      cutDrag.current ||
      nodeDrag.current
    )
      return;
    if (
      e.button === 1 ||
      (e.button === 0 && (tool === "hand" || space.current))
    ) {
      const svg = host.current?.querySelector("svg"),
        m = svg?.getScreenCTM();
      if (!m) return;
      e.preventDefault();
      host.current?.focus({ preventScroll: true });
      host.current?.setPointerCapture(e.pointerId);
      host.current?.classList.add("is-panning");
      cameraDrag.current = {
        pointer: e.pointerId,
        start: { x: e.clientX, y: e.clientY },
        origin: { ...pan },
        unit: 1 / Math.max(Math.hypot(m.a, m.b), 0.00001),
      };
      return;
    }
    if (e.button !== 0) return;
    if (tool === "scissors") {
      const pos = point(e),
        matrix = host.current?.querySelector("svg")?.getScreenCTM();
      if (!pos || !matrix) return;
      const clicked = (e.target as Element).closest<SVGGElement>("[data-part]")
        ?.dataset.part;
      const id = clicked ?? selected;
      if (clicked && clicked !== selected) onSelect(clicked);
      e.preventDefault();
      host.current?.focus({ preventScroll: true });
      host.current?.setPointerCapture(e.pointerId);
      cutDrag.current = {
        pointer: e.pointerId,
        id,
        start: pos,
        end: pos,
        clientX: e.clientX,
        clientY: e.clientY,
        unit: 1 / Math.max(Math.hypot(matrix.a, matrix.b), 1e-8),
        project,
      };
      return;
    }
    if (tool === "pen") {
      const pos = point(e),
        svg = host.current?.querySelector("svg"),
        matrix = svg?.getScreenCTM();
      if (
        !pos ||
        !matrix ||
        !Number.isFinite(pos.x) ||
        !Number.isFinite(pos.y) ||
        Math.abs(pos.x) > 1e6 ||
        Math.abs(pos.y) > 1e6
      )
        return;
      e.preventDefault();
      host.current?.focus({ preventScroll: true });
      const pts = penPoints.current,
        first = pts[0];
      if (
        pts.length >= 3 &&
        Math.hypot(pos.x - first.x, pos.y - first.y) *
          Math.hypot(matrix.a, matrix.b) <=
          10
      ) {
        finishPen(true);
        return;
      }
      if (pts.length >= 200) return;
      if (
        pts.length &&
        Math.hypot(
          pos.x - pts[pts.length - 1].x,
          pos.y - pts[pts.length - 1].y,
        ) *
          Math.hypot(matrix.a, matrix.b) <
          2
      )
        return;
      pts.push({ x: pos.x, y: pos.y });
      penDrag.current = {
        pointer: e.pointerId,
        index: pts.length - 1,
        startX: e.clientX,
        startY: e.clientY,
      };
      host.current?.setPointerCapture(e.pointerId);
      penHover.current = null;
      drawPen();
      return;
    }
    const anchor = (e.target as Element).closest<SVGElement>(
      "[data-node-handle], [data-node-index]",
    );
    if (anchor) {
      e.preventDefault();
      const path = Number(anchor.dataset.handlePath ?? anchor.dataset.nodePath),
        index = Number(anchor.dataset.handleIndex ?? anchor.dataset.nodeIndex),
        overlay = overlayRef.current;
      if (!overlay) return;
      const selectedOverlay = { ...overlay, pathIndex: path, nodeIndex: index };
      if (path !== overlay.pathIndex || index !== overlay.nodeIndex) {
        overlayRef.current = selectedOverlay;
        onNodePick?.(path, index);
      }
      const start = point(e);
      if (!start) return;
      host.current?.focus({ preventScroll: true });
      host.current?.setPointerCapture(e.pointerId);
      host.current?.classList.add("is-manipulating");
      nodeDrag.current = {
        pointer: e.pointerId,
        path,
        index,
        kind:
          (anchor.dataset.nodeHandle as "in" | "out" | undefined) ??
          (e.altKey ? (e.shiftKey ? "new-in" : "new-out") : "anchor"),
        original: selectedOverlay,
        value: structuredClone(selectedOverlay),
        start,
        moved: false,
        project,
      };
      return;
    }
    if (overlayRef.current) return;
    const handle = (e.target as Element).closest<SVGGElement>("[data-handle]");
    const target = (e.target as Element).closest<SVGGElement>("[data-part]");
    const id = handle ? selected : (target?.dataset.part ?? null);
    const additive = !handle && (e.shiftKey || e.ctrlKey || e.metaKey);
    const ids = pickRef.current
      ? pickRef.current(id, additive)
      : (onSelect(id), id ? [id] : []);
    if (additive) return;
    const candidates = project.parts.filter((p) => ids.includes(p.id));
    if (!editable(candidates)) return;
    if (ids.length > 1) {
      const start = point(e);
      if (!start) return;
      e.preventDefault();
      host.current?.setPointerCapture(e.pointerId);
      host.current?.classList.add("is-manipulating");
      const svg = host.current?.querySelector<SVGSVGElement>("svg");
      if (svg) beginSnap(ids, svg);
      multi.current = {
        project,
        ids,
        parts: candidates,
        start,
        pointer: e.pointerId,
        dx: 0,
        dy: 0,
      };
      return;
    }
    const p = project.parts.find((a) => a.id === id),
      start = point(e),
      svg = host.current?.querySelector("svg");
    if (!p || !start || !svg) return;
    const base = findPart(svg, p.id)?.querySelector<SVGGElement>(
      "[data-geometry]",
    );
    if (!base) return;
    const b = base.getBBox(),
      bounds = { x: b.x, y: b.y, width: b.width, height: b.height },
      f = frame(p, bounds);
    e.preventDefault();
    host.current?.setPointerCapture(e.pointerId);
    host.current?.classList.add("is-manipulating");
    if (!handle || handle.dataset.handle !== "rotate") beginSnap(ids, svg);
    drag.current = {
      id: p.id,
      part: p,
      bounds,
      project,
      start,
      pointer: e.pointerId,
      mode: (handle?.dataset.handle ?? "move") as Gesture["mode"],
      latest: p,
      locked: keepProportions,
      lastAngle: (Math.atan2(start.y - f.cy, start.x - f.cx) * 180) / Math.PI,
      rotation: f.rotation,
    };
    drawSelection(svg, p, bounds);
  }
  function move(e: ReactPointerEvent) {
    const nd = nodeDrag.current;
    if (nd && nd.pointer === e.pointerId) {
      const p = point(e),
        n = nd.value.paths[nd.path]?.nodes[nd.index],
        orig = nd.original.paths[nd.path]?.nodes[nd.index];
      if (!p || !n || !orig) return;
      const dx = p.x - nd.start.x,
        dy = p.y - nd.start.y;
      if (![dx, dy].every((v) => Number.isFinite(v) && Math.abs(v) <= 1e6))
        return;
      nd.moved = nd.moved || Math.hypot(dx, dy) > 1e-6;
      if (nd.kind === "anchor") {
        n.x = orig.x + (e.shiftKey && Math.abs(dy) > Math.abs(dx) ? 0 : dx);
        n.y = orig.y + (e.shiftKey && Math.abs(dx) >= Math.abs(dy) ? 0 : dy);
      } else if (nd.kind === "new-in") {
        n.inX = dx;
        n.inY = dy;
      } else if (nd.kind === "new-out") {
        n.outX = dx;
        n.outY = dy;
      } else if (nd.kind === "in") {
        n.inX = orig.inX + dx;
        n.inY = orig.inY + dy;
      } else {
        n.outX = orig.outX + dx;
        n.outY = orig.outY + dy;
      }
      overlayRef.current = nd.value;
      const svg = host.current?.querySelector<SVGSVGElement>("svg");
      if (svg) drawNodes(svg);
      return;
    }
    const cd = cutDrag.current;
    if (cd && cd.pointer === e.pointerId) {
      const pos = point(e);
      if (pos) cd.end = pos;
      drawCut();
      return;
    }
    const pd = penDrag.current;
    if (pd && pd.pointer === e.pointerId) {
      const p = point(e),
        anchor = penPoints.current[pd.index];
      if (
        p &&
        anchor &&
        Math.hypot(e.clientX - pd.startX, e.clientY - pd.startY) < 3
      ) {
        anchor.handleX = 0;
        anchor.handleY = 0;
      }
      if (
        p &&
        anchor &&
        Math.hypot(e.clientX - pd.startX, e.clientY - pd.startY) >= 3
      ) {
        const dx = p.x - anchor.x,
          dy = p.y - anchor.y;
        if (
          Number.isFinite(dx) &&
          Number.isFinite(dy) &&
          Math.abs(dx) <= 1e6 &&
          Math.abs(dy) <= 1e6
        ) {
          anchor.handleX = dx;
          anchor.handleY = dy;
        }
      }
      penHover.current = null;
      drawPen();
      return;
    }
    if (tool === "pen" && penPoints.current.length && !cameraDrag.current) {
      penHover.current = point(e);
      drawPen();
    }
    const camera = cameraDrag.current;
    if (camera && camera.pointer === e.pointerId) {
      e.preventDefault();
      cameraCallback.current?.(
        panBy(
          camera.origin,
          -(e.clientX - camera.start.x) * camera.unit,
          -(e.clientY - camera.start.y) * camera.unit,
        ),
      );
      return;
    }
    const group = multi.current;
    if (group && group.pointer === e.pointerId) {
      const pos = point(e);
      if (!pos) return;
      const target = snapped(
        pos.x - group.start.x,
        pos.y - group.start.y,
        e.altKey,
      );
      const delta = clampMovement(group.parts, target.dx, target.dy);
      group.dx = delta.dx;
      group.dy = delta.dy;
      previewMultiple(group.parts, group.dx, group.dy, group.ids);
      drawSnap(target);
      return;
    }
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    const pos = point(e);
    if (!pos) return;
    const delta = { x: pos.x - d.start.x, y: pos.y - d.start.y };
    let next: Part;
    let target: SnapResult | null = null;
    if (d.mode === "move") {
      target = snapped(delta.x, delta.y, e.altKey);
      const safe = clampMovement([d.part], target.dx, target.dy);
      next = { ...d.part, x: d.part.x + safe.dx, y: d.part.y + safe.dy };
    } else if (d.mode === "rotate") {
      const f = frame(d.part, d.bounds),
        angle = (Math.atan2(pos.y - f.cy, pos.x - f.cx) * 180) / Math.PI;
      d.rotation += normalizeAngle(angle - d.lastAngle);
      d.lastAngle = angle;
      const degrees = e.shiftKey
        ? Math.round(d.rotation / 15) * 15
        : d.rotation;
      next = rotatedPart(d.part, d.bounds, degrees);
    } else {
      const locked = e.shiftKey ? !d.locked : d.locked;
      if (
        snapState.current &&
        !e.altKey &&
        Math.hypot(delta.x, delta.y) >= 2 * snapState.current.unit
      ) {
        const r = snapResize(
          d.part,
          d.bounds,
          d.mode,
          delta,
          locked,
          snapState.current.targets,
          6 * snapState.current.unit,
        );
        next = r.part;
        target = { dx: 0, dy: 0, xGuide: r.xGuide, yGuide: r.yGuide };
      } else {
        next = cornerResize(d.part, d.bounds, d.mode, delta, locked);
        target = { dx: 0, dy: 0, xGuide: null, yGuide: null };
      }
    }
    d.latest = next;
    preview(next, d.bounds);
    if (target) drawSnap(target);
  }
  function finish(e: ReactPointerEvent, canceled = false) {
    const nd = nodeDrag.current;
    if (nd && nd.pointer === e.pointerId) {
      nodeDrag.current = null;
      release(nd.pointer);
      overlayRef.current = nd.original;
      const svg = host.current?.querySelector<SVGSVGElement>("svg");
      if (svg) drawNodes(svg);
      if (!canceled && nd.moved && nd.project === project)
        document.dispatchEvent(
          new CustomEvent("logo-node-commit", {
            detail: {
              path: nd.path,
              node: nd.index,
              value: nd.value.paths[nd.path].nodes[nd.index],
            },
          }),
        );
      return;
    }
    const cd = cutDrag.current;
    if (cd && cd.pointer === e.pointerId) {
      const end = point(e) ?? cd.end;
      const isDrag =
        Math.hypot(e.clientX - cd.clientX, e.clientY - cd.clientY) >= 8;
      clearCut();
      if (!canceled && cd.project === project)
        onCut?.(cd.id, cd.start, 10 * cd.unit, isDrag ? end : undefined);
      return;
    }
    if (
      multi.current?.pointer === e.pointerId ||
      drag.current?.pointer === e.pointerId
    )
      clearSnap();
    if (penDrag.current?.pointer === e.pointerId) {
      penDrag.current = null;
      if (host.current?.hasPointerCapture(e.pointerId))
        host.current.releasePointerCapture(e.pointerId);
      if (canceled) clearPen();
      else drawPen();
      return;
    }
    if (cameraDrag.current?.pointer === e.pointerId) {
      endPan(canceled);
      return;
    }
    const group = multi.current;
    if (group && group.pointer === e.pointerId) {
      if (canceled) {
        cancel();
        return;
      }
      multi.current = null;
      release(e.pointerId);
      if (manyRef.current?.(group.ids, group.dx, group.dy) === false)
        previewMultiple(group.parts, 0, 0, group.ids);
      return;
    }
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    if (canceled) {
      cancel();
      return;
    }
    drag.current = null;
    release(e.pointerId);
    if (d.mode === "move")
      callbacks.current.onMove(d.id, d.latest.x, d.latest.y);
    else {
      const accepted = callbacks.current.onTransform?.(d.id, {
        x: d.latest.x,
        y: d.latest.y,
        adjustment: d.latest.adjustment,
      });
      if (accepted === false) preview(d.part, d.bounds);
    }
  }
  return (
    <div
      className="canvas-host checker"
      data-ink-edges={inkEdges}
      data-workspace={workspace}
      data-tool={tool}
      tabIndex={0}
      aria-label="Canvas interaction surface"
      ref={host}
      onDragOver={(e) => {
        if (
          e.dataTransfer.types.includes(ASSET_DRAG_TYPE) ||
          e.dataTransfer.types.includes("Files")
        ) {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "copy";
          host.current?.classList.add("is-asset-target");
        }
      }}
      onDragLeave={(e) => {
        if (!host.current?.contains(e.relatedTarget as Node | null))
          host.current?.classList.remove("is-asset-target");
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        host.current?.classList.remove("is-asset-target");
        cancel();
        const pos = point(e);
        if (!pos) return;
        const files = Array.from(e.dataTransfer.files);
        if (files.length) {
          onDropFiles?.(files, pos);
          return;
        }
        const id = e.dataTransfer.getData(ASSET_DRAG_TYPE);
        if (id) onDropAsset?.(id, pos);
      }}
      onDoubleClick={(e) => {
        if (tool !== "select") return;
        const hit =
          document.elementFromPoint(e.clientX, e.clientY) ??
          (e.target as Element);
        if (!overlayRef.current) {
          const id = hit.closest<SVGGElement>("[data-part]")?.dataset.part;
          if (
            id &&
            project.parts.some(
              (p) => p.id === id && p.kind === "text" && !p.hidden && !p.locked,
            )
          ) {
            e.preventDefault();
            onEditText?.(id);
          }
          return;
        }
        if (hit.closest("[data-node-index], [data-node-handle]")) return;
        const target = hit.closest<SVGGElement>("[data-part]");
        if (target?.dataset.part !== selected) return;
        const p = point(e),
          m = host.current?.querySelector("svg")?.getScreenCTM();
        if (!p || !m) return;
        e.preventDefault();
        document.dispatchEvent(
          new CustomEvent("logo-node-insert", {
            detail: {
              x: p.x,
              y: p.y,
              tolerance: 10 / Math.max(Math.hypot(m.a, m.b), 1e-8),
            },
          }),
        );
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={(e) => finish(e)}
      onPointerCancel={(e) => finish(e, true)}
      onLostPointerCapture={() => {
        if (penDrag.current) clearPen();
        cancel();
        endPan();
      }}
    />
  );
}
