import { useEffect, useRef, type ReactNode } from "react";
/** Native disclosure with an anchored, keyboard/touch-dismissable help panel. */
export default function QuickGuide({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  function place() {
    const el = ref.current;
    if (!el?.open) return;
    const summary = el.querySelector("summary")!;
    const top = Math.max(
      12,
      Math.min(
        summary.getBoundingClientRect().bottom + 8,
        window.innerHeight - 180,
      ),
    );
    el.style.setProperty("--guide-top", top + "px");
  }
  function close() {
    const el = ref.current;
    if (!el) return;
    el.open = false;
    el.querySelector("summary")?.focus();
  }
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      const el = ref.current;
      if (el?.open && e.target instanceof Node && !el.contains(e.target))
        el.open = false;
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, []);
  return (
    <details
      ref={ref}
      className="studio-help"
      onToggle={place}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          close();
        }
      }}
    >
      <summary>Guide &amp; shortcuts</summary>
      <div className="shortcut-grid">
        <div className="guide-panel-heading">
          <strong>Workspace guide</strong>
          <button onClick={close} aria-label="Close guide">
            ×
          </button>
        </div>
        {children}
      </div>
    </details>
  );
}
