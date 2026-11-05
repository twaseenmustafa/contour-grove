import engine from "paper/dist/paper-core";
import type { Part } from "../model/project";
import type { GeometryJob, GeometryResult, NodePath } from "./types";
function numeric(g: Record<string, string>, key: string, defaultValue = 0) {
  return g[key] === undefined ? defaultValue : Number(g[key]);
}
/** Paper core only. Never import SVG markup, PaperScript, URLs or user-supplied executable code. */
export function runGeometry(job: GeometryJob): GeometryResult {
  const scope = new engine.PaperScope();
  scope.setup(new scope.Size(1, 1));
  scope.view.autoUpdate = false;
  try {
    const make = (part: Part): paper.PathItem => {
      const g = part.geometry,
        n = (key: string, d = 0) => numeric(g, key, d);
      let item: paper.PathItem;
      if (part.kind === "path") item = scope.PathItem.create(g.d);
      else if (part.kind === "rect")
        item = new scope.Path.Rectangle({
          rectangle: new scope.Rectangle(
            n("x"),
            n("y"),
            n("width"),
            n("height"),
          ),
          radius: new scope.Size(n("rx", n("ry")), n("ry", n("rx"))),
          insert: false,
        });
      else if (part.kind === "circle")
        item = new scope.Path.Circle({
          center: new scope.Point(n("cx"), n("cy")),
          radius: n("r"),
          insert: false,
        });
      else if (part.kind === "ellipse")
        item = new scope.Path.Ellipse({
          rectangle: new scope.Rectangle(
            n("cx") - n("rx"),
            n("cy") - n("ry"),
            n("rx") * 2,
            n("ry") * 2,
          ),
          insert: false,
        });
      else if (part.kind === "polygon" || part.kind === "polyline") {
        const v = g.points
          .trim()
          .split(/[\s,]+/)
          .map(Number);
        item = new scope.Path({
          segments: Array.from(
            { length: v.length / 2 },
            (_, i) => new scope.Point(v[i * 2], v[i * 2 + 1]),
          ),
          closed: part.kind === "polygon",
          insert: false,
        });
      } else if (part.kind === "line")
        item = new scope.Path({
          segments: [
            [n("x1"), n("y1")],
            [n("x2"), n("y2")],
          ],
          insert: false,
        });
      else
        throw Error(
          "Images cannot be converted into editable path geometry. Trace the reference first.",
        );
      item.fillRule = part.fillRule;
      item.transform(new scope.Matrix(...part.matrix));
      const a = part.adjustment;
      if (a) {
        const center = new scope.Point(a.cx, a.cy);
        item.scale(a.scaleX, a.scaleY, center);
        item.rotate(a.rotation, center);
      }
      item.translate(new scope.Point(part.x, part.y));
      return item;
    };
    let result = make(job.parts[0]);
    const paths = (item: paper.PathItem): paper.Path[] =>
      item instanceof scope.CompoundPath
        ? (item.children as paper.Path[])
        : [item as paper.Path];
    function bounded(item: paper.PathItem) {
      const p = paths(item);
      if (p.reduce((sum, x) => sum + x.segments.length, 0) > 4000)
        throw Error(
          "This path has too many nodes for an interactive operation.",
        );
      for (const path of p)
        for (const segment of path.segments)
          for (const point of [
            segment.point,
            segment.handleIn,
            segment.handleOut,
          ])
            if (
              ![point.x, point.y].every(
                (n) => Number.isFinite(n) && Math.abs(n) <= 1e6,
              )
            )
              throw Error("Geometry exceeds safe coordinates.");
    }
    bounded(result);
    if (job.type === "slice") {
      const list = paths(result);
      if (!list.length || list.some((path) => !path.closed))
        throw Error("Drag across a closed shape to cut it.");
      if (
        ![job.x, job.y, job.x2, job.y2].every(
          (n) => Number.isFinite(n) && Math.abs(n) <= 1e6,
        )
      )
        throw Error("Invalid cut position.");
      const dx = job.x2 - job.x,
        dy = job.y2 - job.y,
        length = Math.hypot(dx, dy);
      if (length < 1e-6) throw Error("Drag across the shape to cut it.");
      const segment = new scope.Path.Line({
        from: [job.x, job.y],
        to: [job.x2, job.y2],
        insert: false,
      });
      if (
        result.contains(new scope.Point(job.x, job.y)) ||
        result.contains(new scope.Point(job.x2, job.y2)) ||
        result.getIntersections(segment).length < 2
      )
        throw Error(
          "The cut must pass all the way through the shape. Try dragging from outside one side to outside the other.",
        );
      const ux = dx / length,
        uy = dy / length,
        nx = -uy,
        ny = ux,
        b = result.bounds;
      const t = (b.center.x - job.x) * ux + (b.center.y - job.y) * uy;
      const cx = job.x + ux * t,
        cy = job.y + uy * t,
        radius =
          4 * Math.hypot(b.width, b.height) +
          Math.hypot(b.center.x - cx, b.center.y - cy) +
          10;
      if (!Number.isFinite(radius) || radius > 2e7)
        throw Error("The shape is too large to cut safely.");
      function half(sign: number) {
        return new scope.Path({
          segments: [
            [cx - ux * radius, cy - uy * radius],
            [cx + ux * radius, cy + uy * radius],
            [
              cx + ux * radius + sign * nx * radius,
              cy + uy * radius + sign * ny * radius,
            ],
            [
              cx - ux * radius + sign * nx * radius,
              cy - uy * radius + sign * ny * radius,
            ],
          ],
          closed: true,
          insert: false,
        });
      }
      const left = half(1),
        right = half(-1),
        one = result.intersect(left, { insert: false }),
        two = result.intersect(right, { insert: false });
      const area = (p: paper.PathItem) =>
        Math.abs(paths(p).reduce((sum, v) => sum + v.area, 0));
      if (area(one) < 1e-6 || area(two) < 1e-6)
        throw Error(
          "The cut must pass through the shape. Try dragging across it.",
        );
      const part = job.parts[0],
        matrix = new scope.Matrix();
      matrix.translate(new scope.Point(part.x, part.y));
      const a = part.adjustment;
      if (a) {
        matrix.translate(new scope.Point(a.cx, a.cy));
        matrix.rotate(a.rotation, new scope.Point(0, 0));
        matrix.scale(a.scaleX, a.scaleY);
        matrix.translate(new scope.Point(-a.cx, -a.cy));
      }
      matrix.append(new scope.Matrix(...part.matrix));
      const inverse = matrix.inverted();
      if (!inverse) throw Error("The shape transform cannot be inverted.");
      one.transform(inverse);
      two.transform(inverse);
      bounded(one);
      bounded(two);
      const p1 = one.pathData,
        p2 = two.pathData;
      if (!p1 || !p2 || p1.length + p2.length > 200000)
        throw Error("The cut is too complex; the original is unchanged.");
      return {
        pathData: p1,
        paths: [],
        area: 0,
        space: "local",
        cutPaths: [p1, p2],
      };
    }
    if (job.type === "cut") {
      const list = paths(result);
      if (list.length !== 1 || list[0].closed)
        throw Error("Scissors currently cut one open line at a time.");
      if (
        ![job.x, job.y, job.tolerance].every(Number.isFinite) ||
        job.tolerance <= 0 ||
        job.tolerance > 1e6
      )
        throw Error("Invalid cut position.");
      const line = list[0],
        location = line.getNearestLocation(new scope.Point(job.x, job.y));
      if (
        !location ||
        location.point.getDistance(new scope.Point(job.x, job.y)) >
          job.tolerance
      )
        throw Error("Click closer to the line you want to cut.");
      const offset = location.offset;
      if (offset <= 1e-5 || line.length - offset <= 1e-5)
        throw Error("Click between the line's endpoints.");
      const second = line.splitAt(location);
      if (!second)
        throw Error("Could not cut this line; the original is unchanged.");
      const part = job.parts[0],
        matrix = new scope.Matrix();
      matrix.translate(new scope.Point(part.x, part.y));
      const a = part.adjustment;
      if (a) {
        matrix.translate(new scope.Point(a.cx, a.cy));
        matrix.rotate(a.rotation, new scope.Point(0, 0));
        matrix.scale(a.scaleX, a.scaleY);
        matrix.translate(new scope.Point(-a.cx, -a.cy));
      }
      matrix.append(new scope.Matrix(...part.matrix));
      const inverse = matrix.inverted();
      if (!inverse) throw Error("The path transform cannot be inverted.");
      line.transform(inverse);
      second.transform(inverse);
      bounded(line);
      bounded(second);
      const one = line.pathData,
        two = second.pathData;
      if (!one || !two || one.length + two.length > 200000)
        throw Error("Cut result is too complex; the original is unchanged.");
      return {
        pathData: one,
        paths: [],
        area: 0,
        space: "local",
        cutPaths: [one, two],
      };
    }
    if (job.type === "boolean") {
      if (paths(result).some((p) => !p.closed))
        throw Error("Boolean operations require closed shapes.");
      for (const part of job.parts.slice(1)) {
        const other = make(part);
        bounded(other);
        if (paths(other).some((p) => !p.closed))
          throw Error("Boolean operations require closed shapes.");
        const previous = result;
        result =
          job.operation === "union"
            ? result.unite(other, { insert: false })
            : job.operation === "subtract"
              ? result.subtract(other, { insert: false })
              : job.operation === "intersect"
                ? result.intersect(other, { insert: false })
                : result.exclude(other, { insert: false });
        previous.remove();
        other.remove();
        bounded(result);
      }
    }
    let selectedNode: { path: number; node: number } | undefined;
    if (
      job.type === "addPoint" ||
      job.type === "insertPoint" ||
      job.type === "removePoint"
    ) {
      const list = paths(result);
      if (job.type === "removePoint") {
        const path = list[job.path];
        if (!path || !path.segments[job.node])
          throw Error("That point no longer exists.");
        if (path.segments.length <= (path.closed ? 3 : 2))
          throw Error(
            "Keep at least three points in a closed shape or two in an open line.",
          );
        path.removeSegment(job.node);
        selectedNode = {
          path: job.path,
          node: Math.min(job.node, path.segments.length - 1),
        };
      } else {
        let pi: number, curve: paper.Curve | undefined, time: number;
        if (job.type === "addPoint") {
          pi = job.path;
          const path = list[pi];
          if (
            !path ||
            !Number.isInteger(job.node) ||
            job.node < 0 ||
            job.node >= path.segments.length ||
            (!path.closed && job.node === path.segments.length - 1)
          )
            throw Error("Choose a point that has a line after it.");
          curve = path.curves[job.node];
          time = 0.5;
          if (!curve) throw Error("Choose a point that has a line after it.");
        } else {
          if (
            ![job.x, job.y, job.tolerance].every(Number.isFinite) ||
            job.tolerance <= 0 ||
            job.tolerance > 1e6
          )
            throw Error("Invalid point position.");
          const pt = new scope.Point(job.x, job.y);
          let closest = Infinity;
          pi = -1;
          time = 0;
          for (const [i, path] of list.entries()) {
            const location = path.getNearestLocation(pt);
            if (location && location.point.getDistance(pt) < closest) {
              closest = location.point.getDistance(pt);
              pi = i;
              curve = location.curve;
              time = location.time;
            }
          }
          if (!curve || closest > job.tolerance)
            throw Error("Double-click closer to the line to add a point.");
          if (time < 0.001 || time > 0.999)
            throw Error(
              "That is already near a point. Choose a spot between points.",
            );
        }
        const index = curve.index;
        if (!curve.divideAtTime(time))
          throw Error("Could not add a point here; the original is unchanged.");
        selectedNode = { path: pi, node: index + 1 };
      }
      bounded(result);
    }
    if (job.type === "node") {
      const list = paths(result),
        path = list[job.path],
        segment = path?.segments[job.node];
      if (!segment) throw Error("That path node no longer exists.");
      const v = job.value;
      if (
        !Object.values(v).every((n) => Number.isFinite(n) && Math.abs(n) <= 1e6)
      )
        throw Error("Invalid path node.");
      segment.point = new scope.Point(v.x, v.y);
      segment.handleIn = new scope.Point(v.inX, v.inY);
      segment.handleOut = new scope.Point(v.outX, v.outY);
      if (job.mode === "corner") {
        segment.handleIn = new scope.Point(0, 0);
        segment.handleOut = new scope.Point(0, 0);
      }
      if (job.mode === "smooth")
        segment.smooth({ type: "catmull-rom", factor: 0.5 });
      bounded(result);
    }
    const serialized: NodePath[] = paths(result).map((p) => ({
      closed: p.closed,
      nodes: p.segments.map((s) => ({
        x: s.point.x,
        y: s.point.y,
        inX: s.handleIn.x,
        inY: s.handleIn.y,
        outX: s.handleOut.x,
        outY: s.handleOut.y,
      })),
    }));
    const area = paths(result).reduce((sum, p) => sum + p.area, 0);
    if (["node", "addPoint", "insertPoint", "removePoint"].includes(job.type)) {
      const part = job.parts[0],
        matrix = new scope.Matrix();
      matrix.translate(new scope.Point(part.x, part.y));
      const a = part.adjustment;
      if (a) {
        matrix.translate(new scope.Point(a.cx, a.cy));
        matrix.rotate(a.rotation, new scope.Point(0, 0));
        matrix.scale(a.scaleX, a.scaleY);
        matrix.translate(new scope.Point(-a.cx, -a.cy));
      }
      matrix.append(new scope.Matrix(...part.matrix));
      const inverse = matrix.inverted();
      if (!inverse) throw Error("The path transform cannot be inverted.");
      result.transform(inverse);
      bounded(result);
    }
    const pathData = result.pathData;
    if (!pathData || pathData.length > 200000)
      throw Error(
        "The operation produced an empty or overly complex result. Originals are unchanged.",
      );
    return {
      pathData,
      paths: serialized,
      area,
      space: ["node", "addPoint", "insertPoint", "removePoint"].includes(
        job.type,
      )
        ? "local"
        : "world",
      selectedNode,
    };
  } finally {
    scope.project?.remove();
    scope.remove();
  }
}
