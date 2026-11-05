import { useEffect, useLayoutEffect, useState } from "react";
import { hasTextControls, type Part, type TextData } from "../model/project";
export default function TextControls({
  part,
  onChange,
  onError,
}: {
  part: Part;
  onChange: (data: TextData) => void;
  onError: (message: string) => void;
}) {
  const data = part.textData!;
  const [value, setValue] = useState(data.value),
    [size, setSize] = useState(String(data.size)),
    [spacing, setSpacing] = useState(String(data.letterSpacing ?? 0));
  useEffect(() => {
    setValue(data.value);
    setSize(String(data.size));
    setSpacing(String(data.letterSpacing ?? 0));
  }, [part.id, data.value, data.size, data.letterSpacing]);
  useLayoutEffect(() => {
    const canvas = document.querySelector<HTMLElement>(".canvas-host");
    const group = Array.from(
      canvas?.querySelectorAll<SVGGElement>("[data-part]") ?? [],
    ).find((el) => el.dataset.part === part.id);
    const text = group?.querySelector<SVGTextElement>("[data-geometry] text");
    if (!text) return;
    text.textContent = value;
    canvas?.dispatchEvent(new Event("logo-text-preview"));
    return () => {
      if (text.isConnected) {
        text.textContent = data.value;
        canvas?.dispatchEvent(new Event("logo-text-preview"));
      }
    };
  }, [part.id, data.value, value]);
  function commitText() {
    if (!value.trim() || hasTextControls(value)) {
      setValue(data.value);
      onError("Enter a single line of text.");
      return;
    }
    if (value !== data.value) onChange({ ...data, value });
  }
  function commitSize() {
    const n = Number(size);
    if (!Number.isFinite(n) || n < 6 || n > 1000) {
      setSize(String(data.size));
      onError("Text size must be between 6 and 1000.");
      return;
    }
    if (n !== data.size) onChange({ ...data, size: n });
  }
  function commitSpacing() {
    const n = Number(spacing);
    if (spacing.trim() === "" || !Number.isFinite(n) || n < -200 || n > 200) {
      setSpacing(String(data.letterSpacing ?? 0));
      onError("Letter spacing must be between -200 and 200.");
      return;
    }
    if (n !== (data.letterSpacing ?? 0))
      onChange({ ...data, letterSpacing: n });
  }
  return (
    <section className="control-section text-controls">
      <h3>Text</h3>
      <label>
        Words
        <input
          aria-label="Text"
          value={value}
          maxLength={200}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setValue(data.value);
              e.preventDefault();
            }
          }}
        />
      </label>
      <label>
        Font
        <select
          aria-label="Font"
          value={data.font}
          onChange={(e) =>
            onChange({ ...data, font: e.target.value as TextData["font"] })
          }
        >
          <option value="sans-serif">Sans serif</option>
          <option value="serif">Serif</option>
          <option value="monospace">Monospace</option>
          <option value="Arial">Arial</option>
          <option value="Georgia">Georgia</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Verdana">Verdana</option>
          <option value="Courier New">Courier New</option>
        </select>
      </label>
      <label>
        Size
        <input
          aria-label="Text size"
          type="number"
          min="6"
          max="1000"
          value={size}
          onChange={(e) => setSize(e.target.value)}
          onBlur={commitSize}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      </label>
      <label>
        Letter spacing
        <input
          aria-label="Letter spacing"
          type="number"
          min="-200"
          max="200"
          step="0.1"
          value={spacing}
          onChange={(e) => setSpacing(e.target.value)}
          onBlur={commitSpacing}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setSpacing(String(data.letterSpacing ?? 0));
              e.preventDefault();
            }
          }}
        />
      </label>
      <label className="text-bold">
        <input
          type="checkbox"
          checked={data.bold}
          onChange={(e) => onChange({ ...data, bold: e.target.checked })}
        />{" "}
        Bold
      </label>
      <label className="text-bold">
        <input
          type="checkbox"
          checked={data.italic ?? false}
          onChange={(e) => onChange({ ...data, italic: e.target.checked })}
        />{" "}
        Italic
      </label>
      <p>
        Fonts may look different on another device. Save the project to keep
        text editable.
      </p>
    </section>
  );
}
