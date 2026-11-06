import CanvasContextMenu from "./render/CanvasContextMenu";
import { addText } from "./model/text";
import TextControls from "./render/TextControls";
import { geometryJob } from "./geometry/client";
import { geometryParts, cutParts } from "./geometry/document";
import { addPenPath } from "./model/pen";
import GeometryControls, { type NodeOverlay } from "./render/GeometryControls";
import { replacePaths } from "./geometry/document";
import InsertMenu from "./render/InsertMenu";
import CommandPanel from "./render/CommandPanel";
import AppearanceControls from "./render/AppearanceControls";
import { applyCommandRequest, type ShapeKind } from "./commands/document";
import { MIN_ZOOM, MAX_ZOOM } from "./model/viewport";
import { measurePartBounds as workspaceBounds } from "./render/measurePartBounds";
import FinishControls from "./render/FinishControls";
import AlignmentControls from "./render/AlignmentControls";
import { arrange, type LayoutAction, type LayoutTarget } from "./model/layout";
import { measurePartBounds } from "./render/measurePartBounds";
import QuickGuide from "./render/QuickGuide";
import StudioMenu from "./render/StudioMenu";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { demoProject } from "./demo/logo";
import CanvasControls from "./render/CanvasControls";
import AssetsPanel from "./assets/AssetsPanel";
import { readAssets } from "./assets/readAssets";
import {
  appendAssets,
  placeAsset,
  removeAsset,
  vectorAsset,
} from "./model/assets";
import type { Point } from "./model/transform";
import {
  changePart,
  validateProject,
  type Part,
  type Project,
  type Shadow,
} from "./model/project";
import { history, commit, undo, redo, type History } from "./model/history";
import { importSVG } from "./import/svg";
import {
  download,
  filename,
  pngBlob,
  svgText,
  type RenderOptions,
} from "./export/logo";
import { readProject } from "./storage/project";
import { loadLocal, saveLocal } from "./storage/database";
import "./tracing/trace.css";
import TracePanel from "./tracing/TracePanel";
import { prepareRaster } from "./tracing/raster";
import type { RasterImage } from "./tracing/types";
import LogoCanvas from "./render/LogoCanvas";
import TransformControls from "./render/TransformControls";
import type { Bounds } from "./model/transform";
import PartsList from "./render/PartsList";
import OrganizationControls from "./render/OrganizationControls";
import {
  editable,
  moveParts,
  organize,
  pickIds,
  selectedParts,
  type OrganizationAction,
} from "./model/organization";
function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    upload: (
      <>
        <path d="M12 16V4m-4 4 4-4 4 4M4 15v5h16v-5" />
      </>
    ),
    save: (
      <>
        <path d="M5 3h12l4 4v14H3V3h2Zm2 0v7h10V3M7 21v-7h10v7" />
      </>
    ),
    undo: (
      <>
        <path d="m9 5-5 5 5 5M4 10h9a6 6 0 0 1 6 6v2" />
      </>
    ),
    redo: (
      <>
        <path d="m15 5 5 5-5 5m5-5h-9a6 6 0 0 0-6 6v2" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" />
      </>
    ),
    parts: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    cursor: <path d="m5 3 15 10-8 1-3 7Z" />,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.parts}
    </svg>
  );
}
function colorValue(s: string) {
  return /^#[\da-f]{6}$/i.test(s) ? s : "#2765ce";
}
export default function App() {
  const [snap, setSnap] = useState(false);
  const [inkEdges, setInkEdges] = useState(true);
  const [workspace, setWorkspace] = useState(true);
  const [nodeOverlay, setNodeOverlay] = useState<NodeOverlay | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    ids: string[];
  } | null>(null);
  const [leftOpen, setLeftOpen] = useState(true),
    [rightOpen, setRightOpen] = useState(true);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const revisionRef = useRef({ project: null as Project | null, revision: 0 });
  const [start] = useState(() => ({ project: demoProject(), warning: "" }));
  const [loading, setLoading] = useState(true);
  const [decoding, setDecoding] = useState(false);
  const [traceImage, setTraceImage] = useState<RasterImage | null>(null);
  const importVersion = useRef(0);
  const [state, setState] = useState<History>(() => history(start.project));
  const historyRef = useRef(state);
  historyRef.current = state;
  const [selection, setSelection] = useState<string[]>(
    start.project.parts[0] ? [start.project.parts[0].id] : [],
  );
  function setSelected(id: string | null) {
    setSelection(id ? [id] : []);
  }
  const [message, setMessage] = useState(start.warning);
  const [error, setError] = useState(!!start.warning);
  const [autosave, setAutosave] = useState(
    start.warning ? "Autosave paused" : "Saved on this device",
  );
  const [savePaused, setSavePaused] = useState(!!start.warning);
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<RenderOptions>({
    effects: true,
    background: true,
  });
  const file = useRef<HTMLInputElement>(null),
    open = useRef<HTMLInputElement>(null);
  const [selectionBounds, setSelectionBounds] = useState<{
    id: string;
    bounds: Bounds;
  } | null>(null);
  const [keepProportions, setKeepProportions] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [grid, setGrid] = useState(true);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [tool, setTool] = useState<"select" | "hand" | "pen" | "scissors">(
    "select",
  );
  const project = state.present;
  const projectRef = useRef(project);
  projectRef.current = project;
  const documentGeneration = useRef(0),
    assetUploadVersion = useRef(0);
  const [libraryTab, setLibraryTab] = useState<"assets" | "parts">("parts");
  const [assetBusy, setAssetBusy] = useState(false);
  const [traceTarget, setTraceTarget] = useState<string | null>(null);
  const assetInput = useRef<HTMLInputElement>(null);
  const selectionIds = useMemo(
    () =>
      project.parts.filter((p) => selection.includes(p.id)).map((p) => p.id),
    [project, selection],
  );
  const selected = selectionIds.length === 1 ? selectionIds[0] : null;
  const cutContext = useRef({ selected, tool });
  cutContext.current = { selected, tool };
  const part = project.parts.find((p) => p.id === selected);
  function pick(id: string | null, additive = false, canvas = false): string[] {
    const next =
      canvas && !additive && id && selectionIds.includes(id)
        ? selectionIds
        : pickIds(project, selectionIds, id, additive);
    setSelection(next);
    return next;
  }
  function organization(action: OrganizationAction, ids = selectionIds) {
    try {
      const result = organize(projectRef.current, ids, action);
      update(result.project);
      setSelection(result.ids);
      notify(
        {
          group: "Grouped selected parts.",
          ungroup: "Ungrouped. The shapes stay separate.",
          duplicate: "Duplicated selection. The new copy is selected.",
          delete: "Deleted selection. Undo can bring it back.",
          hide: "Selection hidden, including in exports.",
          show: "Selection shown.",
          lock: "Selection locked against edits.",
          unlock: "Selection unlocked.",
          forward: "Moved selection forward.",
          backward: "Moved selection backward.",
          front: "Moved selection to the front.",
          back: "Moved selection to the back.",
        }[action],
      );
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Could not organize these parts.",
        true,
      );
    }
  }
  function moveSelection(ids: string[], dx: number, dy: number): boolean {
    try {
      update(moveParts(project, ids, dx, dy));
      return true;
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Could not move this selection.",
        true,
      );
      return false;
    }
  }

  function notify(text: string, bad = false) {
    setMessage(text);
    setError(bad);
  }
  function update(next: Project) {
    const nextHistory = commit(historyRef.current, validateProject(next));
    historyRef.current = nextHistory;
    projectRef.current = nextHistory.present;
    setState(nextHistory);
  }
  function arrangeSelection(action: LayoutAction, target: LayoutTarget) {
    try {
      update(
        arrange(
          project,
          selectionIds,
          measurePartBounds(project),
          action,
          target,
        ),
      );
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Could not arrange selection.",
        true,
      );
    }
  }
  function snapshot() {
    const current = projectRef.current;
    if (revisionRef.current.project !== current) {
      revisionRef.current = {
        project: current,
        revision: revisionRef.current.revision + 1,
      };
    }
    return { project: current, revision: revisionRef.current.revision };
  }
  function applyCommands(raw: unknown) {
    const current = snapshot(),
      result = applyCommandRequest(current.project, raw, current.revision);
    update(result.project);
    setSelection(result.ids);
    snapshot();
    notify("Command batch applied. Undo restores the whole batch.");
  }
  const cutController = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      cutController.current?.abort();
      cutController.current = null;
    },
    [tool],
  );
  async function cutLine(
    id: string | null,
    point: Point,
    tolerance: number,
    end?: Point,
  ) {
    if (cutController.current) return;
    if (!id) {
      notify("Select a shape or line before using scissors.", true);
      return;
    }
    const before = projectRef.current,
      abort = new AbortController();
    try {
      const parts = geometryParts(before, [id]);
      const p = parts[0];
      if (
        p.groupId ||
        (end
          ? p.fill === "none"
          : p.fill !== "none" || p.stroke === "none" || p.strokeWidth <= 0) ||
        p.shadow.enabled ||
        (p.finish && (p.finish.grain > 0 || p.finish.depth > 0))
      )
        throw Error(
          end
            ? "To cut a shape, use one visible, unlocked, ungrouped filled shape without effects."
            : "To cut a line, select one visible, unlocked, ungrouped open line without fill or effects.",
        );
      cutController.current = abort;
      const result = await geometryJob(
        end
          ? {
              type: "slice",
              parts,
              x: point.x,
              y: point.y,
              x2: end.x,
              y2: end.y,
            }
          : { type: "cut", parts, x: point.x, y: point.y, tolerance },
        abort.signal,
      );
      if (abort.signal.aborted) return;
      if (projectRef.current !== before)
        throw Error("The design changed while cutting. Try again.");
      if (
        cutContext.current.selected !== id ||
        cutContext.current.tool !== "scissors"
      )
        throw Error("Selection changed while cutting. Try again.");
      if (!result.cutPaths) throw Error("Could not cut this line.");
      const next = cutParts(
        before,
        id,
        result.cutPaths,
        end ? "shape" : "line",
      );
      update(next.project);
      setSelection(next.ids);
      setTool("select");
      notify("Cut into two pieces. Undo restores the original.");
    } catch (e) {
      if (!abort.signal.aborted)
        notify(
          e instanceof Error ? e.message : "Could not cut this line.",
          true,
        );
    } finally {
      if (cutController.current === abort) cutController.current = null;
    }
  }
  function createText() {
    try {
      const vb =
        document.querySelector<SVGSVGElement>(".canvas-host > svg")?.viewBox
          .baseVal;
      const [x, y, w, h] = projectRef.current.viewBox;
      const size = Math.max(12, Math.min(64, Math.min(w, h) * 0.1));
      const result = addText(
        projectRef.current,
        {
          x: (vb ? vb.x + vb.width / 2 : x + w / 2) - size * 2,
          y: (vb ? vb.y + vb.height / 2 : y + h / 2) + size / 3,
        },
        size,
      );
      update(result.project);
      setSelection([result.id]);
      setTool("select");
      setLibraryTab("parts");
      setRightOpen(true);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not add text.", true);
    }
  }
  function createShape(shape: ShapeKind) {
    try {
      const current = snapshot(),
        vb =
          document.querySelector<SVGSVGElement>(".canvas-host > svg")?.viewBox
            .baseVal,
        [x, y, w, h] = project.viewBox;
      const width = shape === "line" ? 120 : 100,
        height = shape === "line" ? 60 : 100;
      applyCommands({
        version: 1,
        expectedRevision: current.revision,
        commands: [
          {
            type: "create",
            shape,
            x: (vb ? vb.x + vb.width / 2 : x + w / 2) - width / 2,
            y: (vb ? vb.y + vb.height / 2 : y + h / 2) - height / 2,
            width,
            height,
          },
        ],
      });
      setTool("select");
      setLibraryTab("parts");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not create shape.", true);
    }
  }
  function fitArtwork(onlySelection = false) {
    try {
      const bounds = workspaceBounds(project);
      const boxes = [...bounds.entries()]
        .filter(([id]) => !onlySelection || selectionIds.includes(id))
        .map(([, box]) => box);
      if (!boxes.length) {
        if (onlySelection) {
          notify("Select visible artwork to fit it in view.", true);
          return;
        }
        setZoom(1);
        setPan({ x: 0, y: 0 });
        return;
      }
      const left = Math.min(...boxes.map((b) => b.x)),
        top = Math.min(...boxes.map((b) => b.y)),
        right = Math.max(...boxes.map((b) => b.x + b.width)),
        bottom = Math.max(...boxes.map((b) => b.y + b.height));
      const [x, y, w, h] = project.viewBox;
      setPan({
        x: Math.max(-1e6, Math.min(1e6, (left + right) / 2 - (x + w / 2))),
        y: Math.max(-1e6, Math.min(1e6, (top + bottom) / 2 - (y + h / 2))),
      });
      setZoom(
        Math.max(
          MIN_ZOOM,
          Math.min(
            MAX_ZOOM,
            Math.min(
              w / Math.max(1, right - left),
              h / Math.max(1, bottom - top),
            ) * 0.85,
          ),
        ),
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not fit artwork.", true);
    }
  }
  function newDocument() {
    if (canReplace()) {
      ++importVersion.current;
      setDecoding(false);
      replace({
        schemaVersion: 1,
        name: "Untitled logo",
        source: { name: "Created in Contour Grove", text: "" },
        viewBox: [0, 0, 1024, 768],
        background: null,
        parts: [],
      });
      setWorkspace(true);
      notify("A blank workspace. Create a shape or bring in a reference.");
    }
  }
  function edit(edit: Partial<Part>) {
    if (!part) return;
    if (!editable([part])) {
      notify("Show and unlock this part before editing it.", true);
      return;
    }
    try {
      update(changePart(project, part.id, edit));
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Invalid appearance change.",
        true,
      );
    }
  }
  function shadow(editing: Partial<Shadow>) {
    if (part) edit({ shadow: { ...part.shadow, ...editing } });
  }
  function replace(p: Project) {
    documentGeneration.current++;
    projectRef.current = p;
    setLibraryTab(p.assets?.length ? "assets" : "parts");
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setState(history(p));
    setSelected(p.parts[0]?.id ?? null);
    setSavePaused(false);
  }
  useEffect(() => {
    let active = true;
    void loadLocal()
      .then((saved) => {
        if (active && saved) {
          projectRef.current = saved;
          setLibraryTab(saved.assets?.length ? "assets" : "parts");
          setState(history(saved));
          setSelected(saved.parts[0]?.id ?? null);
        }
      })
      .catch(() => {
        if (active) {
          setSavePaused(true);
          setAutosave("Autosave paused");
          notify(
            "Your saved project could not be opened. Its stored copy has not been overwritten. Open a backup or start the demo.",
            true,
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (savePaused || loading) return;
    let active = true;
    setAutosave("Saving on this device…");
    const timer = setTimeout(() => {
      void saveLocal(project)
        .then(() => {
          if (active) setAutosave("Saved on this device");
        })
        .catch(() => {
          if (active) setAutosave("Autosave unavailable — download a backup");
        });
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [project, savePaused, loading]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (document.querySelector("dialog[open]")) return;
      const target = e.target as HTMLElement;
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.isContentEditable
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setState((s) => (e.shiftKey ? redo(s) : undo(s)));
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        setState(redo);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.repeat ||
        loading ||
        document.querySelector("dialog[open]") ||
        document.querySelector(".is-manipulating")
      )
        return;
      const target = e.target as HTMLElement;
      if (
        ["TEXTAREA", "SELECT"].includes(target.tagName) ||
        (target.tagName === "INPUT" &&
          !["checkbox", "radio", "button"].includes(
            (target as HTMLInputElement).type,
          )) ||
        target.isContentEditable ||
        !selectionIds.length
      )
        return;
      const command = e.ctrlKey || e.metaKey;
      if (
        nodeOverlay &&
        !command &&
        !e.altKey &&
        (e.key === "Delete" || e.key === "Backspace")
      ) {
        e.preventDefault();
        document.dispatchEvent(new Event("logo-node-remove"));
        return;
      }
      let action: OrganizationAction | undefined;
      if (command && e.key.toLowerCase() === "d") action = "duplicate";
      else if (command && e.key.toLowerCase() === "g")
        action = e.shiftKey ? "ungroup" : "group";
      else if (e.key === "Delete" || e.key === "Backspace") action = "delete";
      if (action) {
        e.preventDefault();
        organization(action);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [project, selectionIds, loading, nodeOverlay]);
  function canReplace() {
    return (
      (state.past.length === 0 && !project.assets?.length) ||
      window.confirm(
        "Replace this entire canvas and its asset library? Download a project backup first to keep them.",
      )
    );
  }
  async function importFile(f: File) {
    if (loading || traceImage || !canReplace()) return;
    const version = ++importVersion.current;
    setTraceTarget(null);
    try {
      if (/\.svg$/i.test(f.name)) {
        if (f.size > 2e6) throw Error("Please use an SVG smaller than 2 MB.");
        const next = importSVG(await f.text(), f.name);
        if (version !== importVersion.current) return;
        replace(next);
        notify(
          "Opened " + f.name + ": " + next.parts.length + " editable parts.",
        );
      } else {
        setDecoding(true);
        const image = await prepareRaster(f);
        if (version === importVersion.current) setTraceImage(image);
      }
    } catch (e) {
      if (version === importVersion.current)
        notify(
          e instanceof Error ? e.message : "Could not open this logo.",
          true,
        );
    } finally {
      if (version === importVersion.current) setDecoding(false);
    }
  }
  async function retrace() {
    setTraceTarget(null);
    const raster = project.source.raster;
    if (!raster || decoding) return;
    const version = ++importVersion.current;
    setDecoding(true);
    try {
      const blob = await (await fetch(raster.dataURL)).blob();
      const image = await prepareRaster(
        new File([blob], project.source.name, { type: blob.type }),
      );
      if (version === importVersion.current) setTraceImage(image);
    } catch (e) {
      if (version === importVersion.current) notify(String(e), true);
    } finally {
      if (version === importVersion.current) setDecoding(false);
    }
  }
  async function choose(e: ChangeEvent<HTMLInputElement>, projectFile = false) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!projectFile) {
      await importFile(f);
      return;
    }
    if (!canReplace()) return;
    try {
      if (f.size > 8e6) throw Error("Project files must be under 8 MB.");
      const version = ++importVersion.current;
      const next = readProject(await f.text());
      if (version !== importVersion.current) return;
      setDecoding(false);
      replace(next);
      notify("Project reopened. Shapes and effect settings are editable.");
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Could not open this project.",
        true,
      );
    }
  }
  function save() {
    try {
      download(
        new Blob([JSON.stringify(validateProject(project), null, 2)], {
          type: "application/json",
        }),
        `${filename(project)}.logoworkshop.json`,
      );
      notify("Project backup downloaded. Keep this file to edit again later.");
    } catch (e) {
      notify(String(e), true);
    }
  }
  async function exportLogo(kind: "svg" | "png") {
    setBusy(true);
    try {
      const blob =
        kind === "svg"
          ? new Blob([svgText(project, options)], {
              type: "image/svg+xml;charset=utf-8",
            })
          : await pngBlob(project, options);
      download(blob, `${filename(project)}.${kind}`);
      notify(
        kind === "png"
          ? "PNG downloaded — a flat image. Keep a project backup for further editing."
          : "SVG downloaded. SVG effects may look different in other editors.",
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : "Export failed.", true);
    } finally {
      setBusy(false);
    }
  }
  function addAssetCopy(id: string, point?: Point) {
    if (assetBusy || traceImage || loading) return;
    try {
      const result = placeAsset(projectRef.current, id, point);
      update(result.project);
      setSelection(result.ids);
      notify("Added an independent copy. Existing designs are untouched.");
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Could not place this asset.",
        true,
      );
    }
  }
  async function uploadAssets(files: File[], dropPoint?: Point) {
    if (loading || assetBusy || traceImage || !files.length) return;
    const version = ++assetUploadVersion.current,
      generation = documentGeneration.current;
    setAssetBusy(true);
    try {
      if ((projectRef.current.assets?.length ?? 0) + files.length > 24)
        throw Error(
          "The library holds up to 24 assets. Remove unused items first.",
        );
      const canceled = () =>
        version !== assetUploadVersion.current ||
        generation !== documentGeneration.current;
      const drafts = await readAssets(files, canceled);
      if (canceled()) return;
      const added = appendAssets(projectRef.current, drafts);
      let next = added.project;
      const selection: string[] = [];
      if (dropPoint)
        for (const [i, id] of added.ids.entries()) {
          const result = placeAsset(next, id, {
            x: dropPoint.x + i * 12,
            y: dropPoint.y + i * 12,
          });
          next = result.project;
          selection.push(...result.ids);
        }
      update(next);
      if (selection.length) setSelection(selection);
      setLibraryTab("assets");
      notify(
        "Added " +
          drafts.length +
          " asset" +
          (drafts.length === 1 ? "" : "s") +
          (dropPoint
            ? " and placed copies on the canvas."
            : " to your library. Drag one in, or choose Add."),
      );
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        notify(e instanceof Error ? e.message : "Could not add assets.", true);
    } finally {
      if (version === assetUploadVersion.current) setAssetBusy(false);
    }
  }
  function deleteAsset(id: string) {
    try {
      update(removeAsset(projectRef.current, id));
      notify("Removed unused asset. Placed vector shapes are unchanged.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not remove asset.", true);
    }
  }
  async function traceAsset(id: string) {
    if (assetBusy || decoding || traceImage || loading) return;
    const asset = projectRef.current.assets?.find((a) => a.id === id);
    if (!asset || asset.kind !== "image") return;
    const version = ++importVersion.current,
      generation = documentGeneration.current;
    setDecoding(true);
    try {
      const blob = await (await fetch(asset.dataURL)).blob(),
        image = await prepareRaster(
          new File([blob], asset.name, { type: blob.type }),
        );
      if (
        version === importVersion.current &&
        generation === documentGeneration.current &&
        projectRef.current.assets?.some((a) => a.id === id)
      ) {
        setTraceTarget(id);
        setTraceImage(image);
      }
    } catch (e) {
      if (version === importVersion.current)
        notify(
          e instanceof Error ? e.message : "Could not prepare this asset.",
          true,
        );
    } finally {
      if (version === importVersion.current) setDecoding(false);
    }
  }
  function reset() {
    if (canReplace()) {
      ++importVersion.current;
      setDecoding(false);
      replace(demoProject());
      notify("Loaded the editable Bloom demo.");
    }
  }
  if (loading)
    return (
      <div className="startup" role="status">
        Opening your local workspace…
      </div>
    );
  return (
    <div
      className="app-shell open-studio"
      data-workspace={workspace}
      data-left-open={leftOpen}
      data-right-open={rightOpen}
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files);
        if (files.length) void uploadAssets(files);
      }}
    >
      {commandsOpen && (
        <CommandPanel
          getSnapshot={snapshot}
          onApply={applyCommands}
          onClose={() => setCommandsOpen(false)}
        />
      )}
      {traceImage && (
        <TracePanel
          image={traceImage}
          initialOptions={
            project.source.raster?.dataURL === traceImage.dataURL
              ? project.source.raster.options
              : undefined
          }
          acceptLabel={traceTarget ? "Add shapes to canvas" : undefined}
          cancelLabel={traceTarget ? "Keep workspace" : undefined}
          onCancel={() => {
            setTraceImage(null);
            setTraceTarget(null);
          }}
          onAccept={(next) => {
            if (traceTarget) {
              try {
                const current = projectRef.current,
                  original = current.assets?.find((a) => a.id === traceTarget);
                if (!original)
                  throw Error("The original asset is no longer available.");
                const added = appendAssets(current, [
                  vectorAsset(next, (original.name + " traced").slice(0, 120)),
                ]);
                const placed = placeAsset(added.project, added.ids[0]);
                update(placed.project);
                setSelection(placed.ids);
                setLibraryTab("assets");
                setTraceImage(null);
                setTraceTarget(null);
                notify(
                  "Added traced shapes alongside your designs. The original image stays in Assets. Ungroup to edit individual parts.",
                );
              } catch (e) {
                notify(
                  e instanceof Error
                    ? e.message
                    : "Could not add traced shapes.",
                  true,
                );
              }
              return;
            }
            if (!canReplace()) return;
            replace(next);
            setTraceImage(null);
            notify(
              "Created " +
                next.parts.length +
                " editable parts. The original image is kept in your project backup.",
            );
          }}
        />
      )}
      {decoding && (
        <div className="notice" role="status">
          Preparing your image…
          <button
            onClick={() => {
              ++importVersion.current;
              setDecoding(false);
            }}
          >
            Cancel import
          </button>
        </div>
      )}
      {assetBusy && (
        <div className="asset-loading" role="status">
          <p>Preparing your assets locally… Current canvas edits are kept.</p>
          <button
            onClick={() => {
              assetUploadVersion.current++;
              setAssetBusy(false);
            }}
          >
            Cancel upload
          </button>
        </div>
      )}
      <header className="topbar">
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <span className="brand-mark">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
          </span>
          <span>Contour Grove</span>
        </a>
        <h1 className="sr-only">Logo studio</h1>
        <StudioMenu label="File" className="file-menu">
          <button onClick={newDocument}>New document</button>
          <button onClick={() => setCommandsOpen(true)}>
            Automation workbench
          </button>
          <button onClick={() => open.current?.click()}>Open project</button>
          <button
            title="Replace the current document in single-logo mode"
            onClick={() => file.current?.click()}
          >
            <Icon name="upload" />
            Import logo
          </button>
          <button onClick={reset}>Try the Bloom demo</button>
        </StudioMenu>
        <div className="document-title">
          <span className="document-dot" />
          <span className="document-name">{project.name}</span>
          <span className="muted">.logo</span>
        </div>

        <div className="top-actions">
          {" "}
          <div className="history-actions">
            <button
              aria-label="Undo"
              title="Undo · Ctrl Z"
              disabled={!state.past.length}
              onClick={() => setState(undo)}
            >
              <Icon name="undo" />
            </button>
            <button
              aria-label="Redo"
              title="Redo · Ctrl Shift Z"
              disabled={!state.future.length}
              onClick={() => setState(redo)}
            >
              <Icon name="redo" />
            </button>
          </div>
          <button className="save-project" onClick={save}>
            <Icon name="save" />
            Save project
          </button>
          <div className="save-status" role="status">
            <Icon name="check" />
            <span>{autosave}</span>
          </div>
          <QuickGuide>
            <p>
              <strong>Choose parts</strong>
              <br />
              Click a shape or its row. <kbd>Shift</kbd> + click selects more.
            </p>
            <p>
              <strong>Move &amp; transform</strong>
              <br />
              Drag to move. Corners resize; the round handle rotates. Hand tool,
              middle mouse or Space + drag pans the view. Ctrl/⌘ + wheel zooms
              at your pointer; wheel pans on desktop. The frame is for export,
              not an editing boundary. Fit resets it. With Hand active, focus
              the canvas and use arrow keys to pan. Fit selection focuses the
              selected artwork; Grid shows or hides the workspace guide.
            </p>
            <p>
              <strong>Stay in control</strong>
              <br />
              <kbd>Esc</kbd> cancels a drag. <kbd>Ctrl / ⌘ Z</kbd> undoes an
              edit.
            </p>
            <p>
              <strong>Organize</strong>
              <br />
              <kbd>Ctrl / ⌘ G</kbd> groups. Add <kbd>Shift</kbd> to ungroup.
            </p>
            <p>
              <strong>Make variations</strong>
              <br />
              <kbd>Ctrl / ⌘ D</kbd> duplicates. <kbd>Delete</kbd> removes
              selected parts.
            </p>
            <p>
              <strong>Keep your work</strong>
              <br />
              Save project keeps editable parts. PNG is a flat image. Artwork
              stays on this device.
            </p>
          </QuickGuide>
          <StudioMenu label="Export" className="export-menu" primary>
            <h2>Export artwork</h2>
            <p className="menu-caption">
              Your artwork only. Editor guides stay here.
            </p>
            <div className="export-controls">
              <label>
                <input
                  type="checkbox"
                  checked={options.effects}
                  onChange={(e) =>
                    setOptions({ ...options, effects: e.target.checked })
                  }
                />
                Include effects
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={options.background}
                  onChange={(e) =>
                    setOptions({ ...options, background: e.target.checked })
                  }
                />
                Include background
              </label>
              <button disabled={busy} onClick={() => void exportLogo("svg")}>
                Export SVG
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void exportLogo("png")}
              >
                <Icon name="download" />
                {busy ? "Preparing…" : "Export PNG"}
              </button>
            </div>
          </StudioMenu>
        </div>
      </header>
      <input
        ref={assetInput}
        data-testid="asset-input"
        type="file"
        accept=".svg,.png,.jpg,.jpeg"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void uploadAssets(files);
        }}
      />
      <input
        ref={file}
        data-testid="logo-input"
        type="file"
        accept=".svg,.png,.jpg,.jpeg"
        hidden
        onChange={(e) => void choose(e)}
      />
      <input
        ref={open}
        data-testid="project-input"
        type="file"
        accept=".json"
        hidden
        onChange={(e) => void choose(e, true)}
      />
      <nav className="studio-nav" aria-label="Workspace navigation">
        <a href="#logo-canvas">Canvas</a>
        <a
          href="#logo-parts"
          onClick={() => {
            setLeftOpen(true);
            setLibraryTab("assets");
          }}
        >
          Assets
        </a>
        <a
          href="#logo-parts"
          onClick={() => {
            setLeftOpen(true);
            setLibraryTab("parts");
          }}
        >
          Layers
        </a>
        <a href="#logo-properties" onClick={() => setRightOpen(true)}>
          Properties
        </a>
      </nav>
      {message && (
        <div
          className={`notice ${error ? "error" : ""}`}
          role={error ? "alert" : "status"}
        >
          <span>{message}</span>
          <button aria-label="Dismiss message" onClick={() => setMessage("")}>
            ×
          </button>
        </div>
      )}
      {contextMenu && (
        <CanvasContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          parts={selectedParts(project, contextMenu.ids)}
          total={project.parts.length}
          onSelectAll={() => {
            setSelection(project.parts.map((p) => p.id));
            setContextMenu(null);
            document.querySelector<HTMLElement>(".canvas-host")?.focus();
          }}
          onCut={() => {
            setNodeOverlay(null);
            setTool("scissors");
            setContextMenu(null);
            document.querySelector<HTMLElement>(".canvas-host")?.focus();
          }}
          onAction={(action) => {
            organization(action, contextMenu.ids);
            setContextMenu(null);
            document.querySelector<HTMLElement>(".canvas-host")?.focus();
          }}
          onClose={(restore) => {
            setContextMenu(null);
            if (restore)
              document.querySelector<HTMLElement>(".canvas-host")?.focus();
          }}
        />
      )}
      <main className="workspace-grid">
        <aside
          id="logo-parts"
          tabIndex={-1}
          className="panel parts-panel"
          aria-label="Logo parts"
        >
          <div className="library-heading">
            <h2>Library</h2>
            <button
              className="panel-collapse"
              aria-label="Hide library"
              aria-controls="logo-parts"
              onClick={() => {
                setLeftOpen(false);
                requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLButtonElement>(".reopen-library")
                    ?.focus(),
                );
              }}
            >
              Hide
            </button>
          </div>
          <div
            className="library-tabs"
            role="tablist"
            aria-label="Library panels"
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                const next =
                  e.key === "Home"
                    ? "assets"
                    : e.key === "End"
                      ? "parts"
                      : libraryTab === "assets"
                        ? "parts"
                        : "assets";
                setLibraryTab(next);
                document.getElementById(next + "-tab")?.focus();
              }
            }}
          >
            <button
              id="assets-tab"
              role="tab"
              aria-selected={libraryTab === "assets"}
              aria-controls="assets-library"
              onClick={() => setLibraryTab("assets")}
            >
              Assets <span>{project.assets?.length ?? 0}</span>
            </button>
            <button
              id="parts-tab"
              role="tab"
              aria-selected={libraryTab === "parts"}
              aria-controls="parts-library"
              onClick={() => setLibraryTab("parts")}
            >
              Layers <span>{project.parts.length}</span>
            </button>
          </div>
          <div
            id="assets-library"
            role="tabpanel"
            aria-labelledby="assets-tab"
            hidden={libraryTab !== "assets"}
          >
            <AssetsPanel
              project={project}
              busy={assetBusy || decoding || !!traceImage}
              onUpload={() => assetInput.current?.click()}
              onAdd={addAssetCopy}
              onTrace={(id) => void traceAsset(id)}
              onRemove={deleteAsset}
            />
          </div>
          <div
            id="parts-library"
            role="tabpanel"
            aria-labelledby="parts-tab"
            hidden={libraryTab !== "parts"}
          >
            <div className="panel-title">
              <h2>
                <Icon name="parts" />
                Layers
              </h2>
              <span className="count">{project.parts.length}</span>
            </div>

            <div className="selection-tools">
              <button
                onClick={() => setSelection(project.parts.map((p) => p.id))}
                disabled={!project.parts.length}
              >
                Select all
              </button>
              <button
                onClick={() => setSelection([])}
                disabled={!selectionIds.length}
              >
                Deselect
              </button>
            </div>
            <PartsList
              project={project}
              ids={selectionIds}
              onPick={(id, additive) => pick(id, additive)}
              onContext={(id, x, y) => {
                const ids = selectionIds.includes(id)
                  ? selectionIds
                  : pickIds(project, selectionIds, id);
                setSelection(ids);
                setNodeOverlay(null);
                setContextMenu({ x, y, ids });
              }}
            />
            <details className="reference-note">
              <summary>Original source</summary>
              <span className="eyebrow">SOURCE</span>
              <strong>{project.source.name}</strong>
              {project.source.raster && (
                <button className="full subtle" onClick={() => void retrace()}>
                  Compare / retrace original
                </button>
              )}
              <p>Preserved for comparison and retracing.</p>
            </details>
          </div>
        </aside>
        <section
          id="logo-canvas"
          tabIndex={-1}
          className="canvas-panel"
          aria-label="Design workspace"
          onKeyDown={(event) => {
            if (
              (event.key === "F10" && event.shiftKey) ||
              event.key === "ContextMenu"
            ) {
              const host = (event.target as Element).closest(".canvas-host");
              if (!host) return;
              event.preventDefault();
              event.stopPropagation();
              const rect = host.getBoundingClientRect();
              setNodeOverlay(null);
              setContextMenu({
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
                ids: selectionIds,
              });
            }
          }}
          onContextMenu={(event) => {
            const target = event.target as Element;
            if (!target.closest(".canvas-host")) return;
            event.preventDefault();
            const id = target.closest<SVGGElement>("[data-part]")?.dataset.part;
            const isOverlay = !!target.closest(
              "[data-selection], [data-node-overlay]",
            );
            const keyboard = event.clientX === 0 && event.clientY === 0;
            const ids = id
              ? selectionIds.includes(id)
                ? selectionIds
                : pickIds(project, selectionIds, id)
              : isOverlay || keyboard
                ? selectionIds
                : [];
            setSelection(ids);
            setNodeOverlay(null);
            const host = target
              .closest(".canvas-host")!
              .getBoundingClientRect();
            setContextMenu({
              x: keyboard ? host.left + host.width / 2 : event.clientX,
              y: keyboard ? host.top + host.height / 2 : event.clientY,
              ids,
            });
          }}
        >
          {!leftOpen && (
            <button
              className="reopen-panel reopen-library"
              aria-label="Show library"
              aria-controls="logo-parts"
              onClick={() => {
                setLeftOpen(true);
                requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLButtonElement>(
                      '[aria-label="Hide library"]',
                    )
                    ?.focus(),
                );
              }}
            >
              Library
            </button>
          )}
          {!rightOpen && (
            <button
              className="reopen-panel reopen-inspector"
              aria-label="Show inspector"
              aria-controls="logo-properties"
              onClick={() => {
                setRightOpen(true);
                requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLButtonElement>(
                      '[aria-label="Hide inspector"]',
                    )
                    ?.focus(),
                );
              }}
            >
              Properties
            </button>
          )}
          <div className="canvas-surround">
            <span className="artboard-label">
              {project.background && options.background
                ? "Export frame"
                : "Export frame · transparent"}{" "}
              <span>
                {Number(project.viewBox[2].toFixed(2))} ×{" "}
                {Number(project.viewBox[3].toFixed(2))}
              </span>
            </span>
            <div className="artboard-mount">
              <LogoCanvas
                project={project}
                workspace={workspace}
                grid={grid}
                snap={snap}
                nodeOverlay={nodeOverlay}
                onEditText={(id) => {
                  const candidate = projectRef.current.parts.find(
                    (p) => p.id === id,
                  );
                  if (
                    !candidate ||
                    candidate.kind !== "text" ||
                    candidate.locked ||
                    candidate.hidden
                  )
                    return;
                  setSelection([id]);
                  setRightOpen(true);
                  requestAnimationFrame(() => {
                    const input = document.querySelector<HTMLInputElement>(
                      '.text-controls input[aria-label="Text"]',
                    );
                    input?.focus();
                    input?.select();
                  });
                }}
                onExitNodes={() => setNodeOverlay(null)}
                onNodePick={(pathIndex, nodeIndex) =>
                  setNodeOverlay((old) =>
                    old ? { ...old, pathIndex, nodeIndex } : null,
                  )
                }
                onCameraChange={(next, point) => {
                  setZoom(next);
                  setPan(point);
                }}
                inkEdges={inkEdges}
                onDropAsset={(id, point) => addAssetCopy(id, point)}
                onDropFiles={(files, point) => void uploadAssets(files, point)}
                zoom={zoom}
                pan={pan}
                tool={tool}
                onCut={(id, point, tolerance, end) =>
                  void cutLine(id, point, tolerance, end)
                }
                onPenFinish={(points, closed) => {
                  try {
                    const result = addPenPath(
                      projectRef.current,
                      points,
                      closed,
                    );
                    update(result.project);
                    setSelection([result.id]);
                    setTool("select");
                    setLibraryTab("parts");
                    notify("Drawing added. Undo removes it in one step.");
                    return true;
                  } catch (e) {
                    notify(
                      e instanceof Error ? e.message : "Could not add drawing.",
                      true,
                    );
                    return false;
                  }
                }}
                onPanChange={setPan}
                selected={selected}
                options={options}
                onSelect={setSelected}
                selection={selectionIds}
                onPick={(id, additive) => pick(id, additive, true)}
                onMoveMany={moveSelection}
                keepProportions={keepProportions}
                onBounds={setSelectionBounds}
                onTransform={(id, edit) => {
                  try {
                    if (!editable(selectedParts(project, [id]))) return false;
                    update(changePart(project, id, edit));
                    return true;
                  } catch {
                    notify(
                      "That adjustment exceeds the supported size or position. Try a smaller change.",
                      true,
                    );
                    return false;
                  }
                }}
                onMove={(id, x, y) => {
                  const p = project.parts.find((p) => p.id === id);
                  if (p) moveSelection([id], x - p.x, y - p.y);
                }}
              />
            </div>
          </div>
          <div className="workspace-rail" aria-label="Creation and navigation">
            <InsertMenu
              onCreate={createShape}
              onCreateText={createText}
              onUpload={() => {
                setLeftOpen(true);
                setLibraryTab("assets");
                assetInput.current?.click();
              }}
            />
            <div className="canvas-tool-group" aria-label="Canvas tools">
              <button
                aria-label="Select tool"
                aria-pressed={tool === "select"}
                title="Select and transform"
                onClick={() => setTool("select")}
              >
                <Icon name="cursor" />
              </button>
              <button
                aria-label="Pen tool"
                aria-pressed={tool === "pen"}
                title="Draw lines and curves"
                onClick={() => {
                  setNodeOverlay(null);
                  setSelection([]);
                  setTool("pen");
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  aria-hidden="true"
                >
                  <path d="M12 3 4 18l5 2L21 8l-5-5-4 4M4 18l-1 3 6-1M11 12l3 3" />
                </svg>
              </button>
              <button
                aria-label="Scissors tool"
                aria-pressed={tool === "scissors"}
                title="Cut a selected open line"
                onClick={() => {
                  setNodeOverlay(null);
                  setTool("scissors");
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  aria-hidden="true"
                >
                  <circle cx="5" cy="6" r="2.5" />
                  <circle cx="5" cy="18" r="2.5" />
                  <path d="M7 7.5 21 19M7 16.5 21 5M11 12l-2 2" />
                </svg>
              </button>
              <button
                aria-label="Hand tool"
                aria-pressed={tool === "hand"}
                title="Pan view · Space + drag, middle mouse, or arrow keys on canvas"
                onClick={() => setTool("hand")}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <path d="M7 11V6a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-6a1.5 1.5 0 0 1 3 0v6-3a1.5 1.5 0 0 1 3 0v7c0 5-3 7-6 7s-4-2-6-5l-3-4a1.5 1.5 0 0 1 2-2l3 3" />
                </svg>
              </button>
            </div>
            <button
              aria-label="Toggle infinite workspace"
              aria-pressed={workspace}
              title="Switch open workspace / focused artboard"
              onClick={() => {
                setWorkspace((v) => !v);
                setPan({ x: 0, y: 0 });
                setZoom(1);
              }}
            >
              ⌗
            </button>
          </div>
          {tool === "scissors" && (
            <div className="pen-hint" role="status">
              Select a shape, then drag all the way across it. Each piece gets
              its own outline. For an open line, click where you want to cut.
            </div>
          )}
          {tool === "pen" && (
            <div className="pen-hint" role="status">
              Click for corners · drag for curves · click the first point to
              close · Backspace removes a point · Enter finishes · Esc cancels
            </div>
          )}
          <div className="viewport-toolbar" aria-label="Canvas view controls">
            <div className="zoom-controls">
              <button
                aria-label="Zoom out"
                disabled={zoom <= MIN_ZOOM}
                onClick={() =>
                  setZoom((z) =>
                    Math.max(MIN_ZOOM, Number((z / 1.25).toFixed(4))),
                  )
                }
              >
                −
              </button>
              <label>
                <span className="sr-only">Canvas zoom</span>
                <select
                  aria-label="Canvas zoom"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                >
                  {Array.from(
                    new Set([
                      0.05,
                      0.1,
                      0.15,
                      0.25,
                      0.5,
                      0.75,
                      1,
                      1.25,
                      1.5,
                      1.75,
                      2,
                      2.25,
                      2.5,
                      2.75,
                      3,
                      3.25,
                      3.5,
                      3.75,
                      4,
                      6,
                      8,
                      12,
                      16,
                      zoom,
                    ]),
                  )
                    .sort((a, b) => a - b)
                    .map((z) => (
                      <option key={z} value={z}>
                        {Number((z * 100).toFixed(1))}%
                      </option>
                    ))}
                </select>
              </label>
              <button
                aria-label="Zoom in"
                disabled={zoom >= MAX_ZOOM}
                onClick={() =>
                  setZoom((z) =>
                    Math.min(MAX_ZOOM, Number((z * 1.25).toFixed(4))),
                  )
                }
              >
                +
              </button>
              <button
                className="fit-view"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
              >
                Fit to canvas
              </button>
              <button className="fit-all" onClick={() => fitArtwork()}>
                Fit all
              </button>
              <button
                className="fit-selection"
                disabled={!selectionIds.length}
                onClick={() => fitArtwork(true)}
              >
                Fit selection
              </button>
              <button
                className="object-snap-toggle"
                aria-label="Snap to objects"
                aria-pressed={snap}
                title="Align to objects and the export frame while moving or resizing. Hold Alt to temporarily turn off."
                onClick={() => setSnap((v) => !v)}
              >
                Snap
              </button>
              {workspace && (
                <button
                  className="grid-toggle"
                  aria-label="Show canvas grid"
                  aria-pressed={grid}
                  title="Show or hide the workspace grid (not exported)"
                  onClick={() => setGrid((v) => !v)}
                >
                  Grid
                </button>
              )}
            </div>
            <button
              className="canvas-add"
              aria-label="Upload assets to library"
              title="Upload logos or reference images"
              disabled={assetBusy || decoding || !!traceImage}
              onClick={() => {
                setLibraryTab("assets");
                assetInput.current?.click();
              }}
            >
              <Icon name="upload" />
            </button>
          </div>
          <div className="canvas-bottom">
            <span>
              <span className="blue-dot" />
              {selectionIds.length > 1
                ? `${selectionIds.length} parts selected`
                : part
                  ? `${part.name} selected`
                  : "No part selected"}
            </span>
            <span>{project.parts.length} canvas items · local editing</span>
          </div>
        </section>
        <aside
          id="logo-properties"
          tabIndex={-1}
          className="panel inspector"
          aria-label="Selected part settings"
        >
          <div className="panel-title">
            <h2>Properties</h2>
            <button
              className="panel-collapse"
              aria-label="Hide inspector"
              aria-controls="logo-properties"
              onClick={() => {
                setRightOpen(false);
                requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLButtonElement>(".reopen-inspector")
                    ?.focus(),
                );
              }}
            >
              Hide
            </button>
          </div>
          <AlignmentControls
            project={project}
            ids={selectionIds}
            onArrange={arrangeSelection}
          />
          <GeometryControls
            project={project}
            ids={selectionIds}
            overlay={nodeOverlay}
            keyboardEnabled={tool === "select"}
            onOverlay={setNodeOverlay}
            onResult={(before, ids, result, name) => {
              if (projectRef.current !== before)
                throw Error(
                  "Document changed during geometry processing. Try again.",
                );
              const next = replacePaths(before, ids, result, name);
              update(next.project);
              setSelection(next.ids);
              notify("Path edit applied. Undo restores the original shapes.");
            }}
          />
          {part ? (
            <fieldset
              className="part-edit-fields"
              disabled={!!part.locked || !!part.hidden}
            >
              <div className="selected-name">
                {part.name}
                <span>{part.group || "Individual shape"}</span>
              </div>
              {part.kind === "text" && part.textData && (
                <TextControls
                  key={`text-${part.id}`}
                  part={part}
                  onChange={(data) => edit({ textData: data })}
                  onError={(text) => notify(text, true)}
                />
              )}
              <section className="control-section">
                <h3>Transform</h3>
                <div className="two-fields">
                  {(["x", "y"] as const).map((axis) => (
                    <label key={axis}>
                      {axis.toUpperCase()}
                      <input
                        aria-label={`${axis.toUpperCase()} position`}
                        type="number"
                        min="-1000000"
                        max="1000000"
                        step="1"
                        value={Math.round(part[axis] * 100) / 100}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isFinite(n) && Math.abs(n) <= 1e6)
                            edit({ [axis]: n });
                        }}
                      />
                    </label>
                  ))}
                </div>
              </section>
              {selectionBounds?.id === part.id && (
                <TransformControls
                  key={`transform-${part.id}`}
                  part={part}
                  bounds={selectionBounds.bounds}
                  locked={keepProportions}
                  onLock={setKeepProportions}
                  onChange={edit}
                  onError={(text) => notify(text, true)}
                />
              )}
              {part.kind === "image" ? (
                <section className="control-section">
                  <h3>Reference image</h3>
                  <p className="image-reference-note">
                    Image · make an editable copy as shapes.
                  </p>
                  <label className="image-opacity">
                    <span>
                      Opacity <output>{Math.round(part.opacity * 100)}%</output>
                    </span>
                    <input
                      aria-label="Image opacity"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={part.opacity}
                      onChange={(e) =>
                        edit({ opacity: Number(e.target.value) })
                      }
                    />
                  </label>
                  <button
                    className="full"
                    onClick={() =>
                      part.assetId && void traceAsset(part.assetId)
                    }
                  >
                    Make image editable
                  </button>
                </section>
              ) : (
                <>
                  {" "}
                  <section className="control-section">
                    <h3>Color</h3>
                    <label className="color-control">
                      <input
                        aria-label="Part color"
                        type="color"
                        value={colorValue(part.fill)}
                        onChange={(e) => edit({ fill: e.target.value })}
                      />
                      <span>{part.fill.toUpperCase()}</span>
                      <span className="muted">Fill</span>
                    </label>
                    <div className="palette" aria-label="Quick colors">
                      {[
                        "#111111",
                        "#777777",
                        "#a78bfa",
                        "#dddddd",
                        "#ffffff",
                      ].map((c) => (
                        <button
                          key={c}
                          aria-label={`Set color ${c}`}
                          style={{ background: c }}
                          onClick={() => edit({ fill: c })}
                        />
                      ))}
                    </div>
                  </section>
                </>
              )}
              <section className="control-section">
                <div className="section-toggle">
                  <h3>Drop shadow</h3>
                  <label className="switch">
                    <input
                      aria-label="Enable shadow"
                      type="checkbox"
                      checked={part.shadow.enabled}
                      onChange={(e) => shadow({ enabled: e.target.checked })}
                    />
                    <span />
                  </label>
                </div>

                {part.shadow.enabled && (
                  <div className="shadow-controls">
                    <label className="color-control">
                      <input
                        type="color"
                        aria-label="Shadow color"
                        value={colorValue(part.shadow.color)}
                        onChange={(e) => shadow({ color: e.target.value })}
                      />
                      <span>Shadow color</span>
                    </label>
                    {(
                      [
                        {
                          key: "opacity",
                          label: "Opacity",
                          min: 0,
                          max: 1,
                          step: 0.01,
                        },
                        {
                          key: "blur",
                          label: "Softness",
                          min: 0,
                          max: 40,
                          step: 1,
                        },
                        {
                          key: "dx",
                          label: "Horizontal",
                          min: -60,
                          max: 60,
                          step: 1,
                        },
                        {
                          key: "dy",
                          label: "Vertical",
                          min: -60,
                          max: 60,
                          step: 1,
                        },
                      ] as const
                    ).map((c) => (
                      <label className="slider-field" key={c.key}>
                        <span>
                          {c.label}
                          <output>
                            {c.key === "opacity"
                              ? `${Math.round(part.shadow[c.key] * 100)}%`
                              : part.shadow[c.key]}
                          </output>
                        </span>
                        <input
                          aria-label={`Shadow ${c.label.toLowerCase()}`}
                          type="range"
                          min={c.min}
                          max={c.max}
                          step={c.step}
                          value={part.shadow[c.key]}
                          onChange={(e) =>
                            shadow({ [c.key]: Number(e.target.value) })
                          }
                        />
                      </label>
                    ))}
                  </div>
                )}
              </section>
              <AppearanceControls part={part} onChange={edit} />
              <FinishControls
                value={part.finish}
                onChange={(finish) => edit({ finish })}
              />
            </fieldset>
          ) : (
            <div className="empty-selection">
              <Icon name="cursor" />
              <p>
                {!project.parts.length
                  ? "Your canvas is empty. Add a shape, text, or image to get started."
                  : selectionIds.length > 1
                    ? "Use Organize below. Ungroup and select one part to resize, rotate, or change its color."
                    : "Select a shape on the canvas or in the parts list."}
              </p>
            </div>
          )}
          <OrganizationControls
            project={project}
            ids={selectionIds}
            onAction={organization}
            onMove={(dx, dy) => moveSelection(selectionIds, dx, dy)}
            onClear={() => setSelection([])}
          />
          <CanvasControls
            project={project}
            onApply={(next) => {
              update(next);
              setZoom(1);
              setPan({ x: 0, y: 0 });
              notify(
                "Canvas frame updated. Shapes are unchanged; Undo restores the previous frame.",
              );
            }}
            onError={(text) => notify(text, true)}
          >
            <section className="control-section">
              <h3>Canvas background</h3>
              <div className="background-options">
                {[
                  { name: "Transparent", value: null },
                  { name: "White", value: "#ffffff" },
                  { name: "Dark", value: "#252321" },
                ].map((b) => (
                  <button
                    key={b.name}
                    aria-pressed={project.background === b.value}
                    onClick={() => update({ ...project, background: b.value })}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            </section>

            <label
              className="ink-preview-setting"
              title="A subtle outline around dark vector shapes, only in the editor. Your artwork and exports are unchanged."
            >
              <input
                type="checkbox"
                checked={inkEdges}
                onChange={(e) => setInkEdges(e.target.checked)}
              />
              Outline dark ink in preview
            </label>
          </CanvasControls>
        </aside>
      </main>
    </div>
  );
}
