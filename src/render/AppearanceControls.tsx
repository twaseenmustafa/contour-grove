import { useEffect, useState } from "react";
import type { Part } from "../model/project";
function Draft({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <input
      aria-label={label}
      type="number"
      min={min}
      max={max}
      step="any"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = Number(draft);
        if (draft.trim() && Number.isFinite(n) && n >= min && n <= max) {
          if (n !== value) onCommit(n);
        } else setDraft(String(value));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(String(value));
      }}
    />
  );
}
export default function AppearanceControls({
  part,
  onChange,
}: {
  part: Part;
  onChange: (patch: Partial<Part>) => void;
}) {
  const [name, setName] = useState(part.name);
  useEffect(() => setName(part.name), [part.name]);
  return (
    <details className="appearance-controls control-section">
      <summary>Outline &amp; opacity</summary>
      <label>
        Layer name
        <input
          aria-label="Layer name"
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name !== part.name)
              onChange({ name: name.trim() });
            else setName(part.name);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setName(part.name);
          }}
        />
      </label>
      {part.kind !== "image" && (
        <>
          <label className="inline-toggle">
            <input
              type="checkbox"
              aria-label="Fill enabled"
              checked={part.fill !== "none"}
              onChange={(e) =>
                onChange({ fill: e.target.checked ? "#eeeeee" : "none" })
              }
            />
            Fill enabled
          </label>
          <label>
            Outline
            <input
              type="color"
              aria-label="Outline color"
              value={
                /^#[0-9a-f]{6}$/i.test(part.stroke) ? part.stroke : "#eeeeee"
              }
              onChange={(e) =>
                onChange({
                  stroke: e.target.value,
                  strokeWidth: part.strokeWidth || 2,
                })
              }
            />
          </label>
          <label>
            Outline width
            <Draft
              label="Outline width"
              value={part.strokeWidth}
              min={0}
              max={1000}
              onCommit={(strokeWidth) =>
                onChange({
                  strokeWidth,
                  stroke: part.stroke === "none" ? "#eeeeee" : part.stroke,
                })
              }
            />
          </label>
          <label>
            Join
            <select
              aria-label="Outline join"
              value={part.lineJoin}
              onChange={(e) =>
                onChange({ lineJoin: e.target.value as Part["lineJoin"] })
              }
            >
              <option value="miter">Miter</option>
              <option value="round">Round</option>
              <option value="bevel">Bevel</option>
            </select>
          </label>
        </>
      )}
      {part.kind !== "image" && (
        <label>
          Opacity
          <Draft
            label="Shape opacity"
            value={Math.round(part.opacity * 100)}
            min={0}
            max={100}
            onCommit={(n) => onChange({ opacity: n / 100 })}
          />
          <span>%</span>
        </label>
      )}
    </details>
  );
}
