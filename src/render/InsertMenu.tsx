import StudioMenu from "./StudioMenu";
import type { ShapeKind } from "../commands/document";
const shapes: [ShapeKind, string, string][] = [
  ["rectangle", "Rectangle", "M5 5h14v14H5z"],
  ["ellipse", "Ellipse", "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18"],
  ["triangle", "Triangle", "m12 3 10 18H2z"],
  ["star", "Star", "m12 2 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z"],
  ["line", "Line", "M4 20 20 4"],
];
export default function InsertMenu({
  onCreate,
  onCreateText,
  onUpload,
}: {
  onCreate: (shape: ShapeKind) => void;
  onCreateText: () => void;
  onUpload: () => void;
}) {
  return (
    <>
      <StudioMenu
        label="Add"
        className="insert-menu"
        primary
        icon={
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        }
      >
        <div className="insert-heading">Add</div>
        <button onClick={onCreateText} aria-label="Create text">
          Add text
        </button>
        <button onClick={onUpload}>Upload image or SVG</button>
      </StudioMenu>
      <StudioMenu
        label="Shapes"
        className="shapes-menu"
        icon={
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="8" width="11" height="11" rx="1" />
            <circle cx="16.5" cy="8" r="4.5" />
          </svg>
        }
      >
        <div className="insert-heading">Shapes</div>
        <div className="insert-shapes">
          {shapes.map(([kind, label, path]) => (
            <button
              key={kind}
              onClick={() => onCreate(kind)}
              aria-label={`Create ${label.toLowerCase()}`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                aria-hidden="true"
              >
                <path d={path} />
              </svg>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </StudioMenu>
    </>
  );
}
