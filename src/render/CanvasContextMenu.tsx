import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import type { Part } from "../model/project";
import type { OrganizationAction } from "../model/organization";

type Item = {
  label: string;
  action: OrganizationAction;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
};
export default function CanvasContextMenu({
  x,
  y,
  parts,
  total,
  onSelectAll,
  onCut,
  onAction,
  onClose,
}: {
  x: number;
  y: number;
  parts: Part[];
  total: number;
  onSelectAll: () => void;
  onCut: () => void;
  onAction: (action: OrganizationAction) => void;
  onClose: (restoreFocus: boolean) => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const canEdit =
    parts.length > 0 && parts.every((p) => !p.locked && !p.hidden);
  const grouped = parts.some((p) => !!p.groupId);
  const p = parts[0];
  const canCut =
    parts.length === 1 &&
    canEdit &&
    !grouped &&
    p.kind !== "text" &&
    p.kind !== "image" &&
    !p.shadow.enabled &&
    !(p.finish && (p.finish.grain > 0 || p.finish.depth > 0)) &&
    (p.fill !== "none" || (p.stroke !== "none" && p.strokeWidth > 0)) &&
    JSON.stringify(p.geometry).length <= 80000;
  const items: Item[] = [
    {
      label: "Duplicate",
      action: "duplicate",
      shortcut: "Ctrl/⌘ D",
      disabled: !canEdit,
    },
    {
      label: "Group",
      action: "group",
      shortcut: "Ctrl/⌘ G",
      disabled: !canEdit || parts.length < 2,
    },
    {
      label: "Ungroup",
      action: "ungroup",
      shortcut: "Ctrl/⌘ ⇧ G",
      disabled: !canEdit || !grouped,
    },
    { label: "Bring to front", action: "front", disabled: !canEdit },
    { label: "Send to back", action: "back", disabled: !canEdit },
    {
      label: parts.some((p) => p.locked) ? "Unlock" : "Lock",
      action: parts.some((p) => p.locked) ? "unlock" : "lock",
      disabled: !parts.length,
    },
    {
      label: "Delete",
      action: "delete",
      shortcut: "Del",
      disabled: !canEdit,
      danger: true,
    },
  ];
  useLayoutEffect(() => {
    const el = menu.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
    (
      el.querySelector<HTMLButtonElement>("button:not(:disabled)") ?? el
    ).focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !el.contains(event.target))
        onClose(false);
    };
    const blur = (event: FocusEvent) => {
      if (event.target instanceof Node && !el.contains(event.target))
        onClose(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", blur);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", blur);
    };
  }, [x, y, onClose]);
  function key(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(
      menu.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ) ?? [],
    );
    if (!buttons.length) return;
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const n =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (i + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
            buttons.length;
    buttons[n].focus();
  }
  return (
    <div
      ref={menu}
      className="canvas-context-menu"
      tabIndex={-1}
      role="menu"
      aria-label="Canvas actions"
      onKeyDown={key}
    >
      <div className="context-heading">
        {parts.length === 0
          ? "Canvas"
          : parts.length === 1
            ? "Selected layer"
            : `${parts.length} selected layers`}
      </div>
      <button role="menuitem" disabled={!total} onClick={onSelectAll}>
        <span>Select all</span>
      </button>
      <button role="menuitem" disabled={!canCut} onClick={onCut}>
        <span>Cut with scissors</span>
      </button>
      {items.map((item) => (
        <button
          key={item.action}
          role="menuitem"
          disabled={item.disabled}
          className={item.danger ? "is-danger" : undefined}
          onClick={() => onAction(item.action)}
        >
          <span>{item.label}</span>
          {item.shortcut && <kbd>{item.shortcut}</kbd>}
        </button>
      ))}
    </div>
  );
}
