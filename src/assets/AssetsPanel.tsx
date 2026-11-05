import { useLayoutEffect, useRef } from "react";
import type { Asset, Project } from "../model/project";
import { ASSET_DRAG_TYPE } from "../model/assets";
import { createLogoSVG } from "../export/logo";
function Preview({ asset }: { asset: Asset }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (asset.kind !== "vector" || !host.current) return;
    const svg = createLogoSVG(
      {
        schemaVersion: 1,
        name: asset.name,
        source: { name: asset.name, text: "" },
        viewBox: asset.viewBox,
        parts: asset.parts,
        background: null,
      },
      { effects: false, background: false },
    );
    svg.setAttribute("aria-label", asset.name + " vector preview");
    host.current.replaceChildren(svg);
  }, [asset]);
  return asset.kind === "image" ? (
    <img
      src={asset.dataURL}
      alt={asset.name + " reference preview"}
      draggable={false}
    />
  ) : (
    <div ref={host} className="asset-vector-preview" />
  );
}
export default function AssetsPanel({
  project,
  busy,
  onUpload,
  onAdd,
  onTrace,
  onRemove,
}: {
  project: Project;
  busy: boolean;
  onUpload: () => void;
  onAdd: (id: string) => void;
  onTrace: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const assets = project.assets ?? [];
  return (
    <>
      <div className="asset-heading">
        <h2>
          Assets <span className="count">{assets.length}/24</span>
        </h2>
        <span className="asset-local">On this device</span>
      </div>
      <p className="panel-hint">Drag onto the canvas, or choose Add.</p>
      <button
        className="full asset-upload"
        onClick={onUpload}
        disabled={busy || assets.length >= 24}
      >
        {busy ? "Preparing assets…" : "+ Upload assets"}
      </button>
      {!assets.length ? (
        <div className="assets-empty">
          <span aria-hidden="true">＋</span>
          <h3>Bring your ideas in</h3>
          <p>
            Upload logos and references together. Your canvas stays untouched.
          </p>
        </div>
      ) : (
        <div className="assets-grid" aria-label="Asset library">
          {assets.map((asset) => {
            const inUse = project.parts.some((p) => p.assetId === asset.id);
            return (
              <article
                key={asset.id}
                className="asset-card"
                aria-label={asset.name}
              >
                <div
                  className="asset-thumbnail"
                  draggable={!busy}
                  data-asset-id={asset.id}
                  title={"Drag " + asset.name + " to the canvas"}
                  onDragStart={(e) => {
                    e.stopPropagation();
                    e.dataTransfer.effectAllowed = "copy";
                    e.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id);
                  }}
                >
                  <Preview asset={asset} />
                  <span className="asset-kind">
                    {asset.kind === "vector" ? "VECTOR" : "IMAGE"}
                  </span>
                </div>
                <strong title={asset.name}>{asset.name}</strong>
                <span className="asset-description">
                  {asset.kind === "vector"
                    ? asset.parts.length + " editable parts"
                    : asset.width + " × " + asset.height + " px"}
                </span>
                <div className="asset-actions">
                  <button
                    aria-label={"Add " + asset.name + " to canvas"}
                    onClick={() => onAdd(asset.id)}
                    disabled={busy}
                  >
                    Add
                  </button>
                  {asset.kind === "image" && (
                    <button
                      aria-label={"Make " + asset.name + " editable"}
                      onClick={() => onTrace(asset.id)}
                      disabled={busy}
                    >
                      Make editable
                    </button>
                  )}
                </div>
                <button
                  className="asset-remove"
                  aria-label={"Remove " + asset.name + " from assets"}
                  disabled={busy || inUse}
                  title={
                    inUse
                      ? "Remove its canvas copies first"
                      : "Remove unused asset; canvas vector copies stay"
                  }
                  onClick={() => onRemove(asset.id)}
                >
                  Remove
                </button>
              </article>
            );
          })}
        </div>
      )}
      <p className="asset-footnote">
        SVG, PNG and JPG · up to 24 files. Make editable creates a copy of an
        image as shapes.
      </p>
    </>
  );
}
