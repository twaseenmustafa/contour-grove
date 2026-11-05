import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Part } from "../model/project";
import { frame, rotatedPart, sizedPart, type Bounds } from "../model/transform";
function NumberField({
  label,
  value,
  onCommit,
  disabled = false,
  suffix,
}: {
  label: string;
  value: number;
  onCommit: (n: number) => void;
  disabled?: boolean;
  suffix?: string;
}) {
  const display = (n: number) => String(Math.round(n * 100) / 100);
  const skipBlur = useRef(false);
  const [draft, setDraft] = useState(display(value));
  useEffect(() => setDraft(display(value)), [value]);
  function submit() {
    if (skipBlur.current) {
      skipBlur.current = false;
      return;
    }
    const number = Number(draft);
    if (!draft.trim() || !Number.isFinite(number)) {
      setDraft(display(value));
      return;
    }
    onCommit(number);
    setDraft(display(value));
  }
  function key(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") {
      skipBlur.current = true;
      setDraft(display(value));
      e.currentTarget.blur();
    }
  }
  return (
    <label className="transform-field">
      <span className="field-label">
        {label === "Width" ? "W" : label === "Height" ? "H" : label}
      </span>
      <span>
        <input
          aria-label={label}
          type="number"
          step="any"
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={submit}
          onKeyDown={key}
        />
        {suffix && <span className="field-suffix">{suffix}</span>}
      </span>
    </label>
  );
}
export default function TransformControls({
  part,
  bounds,
  locked,
  onLock,
  onChange,
  onError,
}: {
  part: Part;
  bounds: Bounds;
  locked: boolean;
  onLock: (locked: boolean) => void;
  onChange: (edit: Partial<Part>) => void;
  onError: (text: string) => void;
}) {
  const f = frame(part, bounds),
    canResize = bounds.width > 1e-6 && bounds.height > 1e-6;
  function resize(dimension: "width" | "height", value: number) {
    try {
      onChange({
        adjustment: sizedPart(part, bounds, dimension, value, locked)
          .adjustment,
      });
    } catch (e) {
      onError(
        e instanceof Error ? e.message : "That size could not be applied.",
      );
    }
  }
  return (
    <section
      className="inspector-section transform-section"
      aria-label="Size and rotation"
    >
      <div className="transform-title">
        <h3 className="sr-only">Size &amp; rotation</h3>
      </div>
      <div className="two-fields">
        <NumberField
          label="Width"
          value={f.width}
          disabled={!canResize}
          onCommit={(n) => resize("width", n)}
        />
        <NumberField
          label="Height"
          value={f.height}
          disabled={!canResize}
          onCommit={(n) => resize("height", n)}
        />
      </div>
      <label className="proportion-toggle">
        <input
          type="checkbox"
          checked={locked}
          onChange={(e) => onLock(e.target.checked)}
        />
        <span>Keep proportions</span>
        <span aria-hidden="true" className="link-glyph">
          {locked ? "↔" : "⇥"}
        </span>
      </label>
      <NumberField
        label="Rotation"
        value={f.rotation}
        suffix="°"
        onCommit={(n) =>
          onChange({ adjustment: rotatedPart(part, bounds, n).adjustment })
        }
      />
      <div className="rotation-presets">
        <button
          aria-label="Rotate left 15 degrees"
          onClick={() =>
            onChange({
              adjustment: rotatedPart(part, bounds, f.rotation - 15).adjustment,
            })
          }
        >
          ↶ 15°
        </button>
        <button
          aria-label="Rotate right 15 degrees"
          onClick={() =>
            onChange({
              adjustment: rotatedPart(part, bounds, f.rotation + 15).adjustment,
            })
          }
        >
          ↷ 15°
        </button>
        <button onClick={() => onChange({ adjustment: undefined })}>
          Reset size &amp; angle
        </button>
      </div>
      {!canResize && (
        <p className="transform-help">
          This shape has no measurable width or height. Move or rotate it
          instead.
        </p>
      )}
    </section>
  );
}
