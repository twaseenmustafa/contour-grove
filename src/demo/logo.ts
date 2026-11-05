import {
  defaultShadow,
  identity,
  type Project,
  type Part,
} from "../model/project";
export function demoProject(): Project {
  const d =
    "M240 228 C197 199 174 155 192 129 C217 98 253 121 256 153 C258 177 250 209 240 228Z";
  const parts: Part[] = Array.from({ length: 5 }, (_, i) => {
    const r = (i * 72 * Math.PI) / 180,
      c = Math.cos(r),
      s = Math.sin(r);
    return {
      id: `petal-${i + 1}`,
      name: `Petal ${i + 1}`,
      group: "Bloom demo",
      kind: "path",
      geometry: { d },
      matrix: [c, s, -s, c, 240 - c * 240 + s * 240, 240 - s * 240 - c * 240],
      x: 0,
      y: 0,
      fill: ["#eeeeee", "#cccccc", "#a3a3a3", "#dedede", "#818181"][i],
      stroke: "none",
      strokeWidth: 0,
      opacity: 1,
      fillRule: "nonzero",
      lineCap: "round",
      lineJoin: "round",
      shadow: defaultShadow(),
    };
  });
  parts.push({
    ...parts[0],
    id: "center",
    name: "Center",
    kind: "circle",
    geometry: { cx: "240", cy: "240", r: "22" },
    matrix: [...identity],
    fill: "#202020",
  });
  return {
    schemaVersion: 1,
    name: "Bloom study",
    source: { name: "Built-in editable demo", text: "" },
    viewBox: [80, 80, 320, 320],
    background: null,
    parts,
  };
}
