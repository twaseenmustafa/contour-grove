import { finishFilter } from "./finish";
import { validateProject, type Project } from "../model/project";
import { adjustmentText } from "../model/transform";
const NS = "http://www.w3.org/2000/svg";
function element(tag: string, attrs: Record<string, string | number> = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}
export interface RenderOptions {
  effects: boolean;
  background: boolean;
}
export const defaultOptions: RenderOptions = {
  effects: true,
  background: true,
};
export function createLogoSVG(
  input: Project,
  options: RenderOptions = defaultOptions,
): SVGSVGElement {
  const p = validateProject(input);
  const [x, y, w, h] = p.viewBox;
  const pad = options.effects
    ? Math.ceil(
        Math.max(
          0,
          ...p.parts
            .filter((a) => !a.hidden)
            .map(
              (a) =>
                (a.shadow.enabled
                  ? Math.max(Math.abs(a.shadow.dx), Math.abs(a.shadow.dy)) +
                    a.shadow.blur * 4
                  : 0) + (a.finish?.depth ?? 0),
            ),
        ),
      )
    : 0;
  const vb = [x - pad, y - pad, w + pad * 2, h + pad * 2];
  const svg = element("svg", {
    xmlns: NS,
    viewBox: vb.join(" "),
    width: vb[2],
    height: vb[3],
    role: "img",
    "aria-label": p.name,
  }) as SVGSVGElement;
  const defs = element("defs");
  svg.append(defs);
  if (options.background && p.background)
    svg.append(
      element("rect", {
        x: vb[0],
        y: vb[1],
        width: vb[2],
        height: vb[3],
        fill: p.background,
      }),
    );
  for (const a of p.parts) {
    if (a.hidden) continue;
    const wrapper = element("g", {
      "data-part": a.id,
      ...(a.locked ? { "data-locked": "true" } : {}),
    });
    if (options.effects && a.shadow.enabled) {
      const s = a.shadow;
      const id = `shadow-${a.id}`;
      const f = element("filter", {
        id,
        filterUnits: "userSpaceOnUse",
        x: vb[0] - pad,
        y: vb[1] - pad,
        width: vb[2] + 2 * pad,
        height: vb[3] + 2 * pad,
        "color-interpolation-filters": "sRGB",
      });
      f.append(
        element("feDropShadow", {
          dx: s.dx,
          dy: s.dy,
          stdDeviation: s.blur,
          "flood-color": s.color,
          "flood-opacity": s.opacity,
        }),
      );
      defs.append(f);
      wrapper.setAttribute("filter", `url(#${id})`);
    }
    const translate = element("g", {
      "data-translation": "true",
      transform: `translate(${a.x} ${a.y})`,
    });
    const shape = element(a.kind, {
      ...a.geometry,
      ...(a.kind === "text" && a.textData
        ? {
            "font-family": a.textData.font,
            "font-size": a.textData.size,
            "font-weight": a.textData.bold ? "bold" : "normal",
            "font-style": a.textData.italic ? "italic" : "normal",
            "letter-spacing": a.textData.letterSpacing ?? 0,
          }
        : {}),
      ...(a.kind === "image"
        ? {
            href: (
              p.assets!.find(
                (asset) => asset.id === a.assetId && asset.kind === "image",
              ) as Extract<import("../model/project").Asset, { kind: "image" }>
            ).dataURL,
            preserveAspectRatio: "xMidYMid meet",
          }
        : {}),
      transform: `matrix(${a.matrix.join(" ")})`,
      fill: a.fill,
      stroke: a.stroke,
      "stroke-width": a.strokeWidth,
      opacity: a.opacity,
      "fill-rule": a.fillRule,
      "stroke-linecap": a.lineCap,
      "stroke-linejoin": a.lineJoin,
    });
    if (a.kind === "text" && a.textData) shape.textContent = a.textData.value;
    const adjustment = element("g", {
      "data-adjustment": "true",
      transform: adjustmentText(a.adjustment),
    });
    const geometry = element("g", { "data-geometry": "true" });
    geometry.append(shape);
    adjustment.append(geometry);
    translate.append(adjustment);
    if (
      options.effects &&
      a.finish &&
      (a.finish.grain > 0 || a.finish.depth > 0)
    ) {
      const id = `finish-${a.id}`;
      defs.append(finishFilter(id, a.finish, vb, pad));
      const surface = element("g", {
        filter: `url(#${id})`,
        "data-finish": "true",
      });
      surface.append(translate);
      wrapper.append(surface);
    } else wrapper.append(translate);
    svg.append(wrapper);
  }
  return svg;
}
export function svgText(
  p: Project,
  options: RenderOptions = defaultOptions,
): string {
  return new XMLSerializer().serializeToString(createLogoSVG(p, options));
}
export function filename(p: Project): string {
  return (
    p.name
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 70) || "logo"
  );
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export async function pngBlob(
  p: Project,
  options: RenderOptions = defaultOptions,
): Promise<Blob> {
  const svg = createLogoSVG(p, options);
  const box = svg.viewBox.baseVal;
  const width = 1600,
    height = Math.max(1, Math.round((width * box.height) / box.width));
  if (height > 8000)
    throw Error(
      "This canvas is too tall for PNG export. Use SVG or a more balanced canvas.",
    );
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(svg)], {
      type: "image/svg+xml;charset=utf-8",
    }),
  );
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const ctx = c.getContext("2d");
    if (!ctx) throw Error("Canvas rendering is unavailable.");
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise((resolve, reject) =>
      c.toBlob(
        (b) => (b ? resolve(b) : reject(Error("PNG export failed."))),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
