import { useEffect, useRef, type ReactNode } from "react";
export default function StudioMenu({
  label,
  className,
  primary = false,
  icon,
  children,
}: {
  label: string;
  className: string;
  primary?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (
        ref.current?.open &&
        e.target instanceof Node &&
        !ref.current.contains(e.target)
      )
        ref.current.open = false;
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  return (
    <details
      ref={ref}
      className={`studio-menu ${className}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          ref.current!.open = false;
          ref.current?.querySelector("summary")?.focus();
        }
      }}
    >
      <summary
        className={primary ? "primary" : ""}
        aria-label={icon ? label : undefined}
        title={icon ? label : undefined}
      >
        {icon ?? label}
        <span aria-hidden="true">⌄</span>
      </summary>
      <div
        className="studio-menu-body"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button:not(:disabled)")) {
            ref.current!.open = false;
            ref.current?.querySelector("summary")?.focus();
          }
        }}
      >
        {children}
        {className === "file-menu" && (
          <p className="menu-caption">
            Private by design. Files stay on this device.
          </p>
        )}
      </div>
    </details>
  );
}
