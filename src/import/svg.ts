import {
  defaultShadow,
  identity,
  geometryKeys,
  isPaint,
  multiply,
  parseTransform,
  validateProject,
  type Project,
  type Part,
  type Kind,
  type Matrix,
} from "../model/project";
const NS = "http://www.w3.org/2000/svg";
const appearance = [
  "fill",
  "stroke",
  "stroke-width",
  "opacity",
  "fill-rule",
  "stroke-linecap",
  "stroke-linejoin",
];
const inherited = [
  "fill",
  "stroke",
  "stroke-width",
  "fill-rule",
  "stroke-linecap",
  "stroke-linejoin",
];
export function importSVG(text: string, filename: string): Project {
  if (text.length > 2e6) throw Error("Please use an SVG smaller than 2 MB.");
  if (/<!DOCTYPE|<!ENTITY|<\?/i.test(text.replace(/^\s*<\?xml[^?]*\?>/i, "")))
    throw Error(
      "Document declarations and processing instructions are not supported.",
    );
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  if (doc.querySelector("parsererror"))
    throw Error("This SVG is not valid XML.");
  const root = doc.documentElement;
  if (root.localName !== "svg" || root.namespaceURI !== NS)
    throw Error("Please choose an SVG logo.");
  const all = [root, ...root.querySelectorAll("*")];
  if (all.length > 1200)
    throw Error("This SVG is too complex for the first version.");
  for (const el of all) {
    for (const a of el.attributes) {
      if (
        /^on/i.test(a.name) ||
        /href$/i.test(a.name) ||
        /url\s*\(|javascript:|data:/i.test(a.value)
      )
        throw Error(
          "External resources and active SVG content are not allowed.",
        );
    }
  }
  const nums = (root.getAttribute("viewBox") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const length = (s: string | null) =>
    s && /^\d+(\.\d+)?(px)?$/.test(s) ? Number(s.replace("px", "")) : NaN;
  const vb =
    nums.length === 4 && nums.every(Number.isFinite)
      ? nums
      : [
          0,
          0,
          length(root.getAttribute("width")),
          length(root.getAttribute("height")),
        ];
  if (!vb.every(Number.isFinite) || vb[2] <= 0 || vb[3] <= 0)
    throw Error("The SVG needs a valid viewBox or numeric width and height.");
  const parts: Part[] = [];
  function visit(
    el: Element,
    parent: Matrix,
    paint: Record<string, string>,
    group: string,
    depth: number,
  ) {
    if (depth > 30) throw Error("Too many nested groups.");
    if (el.namespaceURI !== NS)
      throw Error("Foreign SVG elements are not supported.");
    const tag = el.localName;
    if (["title", "desc", "metadata"].includes(tag)) return;
    const container = tag === "g" || el === root;
    if (tag === "image" || (!container && !Object.hasOwn(geometryKeys, tag)))
      throw Error(
        `“${tag}” is not supported yet. Use paths or basic shapes; convert text to paths first.`,
      );
    const allowed = new Set([
      "id",
      "transform",
      "style",
      ...appearance,
      ...(container ? [] : geometryKeys[tag as Kind]),
      ...(el === root
        ? [
            "xmlns",
            "xmlns:xlink",
            "viewBox",
            "width",
            "height",
            "version",
            "preserveAspectRatio",
          ]
        : []),
    ]);
    for (const a of el.attributes) {
      if (!allowed.has(a.name))
        throw Error(
          `Attribute “${a.name}” is not supported yet. Your current work is unchanged.`,
        );
    }
    if (
      el === root &&
      el.hasAttribute("preserveAspectRatio") &&
      !["xMidYMid meet", "xMidYMid"].includes(
        el.getAttribute("preserveAspectRatio")!,
      )
    )
      throw Error("This SVG uses unsupported aspect-ratio settings.");
    const local: Record<string, string> = {};
    for (const key of appearance)
      if (el.hasAttribute(key)) local[key] = el.getAttribute(key)!;
    for (const item of (el.getAttribute("style") ?? "").split(";")) {
      if (!item.trim()) continue;
      const at = item.indexOf(":");
      const k = item.slice(0, at).trim(),
        v = item.slice(at + 1).trim();
      if (at < 0 || !appearance.includes(k))
        throw Error("Only simple fill and outline styles are supported yet.");
      local[k] = v;
    }
    for (const key of ["fill", "stroke"])
      if (
        local[key] &&
        (!isPaint(local[key]) ||
          (local[key] !== "none" && !CSS.supports("color", local[key])))
      )
        throw Error("Use solid colors in this first version.");
    const styles = { ...paint, ...local };
    const opacity = Number(local.opacity ?? 1);
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
      throw Error("Invalid opacity.");
    if (container && opacity !== 1)
      throw Error(
        "Group transparency is not supported yet; use per-shape opacity.",
      );
    const matrix = multiply(
      parent,
      parseTransform(el.getAttribute("transform") ?? ""),
    );
    if (container) {
      const next = Object.fromEntries(inherited.map((k) => [k, styles[k]]));
      const label = el === root ? "" : (el.getAttribute("id") ?? "Group");
      for (const child of el.children)
        visit(
          child,
          matrix,
          next,
          [group, label].filter(Boolean).join(" / "),
          depth + 1,
        );
      return;
    }
    if (el.children.length)
      throw Error("Nested shape content is not supported.");
    const geometry: Record<string, string> = {};
    for (const key of geometryKeys[tag as Kind])
      if (el.hasAttribute(key)) geometry[key] = el.getAttribute(key)!;
    parts.push({
      id: `part-${parts.length + 1}`,
      name: (el.getAttribute("id") ?? `Part ${parts.length + 1}`).slice(0, 100),
      group: group.slice(0, 500),
      kind: tag as Kind,
      geometry,
      matrix,
      x: 0,
      y: 0,
      fill: styles.fill,
      stroke: styles.stroke,
      strokeWidth: Number(styles["stroke-width"]),
      opacity,
      fillRule: styles["fill-rule"] as Part["fillRule"],
      lineCap: styles["stroke-linecap"] as Part["lineCap"],
      lineJoin: styles["stroke-linejoin"] as Part["lineJoin"],
      shadow: defaultShadow(),
    });
  }
  visit(
    root,
    [...identity],
    {
      fill: "#000000",
      stroke: "none",
      "stroke-width": "1",
      "fill-rule": "nonzero",
      "stroke-linecap": "butt",
      "stroke-linejoin": "miter",
    },
    "",
    0,
  );
  return validateProject({
    schemaVersion: 1,
    name: filename.replace(/\.svg$/i, "").slice(0, 120),
    source: { name: filename.slice(0, 200), text },
    viewBox: vb,
    background: null,
    parts,
  });
}
