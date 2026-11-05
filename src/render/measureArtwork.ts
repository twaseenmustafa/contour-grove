import { createLogoSVG } from "../export/logo";
import type { Project } from "../model/project";
import type { Bounds } from "../model/transform";

/** Measure transformed geometry without selection overlays or shadow filters. */
export function measureArtwork(project: Project): Bounds[] {
  const svg = createLogoSVG(project, { effects: false, background: false });
  svg.setAttribute("aria-hidden", "true");
  Object.assign(svg.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "100px",
    height: "100px",
    pointerEvents: "none",
    visibility: "hidden",
  });
  document.body.append(svg);
  try {
    const root = svg.getScreenCTM();
    if (!root) throw Error("Artwork measurement is unavailable.");
    const boxes: Bounds[] = [];
    for (const wrapper of svg.querySelectorAll<SVGGElement>("[data-part]")) {
      const part = project.parts.find((p) => p.id === wrapper.dataset.part)!;
      if (
        part.opacity === 0 ||
        (part.kind !== "image" &&
          part.fill.toLowerCase() === "none" &&
          (part.stroke.toLowerCase() === "none" || !part.strokeWidth))
      )
        continue;
      const b = wrapper.getBBox();
      let pad = 0;
      if (part.stroke.toLowerCase() !== "none" && part.strokeWidth > 0) {
        const shape = wrapper.querySelector<SVGGraphicsElement>(
            "[data-geometry] > *",
          ),
          m = shape?.getScreenCTM();
        if (!m) throw Error("Could not measure the outline.");
        const t = root.inverse().multiply(m);
        // Frobenius norm bounds any directional scale. Default SVG miter limit is 4.
        pad =
          (part.strokeWidth / 2) *
          Math.hypot(t.a, t.b, t.c, t.d) *
          (part.lineJoin === "miter" ? 4 : 1);
      }
      boxes.push({
        x: b.x - pad,
        y: b.y - pad,
        width: b.width + pad * 2,
        height: b.height + pad * 2,
      });
    }
    return boxes;
  } finally {
    svg.remove();
  }
}
