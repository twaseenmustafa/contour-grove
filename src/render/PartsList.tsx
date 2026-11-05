import type { Project } from "../model/project";
export default function PartsList({
  project,
  ids,
  onPick,
  onContext,
}: {
  project: Project;
  ids: string[];
  onPick: (id: string, additive: boolean) => void;
  onContext: (id: string, x: number, y: number) => void;
}) {
  const selected = new Set(ids);
  return (
    <div className="parts-list" aria-label="Logo part list">
      {project.parts.map((p, i) => {
        const group = project.groups?.find((g) => g.id === p.groupId);
        return (
          <div
            className={`part-item ${p.hidden ? "is-hidden" : ""}`}
            key={p.id}
          >
            <label className="part-check" title={`Add or remove ${p.name}`}>
              <input
                type="checkbox"
                aria-label={`Select ${p.name}`}
                checked={selected.has(p.id)}
                onChange={() => onPick(p.id, true)}
              />
            </label>
            <button
              className={`part-row ${selected.has(p.id) ? "selected" : ""}`}
              aria-pressed={selected.has(p.id)}
              onKeyDown={(event) => {
                if (
                  (event.key === "F10" && event.shiftKey) ||
                  event.key === "ContextMenu"
                ) {
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  onContext(p.id, rect.left + rect.width / 2, rect.bottom);
                }
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                onContext(p.id, event.clientX, event.clientY);
              }}
              onClick={(e) =>
                onPick(p.id, e.shiftKey || e.ctrlKey || e.metaKey)
              }
            >
              <span
                className="part-swatch"
                style={{
                  background: p.fill === "none" ? "transparent" : p.fill,
                }}
              />
              <span className="part-label">
                <strong>{p.name}</strong>
                <small>
                  {p.kind} · {String(i + 1).padStart(2, "0")}
                </small>
                {group && <span className="part-meta">↳ {group.name}</span>}
                {(p.hidden || p.locked) && (
                  <span className="part-meta">
                    {[p.hidden ? "Hidden" : "", p.locked ? "Locked" : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </span>
            </button>
          </div>
        );
      })}
      {!project.parts.length && (
        <p className="empty-parts">
          No layers yet. Add a shape, text, or image to get started.
        </p>
      )}
    </div>
  );
}
