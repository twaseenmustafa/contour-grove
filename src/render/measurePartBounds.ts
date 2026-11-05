import { createLogoSVG } from "../export/logo";
import type { Project } from "../model/project";
import type { Bounds } from "../model/transform";
/** Transformed geometric bounds only: no filter or editor-overlay inflation. */
export function measurePartBounds(project: Project): Map<string, Bounds> {
  const svg = createLogoSVG(project, { effects: false, background: false });
  svg.setAttribute("aria-hidden", "true");
  Object.assign(svg.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "100px",
    height: "100px",
    visibility: "hidden",
    pointerEvents: "none",
  });
  document.body.append(svg);
  try {
    return new Map(
      [...svg.querySelectorAll<SVGGElement>("[data-part]")].map((g) => {
        const b = g.getBBox();
        return [
          g.dataset.part!,
          { x: b.x, y: b.y, width: b.width, height: b.height },
        ];
      }),
    );
  } finally {
    svg.remove();
  }
}
