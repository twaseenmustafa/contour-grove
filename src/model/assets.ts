import {
  validateProject,
  defaultShadow,
  identity,
  multiply,
  parseTransform,
  type Asset,
  type Project,
  type Part,
} from "./project";
import { identifier } from "./organization";
import { adjustmentText, type Point } from "./transform";
export const ASSET_DRAG_TYPE = "application/x-logo-workshop-asset";
export function vectorAsset(source: Project, name = source.source.name): Asset {
  if (source.parts.some((p) => p.kind === "image"))
    throw Error("Vector templates cannot contain reference images.");
  return {
    id: "asset-draft",
    name: name.slice(0, 120),
    kind: "vector",
    viewBox: [...source.viewBox],
    parts: source.parts.map((p) => ({
      ...structuredClone(p),
      groupId: undefined,
      assetId: undefined,
    })),
  };
}
export function appendAssets(
  project: Project,
  drafts: Asset[],
): { project: Project; ids: string[] } {
  if (!drafts.length) throw Error("Choose at least one SVG, PNG or JPG.");
  const used = new Set((project.assets ?? []).map((a) => a.id));
  const assets = drafts.map((a) => ({
    ...structuredClone(a),
    id: identifier("asset", used),
  }));
  return {
    project: validateProject({
      ...project,
      assets: [...(project.assets ?? []), ...assets],
    }),
    ids: assets.map((a) => a.id),
  };
}
export function removeAsset(project: Project, id: string): Project {
  if (project.parts.some((p) => p.assetId === id))
    throw Error(
      "Remove this image's canvas copies before removing it from Assets.",
    );
  return validateProject({
    ...project,
    assets: (project.assets ?? []).filter((a) => a.id !== id),
  });
}
export function placeAsset(
  project: Project,
  id: string,
  point?: Point,
): { project: Project; ids: string[] } {
  const asset = project.assets?.find((a) => a.id === id);
  if (!asset)
    throw Error("This asset is no longer in the library. Add it again.");
  const [x, y, w, h] = project.viewBox,
    center = point ?? { x: x + w / 2, y: y + h / 2 };
  if (
    ![center.x, center.y].every((n) => Number.isFinite(n) && Math.abs(n) <= 1e6)
  )
    throw Error("Drop closer to the canvas.");
  const [sx, sy, sw, sh] =
    asset.kind === "vector" ? asset.viewBox : [0, 0, asset.width, asset.height];
  const scale = Math.min((w * 0.55) / sw, (h * 0.55) / sh),
    tx = center.x - (sx + sw / 2) * scale,
    ty = center.y - (sy + sh / 2) * scale;
  const used = new Set(project.parts.map((p) => p.id)),
    groupIds = new Set((project.groups ?? []).map((g) => g.id));
  const templates: Part[] =
    asset.kind === "vector"
      ? asset.parts
      : [
          {
            id: "image-draft",
            name: asset.name,
            kind: "image",
            assetId: asset.id,
            group: "Reference image",
            geometry: {
              x: "0",
              y: "0",
              width: String(asset.width),
              height: String(asset.height),
            },
            matrix: [...identity],
            x: 0,
            y: 0,
            fill: "none",
            stroke: "none",
            strokeWidth: 0,
            opacity: 1,
            fillRule: "nonzero",
            lineCap: "round",
            lineJoin: "round",
            shadow: defaultShadow(),
          },
        ];
  const group =
    templates.length > 1
      ? { id: identifier("placement", groupIds), name: asset.name.slice(0, 80) }
      : null;
  const added = templates.map((p) => {
    const placed = multiply(
      [scale, 0, 0, scale, tx, ty],
      multiply(
        [1, 0, 0, 1, p.x, p.y],
        multiply(parseTransform(adjustmentText(p.adjustment)), p.matrix),
      ),
    );
    return {
      ...structuredClone(p),
      id: identifier("placed", used),
      group:
        asset.kind === "vector"
          ? asset.name
          : "Reference image · " + asset.name,
      matrix: placed,
      x: 0,
      y: 0,
      adjustment: undefined,
      groupId: group?.id,
      hidden: false,
      locked: false,
    };
  });
  return {
    project: validateProject({
      ...project,
      parts: [...project.parts, ...added],
      groups: [...(project.groups ?? []), ...(group ? [group] : [])],
    }),
    ids: added.map((p) => p.id),
  };
}
