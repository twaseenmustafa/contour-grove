import { useState } from "react";
import { editable, expandedIds, selectedParts } from "../model/organization";
import {
  layoutUnitCount,
  type LayoutAction,
  type LayoutTarget,
} from "../model/layout";
import type { Project } from "../model/project";
const actions: [LayoutAction, string, string][] = [
  ["left", "Align left", "M4 3v18M8 7h12v4H8zM8 15h8v4H8z"],
  ["center-x", "Align horizontal center", "M12 2v20M4 6h16v4H4zM7 14h10v4H7z"],
  ["right", "Align right", "M20 3v18M4 7h12v4H4zM8 15h8v4H8z"],
  ["top", "Align top", "M3 4h18M7 8h4v12H7zM15 8h4v8h-4z"],
  ["center-y", "Align vertical center", "M2 12h20M6 4h4v16H6zM14 7h4v10h-4z"],
  ["bottom", "Align bottom", "M3 20h18M7 4h4v12H7zM15 8h4v8h-4z"],
  [
    "distribute-x",
    "Distribute horizontal spacing",
    "M3 4v16M21 4v16M8 7h3v10H8zM14 7h3v10h-3z",
  ],
  [
    "distribute-y",
    "Distribute vertical spacing",
    "M4 3h16M4 21h16M7 8h10v3H7zM7 14h10v3H7z",
  ],
];
export default function AlignmentControls({
  project,
  ids,
  onArrange,
}: {
  project: Project;
  ids: string[];
  onArrange: (action: LayoutAction, target: LayoutTarget) => void;
}) {
  const [target, setTarget] = useState<LayoutTarget>("selection"),
    count = layoutUnitCount(project, ids),
    available = editable(selectedParts(project, expandedIds(project, ids)));
  return (
    <section className="alignment-section" aria-label="Alignment and spacing">
      <div className="alignment-heading">
        <h3>Arrange</h3>
        <select
          aria-label="Align relative to"
          value={count < 2 ? "canvas" : target}
          disabled={!available}
          onChange={(e) => setTarget(e.target.value as LayoutTarget)}
        >
          <option value="selection" disabled={count < 2}>
            Selection
          </option>
          <option value="canvas">Export frame</option>
        </select>
      </div>
      <div className="alignment-tools">
        {actions.map(([action, label, path]) => (
          <button
            type="button"
            key={action}
            aria-label={label}
            title={label}
            disabled={
              !available || (action.startsWith("distribute") && count < 3)
            }
            onClick={() => onArrange(action, count < 2 ? "canvas" : target)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d={path} />
            </svg>
          </button>
        ))}
      </div>
    </section>
  );
}
