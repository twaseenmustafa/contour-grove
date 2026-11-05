import type { SurfaceFinish } from "../model/project";
const NS = "http://www.w3.org/2000/svg";
function el(tag: string, attrs: Record<string, string | number> = {}) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}
/** Fixed seed, fixed six-step depth and no external resources or arbitrary filter code. */
export function finishFilter(
  id: string,
  finish: SurfaceFinish,
  box: number[],
  pad: number,
) {
  const f = el("filter", {
    id,
    filterUnits: "userSpaceOnUse",
    x: box[0] - pad,
    y: box[1] - pad,
    width: box[2] + pad * 2,
    height: box[3] + pad * 2,
    "color-interpolation-filters": "sRGB",
  });
  let surface = "SourceGraphic";
  if (finish.grain > 0) {
    f.append(
      el("feTurbulence", {
        type: "fractalNoise",
        baseFrequency: ".6",
        numOctaves: 2,
        seed: 17,
        stitchTiles: "stitch",
        result: "noise",
      }),
    );
    f.append(
      el("feColorMatrix", {
        in: "noise",
        type: "saturate",
        values: 0,
        result: "grayNoise",
      }),
    );
    const transfer = el("feComponentTransfer", {
      in: "grayNoise",
      result: "grainNoise",
    });
    for (const channel of ["R", "G", "B"])
      transfer.append(
        el("feFunc" + channel, {
          type: "linear",
          slope: finish.grain,
          intercept: 0.5 * (1 - finish.grain),
        }),
      );
    transfer.append(el("feFuncA", { type: "linear", slope: 0, intercept: 1 }));
    f.append(transfer);
    f.append(
      el("feBlend", {
        in: "grainNoise",
        in2: "SourceGraphic",
        mode: "soft-light",
        result: "grainBlend",
      }),
    );
    f.append(
      el("feComposite", {
        in: "grainBlend",
        in2: "SourceAlpha",
        operator: "in",
        result: "surface",
      }),
    );
    surface = "surface";
  }
  if (finish.depth > 0) {
    f.append(
      el("feFlood", { "flood-color": finish.color, result: "depthColor" }),
    );
    f.append(
      el("feComposite", {
        in: "depthColor",
        in2: "SourceAlpha",
        operator: "in",
        result: "depthPaint",
      }),
    );
    const radians = (finish.angle * Math.PI) / 180;
    for (let i = 1; i <= 6; i++)
      f.append(
        el("feOffset", {
          in: "depthPaint",
          dx: Number(((Math.cos(radians) * finish.depth * i) / 6).toFixed(4)),
          dy: Number(((Math.sin(radians) * finish.depth * i) / 6).toFixed(4)),
          result: `depth${i}`,
        }),
      );
    const merge = el("feMerge");
    for (let i = 6; i >= 1; i--)
      merge.append(el("feMergeNode", { in: `depth${i}` }));
    merge.append(el("feMergeNode", { in: surface }));
    f.append(merge);
  }
  return f;
}
