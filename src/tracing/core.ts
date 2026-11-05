import tracer from "imagetracerjs";
import {
  validTraceOptions,
  type TraceJob,
  type TraceResult,
  type TracedShape,
} from "./types";
interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}
interface Segment {
  type: "L" | "Q";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3?: number;
  y3?: number;
}
interface Contour {
  segments: Segment[];
  isholepath: boolean;
  holechildren: number[];
}
interface TraceData {
  layers: Contour[][];
  palette: Color[];
  width: number;
  height: number;
}
function clearLightEdges(
  data: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const seen = new Uint8Array(width * height),
    queue = new Int32Array(width * height);
  let read = 0,
    write = 0;
  const add = (p: number) => {
    if (seen[p]) return;
    seen[p] = 1;
    const i = p * 4;
    if (
      data[i + 3] < 32 ||
      (data[i] > 238 && data[i + 1] > 238 && data[i + 2] > 238)
    ) {
      queue[write++] = p;
      data[i + 3] = 0;
    }
  };
  for (let x = 0; x < width; x++) {
    add(x);
    add((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    add(y * width);
    add(y * width + width - 1);
  }
  while (read < write) {
    const p = queue[read++],
      x = p % width;
    if (x > 0) add(p - 1);
    if (x < width - 1) add(p + 1);
    if (p >= width) add(p - width);
    if (p + width < width * height) add(p + width);
  }
}
function paletteFor(data: Uint8ClampedArray, count: number): Color[] {
  const histogram = new Map<
    number,
    { n: number; r: number; g: number; b: number }
  >();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const key =
      (data[i] >> 4) * 256 + (data[i + 1] >> 4) * 16 + (data[i + 2] >> 4);
    let v = histogram.get(key);
    if (!v) {
      v = { n: 0, r: 0, g: 0, b: 0 };
      histogram.set(key, v);
    }
    v.n++;
    v.r += data[i];
    v.g += data[i + 1];
    v.b += data[i + 2];
  }
  const ordered = [...histogram.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[0] - b[0])
    .map(([, v]) => ({
      r: Math.round(v.r / v.n),
      g: Math.round(v.g / v.n),
      b: Math.round(v.b / v.n),
      a: 255,
    }));
  const colors: Color[] = [];
  for (const c of ordered) {
    if (
      colors.every(
        (v) =>
          Math.abs(v.r - c.r) + Math.abs(v.g - c.g) + Math.abs(v.b - c.b) > 55,
      )
    )
      colors.push(c);
    if (colors.length === count) break;
  }
  if (!colors.length)
    throw Error(
      "No visible shapes found. Try a different image or background setting.",
    );
  return [{ r: 0, g: 0, b: 0, a: 0 }, ...colors];
}
export function preparePixels(job: TraceJob): {
  data: Uint8ClampedArray;
  palette: Color[];
} {
  const { width, height, options } = job;
  if (
    !validTraceOptions(options) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 1024 ||
    height > 1024 ||
    width * height > 1_048_576 ||
    job.pixels.length !== width * height * 4
  )
    throw Error("Invalid or oversized tracing job.");
  const data = new Uint8ClampedArray(job.pixels);
  if (options.mode === "silhouette") {
    let visible = 0;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3] / 255,
        light =
          (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) *
            alpha +
          255 * (1 - alpha);
      const keep = light < options.threshold;
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = keep ? 255 : 0;
      if (keep) visible++;
    }
    if (!visible)
      throw Error(
        "No dark shapes found. Open More options and move Include lighter areas to the right, or try Multiple colors.",
      );
    return {
      data,
      palette: [
        { r: 0, g: 0, b: 0, a: 0 },
        { r: 0, g: 0, b: 0, a: 255 },
      ],
    };
  }
  if (options.removeBackground) clearLightEdges(data, width, height);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    } else data[i + 3] = 255;
  }
  return { data, palette: paletteFor(data, options.colors) };
}
function contourPath(contour: Contour): string {
  if (!contour.segments.length) return "";
  const number = (x: number) => {
    if (!Number.isFinite(x) || Math.abs(x) > 2048)
      throw Error("The tracer returned invalid coordinates.");
    return Math.round(x * 100) / 100;
  };
  const first = contour.segments[0];
  let d = `M${number(first.x1)} ${number(first.y1)}`;
  for (const s of contour.segments) {
    if (s.type === "L") d += `L${number(s.x2)} ${number(s.y2)}`;
    else if (s.type === "Q" && s.x3 !== undefined && s.y3 !== undefined)
      d += `Q${number(s.x2)} ${number(s.y2)} ${number(s.x3)} ${number(s.y3)}`;
    else throw Error("The tracer returned an unsupported curve.");
  }
  return d + "Z";
}
export function tracePixels(job: TraceJob): TraceResult {
  const started = performance.now();
  const { data, palette } = preparePixels(job);
  const tolerance = { smooth: 2, balanced: 1, detailed: 0.4 }[
    job.options.detail
  ];
  const td = tracer.imagedataToTracedata(
    { width: job.width, height: job.height, data },
    {
      pal: palette,
      numberofcolors: palette.length,
      colorsampling: 0,
      colorquantcycles: 1,
      mincolorratio: 0,
      layering: 0,
      pathomit: job.options.detail === "detailed" ? 4 : 12,
      ltres: tolerance,
      qtres: tolerance,
      rightangleenhance: true,
      blurradius: 0,
    },
  ) as TraceData;
  const shapes: TracedShape[] = [];
  let complexity = 0;
  for (let color = 0; color < td.layers.length; color++) {
    const rgba = td.palette[color];
    if (rgba.a < 128) continue;
    const layer = td.layers[color];
    for (const path of layer) {
      if (path.isholepath || !path.segments.length) continue;
      let d = contourPath(path);
      for (const hole of path.holechildren ?? []) {
        if (!layer[hole]) throw Error("Invalid traced hole.");
        d += contourPath(layer[hole]);
      }
      complexity += d.length;
      if (d.length > 200000 || complexity > 800000 || shapes.length >= 300)
        throw Error(
          "This image makes too many shapes. Use silhouette mode, fewer colors, or a simpler logo.",
        );
      const fill =
        "#" +
        [rgba.r, rgba.g, rgba.b]
          .map((n) => Math.round(n).toString(16).padStart(2, "0"))
          .join("");
      shapes.push({ d, fill, opacity: 1 });
    }
  }
  if (!shapes.length)
    throw Error(
      "No usable shapes remained. Try more detail or a different threshold.",
    );
  return {
    shapes,
    width: job.width,
    height: job.height,
    elapsedMs: Math.round(performance.now() - started),
  };
}
