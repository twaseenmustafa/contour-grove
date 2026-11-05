import { describe, expect, it } from "vitest";
import { tracePixels, preparePixels } from "./core";
import { defaultTraceOptions } from "./types";
import { inspectImage, inspectDataURL } from "./image-header";
function fixture() {
  const width = 80,
    height = 60,
    pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  const paint = (x: number, y: number, w: number, h: number, c: number[]) => {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) pixels.set(c, (j * width + i) * 4);
  };
  paint(5, 5, 30, 35, [0, 0, 0, 255]);
  paint(12, 12, 16, 20, [255, 255, 255, 255]);
  paint(50, 10, 20, 25, [0, 0, 0, 255]);
  return { width, height, pixels, options: { ...defaultTraceOptions } };
}
describe("local trace engine", () => {
  it("separates disconnected dark parts and preserves an inner hole", () => {
    const r = tracePixels(fixture());
    expect(r.shapes).toHaveLength(2);
    expect(r.shapes.every((s) => s.fill === "#000000")).toBe(true);
    expect(r.shapes.some((s) => (s.d.match(/M/g) ?? []).length === 2)).toBe(
      true,
    );
  });
  it("is deterministic and never mutates original pixels", () => {
    const job = fixture(),
      copy = job.pixels.slice();
    expect(tracePixels(job).shapes).toEqual(tracePixels(job).shapes);
    expect(job.pixels).toEqual(copy);
  });
  it("keeps transparent pixels transparent", () => {
    const job = fixture();
    job.pixels.set([0, 0, 0, 0], 0);
    expect(preparePixels(job).data[3]).toBe(0);
  });
  it("retains a small color palette", () => {
    const job = fixture();
    for (let y = 10; y < 35; y++)
      for (let x = 50; x < 70; x++)
        job.pixels.set([255, 0, 0, 255], (y * 80 + x) * 4);
    job.options.mode = "color";
    const shapes = tracePixels(job).shapes;
    expect(shapes.some((s) => s.fill === "#ff0000")).toBe(true);
    expect(shapes.some((s) => s.fill === "#000000")).toBe(true);
  });
  it("rejects oversized jobs and invalid options", () => {
    expect(() => tracePixels({ ...fixture(), width: 2000 })).toThrow();
    expect(() =>
      tracePixels({
        ...fixture(),
        options: { ...defaultTraceOptions, threshold: 999 },
      }),
    ).toThrow();
  });
  it("reports blank images without replacing anything", () => {
    const job = fixture();
    job.pixels.fill(255);
    expect(() => tracePixels(job)).toThrow(/No dark/);
  });
});
describe("image boundary checks", () => {
  it("rejects malformed images and remote image URLs", () => {
    expect(() => inspectImage(new Uint8Array([1, 2, 3]))).toThrow(/PNG/);
    expect(() => inspectDataURL("https://example.com/a.png")).toThrow();
  });
  it("rejects oversized headers before decoding pixels", () => {
    const b = new Uint8Array(24);
    b.set([137, 80, 78, 71, 13, 10, 26, 10]);
    b.set([73, 72, 68, 82], 12);
    const v = new DataView(b.buffer);
    v.setUint32(16, 8000);
    v.setUint32(20, 8000);
    expect(() => inspectImage(b)).toThrow(/16 megapixels/);
  });
});
