import { useEffect, useState } from "react";
import type { SurfaceFinish } from "../model/project";
export const defaultFinish: SurfaceFinish = {
  grain: 0,
  depth: 0,
  angle: 45,
  color: "#444444",
};
function FinishNumber({
  label,
  value,
  max,
  min = 0,
  onCommit,
}: {
  label: string;
  value: number;
  max: number;
  min?: number;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  function commit() {
    const n = Number(draft);
    if (draft.trim() && Number.isFinite(n) && n >= min && n <= max) {
      if (n !== value) onCommit(n);
    } else setDraft(String(value));
  }
  return (
    <input
      aria-label={label}
      type="number"
      min={min}
      max={max}
      step="1"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.currentTarget.value = String(value);
          setDraft(String(value));
        }
      }}
    />
  );
}
export default function FinishControls({
  value,
  onChange,
}: {
  value?: SurfaceFinish;
  onChange: (value: SurfaceFinish | undefined) => void;
}) {
  const finish = value ?? defaultFinish;
  function change(patch: Partial<SurfaceFinish>) {
    onChange({ ...finish, ...patch });
  }
  return (
    <details className="finish-controls control-section">
      <summary>
        Surface finish{" "}
        <span>{finish.grain > 0 || finish.depth > 0 ? "On" : "None"}</span>
      </summary>
      <p className="finish-note">
        Local grain and layered depth. Your original paths stay editable.
      </p>
      <label className="finish-field">
        Grain{" "}
        <FinishNumber
          label="Grain amount"
          value={Math.round(finish.grain * 100)}
          max={45}
          onCommit={(n) => change({ grain: n / 100 })}
        />
        <span>%</span>
      </label>
      <label className="finish-field">
        Depth{" "}
        <FinishNumber
          label="Depth amount"
          value={finish.depth}
          max={24}
          onCommit={(n) => change({ depth: n })}
        />
        <span>px</span>
      </label>
      <label className="finish-field">
        Direction{" "}
        <FinishNumber
          label="Depth direction"
          value={finish.angle}
          min={-180}
          max={180}
          onCommit={(n) => change({ angle: n })}
        />
        <span>°</span>
      </label>
      <label className="finish-field">
        Depth color{" "}
        <input
          aria-label="Depth color"
          type="color"
          value={finish.color}
          onChange={(e) => change({ color: e.target.value })}
        />
      </label>
      <button
        type="button"
        className="finish-remove"
        disabled={!value}
        onClick={() => onChange(undefined)}
      >
        Remove finish
      </button>
    </details>
  );
}
