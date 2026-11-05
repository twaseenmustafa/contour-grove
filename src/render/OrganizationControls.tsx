import { useState } from "react";
import type { Project } from "../model/project";
import {
  editable,
  selectedParts,
  type OrganizationAction,
} from "../model/organization";
export default function OrganizationControls({
  project,
  ids,
  onAction,
  onMove,
  onClear,
}: {
  project: Project;
  ids: string[];
  onAction: (action: OrganizationAction) => void;
  onMove: (dx: number, dy: number) => void;
  onClear: () => void;
}) {
  const parts = selectedParts(project, ids),
    canEdit = editable(parts),
    allHidden = parts.length > 0 && parts.every((p) => p.hidden),
    allLocked = parts.length > 0 && parts.every((p) => p.locked),
    hasGroup = parts.some((p) => p.groupId),
    sameGroup = hasGroup && parts.every((p) => p.groupId === parts[0]?.groupId),
    group = sameGroup
      ? project.groups?.find((g) => g.id === parts[0]?.groupId)
      : undefined;
  const [dx, setDX] = useState("0"),
    [dy, setDY] = useState("0");
  const action = (
    label: string,
    kind: OrganizationAction,
    disabled = false,
  ) => (
    <button disabled={!parts.length || disabled} onClick={() => onAction(kind)}>
      {label}
    </button>
  );
  return (
    <details
      className="organization-controls"
      open={parts.length > 1}
      aria-label="Organize selected parts"
    >
      <summary>
        Organize {parts.length > 1 ? `${parts.length} parts` : "part"}
      </summary>
      <div className="organization-heading">
        <h3>
          {group
            ? group.name
            : parts.length > 1
              ? `${parts.length} parts selected`
              : "Organize part"}
        </h3>
        <button
          className="clear-selection"
          disabled={!parts.length}
          onClick={onClear}
        >
          Clear
        </button>
      </div>
      <div className="organization-actions">
        {action("Group", "group", !canEdit || parts.length < 2 || !!sameGroup)}
        {action("Ungroup", "ungroup", !canEdit || !hasGroup)}
        {action("Duplicate", "duplicate", !canEdit)}
        {action("Delete", "delete", !canEdit)}
        {action(allHidden ? "Show" : "Hide", allHidden ? "show" : "hide")}
        {action(allLocked ? "Unlock" : "Lock", allLocked ? "unlock" : "lock")}
      </div>
      <div className="organization-order">
        <span>Stacking order</span>
        <div>
          {action("To back", "back", !canEdit)}
          {action("Backward", "backward", !canEdit)}
          {action("Forward", "forward", !canEdit)}
          {action("To front", "front", !canEdit)}
        </div>
      </div>
      {!canEdit && parts.length > 0 && (
        <p className="organization-hint">
          Show and unlock all selected parts to edit them. Hidden parts are left
          out of exports; locked parts remain visible.
        </p>
      )}
      {parts.length > 1 && (
        <>
          <p className="organization-hint">
            Drag a selected part to move the selection together. Grouping keeps
            separate shapes; resize or rotate parts individually after
            ungrouping.
          </p>
          <form
            className="selection-move"
            onSubmit={(e) => {
              e.preventDefault();
              onMove(Number(dx), Number(dy));
              setDX("0");
              setDY("0");
            }}
          >
            <div className="two-fields">
              <label>
                Move X
                <input
                  aria-label="Move selection X"
                  type="number"
                  step="any"
                  value={dx}
                  disabled={!canEdit}
                  onChange={(e) => setDX(e.target.value)}
                />
              </label>
              <label>
                Move Y
                <input
                  aria-label="Move selection Y"
                  type="number"
                  step="any"
                  value={dy}
                  disabled={!canEdit}
                  onChange={(e) => setDY(e.target.value)}
                />
              </label>
            </div>
            <button className="full" disabled={!canEdit}>
              Move selection
            </button>
          </form>
        </>
      )}
    </details>
  );
}
