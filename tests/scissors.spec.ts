import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("scissors split a line into two editable parts and undo restores it", async ({
  page,
}) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByLabel("X position", { exact: true }).waitFor();
  await page.locator(".file-menu>summary").click();
  await page.getByRole("button", { name: "New document", exact: true }).click();
  await page.locator(".shapes-menu>summary").click();
  await page.getByRole("button", { name: "Create line", exact: true }).click();
  const parts = page.locator(".canvas-host [data-part]");
  await expect(parts).toHaveCount(1);
  const backup = async () => {
    const ev = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    return JSON.parse(await readFile((await (await ev).path())!, "utf8"));
  };
  const before = await backup();
  const b = (await parts.first().boundingBox())!;
  await page.getByRole("button", { name: "Scissors tool" }).click();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(parts).toHaveCount(2, { timeout: 10000 });
  const after = await backup();
  expect(after.parts.map((p: { kind: string }) => p.kind)).toEqual([
    "path",
    "path",
  ]);
  expect(after.parts[0].stroke).toBe(before.parts[0].stroke);
  expect(after.parts[0].matrix).toEqual(before.parts[0].matrix);
  expect(after.source).toEqual(before.source);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await backup()).parts).toEqual(before.parts);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(parts).toHaveCount(2);
});
test("scissors reject filled shapes without changing the design", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("X position", { exact: true }).waitFor();
  const parts = page.locator(".canvas-host [data-part]"),
    b = (await parts.first().boundingBox())!;
  await page.getByRole("button", { name: "Scissors tool" }).click();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.getByText(/To cut a line/)).toBeVisible();
  await expect(parts).toHaveCount(6);
});

test("scissors preserve a transformed curved path and its cut point", async ({
  page,
}) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByLabel("X position", { exact: true }).waitFor();
  await page.locator(".file-menu>summary").click();
  await page.getByRole("button", { name: "New document", exact: true }).click();
  await page.getByRole("button", { name: "Pen tool" }).click();
  const box = (await page.locator(".canvas-host").boundingBox())!;
  await page.mouse.move(box.x + 120, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 180, box.y + 100, { steps: 5 });
  await page.mouse.up();
  await page.mouse.click(box.x + 300, box.y + 240);
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Rotate right 15 degrees" }).click();
  const path = page.locator(".canvas-host [data-part] path").first();
  const info = await path.evaluate((el) => {
    const p = el as SVGPathElement,
      m = p.getScreenCTM()!,
      l = p.getTotalLength();
    const pos = (v: number) => {
      const pt = p.getPointAtLength(v);
      return new DOMPoint(pt.x, pt.y).matrixTransform(m);
    };
    const a = pos(0),
      c = pos(l / 2),
      z = pos(l);
    return {
      a: { x: a.x, y: a.y },
      c: { x: c.x, y: c.y },
      z: { x: z.x, y: z.y },
    };
  });
  await page.getByRole("button", { name: "Scissors tool" }).click();
  // Browser engines can quantize fractional mouse positions differently.
  // Check the cut against the actual delivered pointer rather than the requested coordinate.
  await page.evaluate(() => {
    document.addEventListener(
      "pointerdown",
      (event) => {
        document.body.dataset.testClick = JSON.stringify({
          x: event.clientX,
          y: event.clientY,
        });
      },
      { once: true, capture: true },
    );
  });
  await page.mouse.click(info.c.x, info.c.y);
  const clickPoint = await page.evaluate(() => {
    const value = document.body.dataset.testClick;
    delete document.body.dataset.testClick;
    if (!value) throw Error("No pointer event captured");
    return JSON.parse(value) as { x: number; y: number };
  });
  const parts = page.locator(".canvas-host [data-part]");
  await expect(parts).toHaveCount(2, { timeout: 10000 });
  const endpoints = await parts
    .locator("[data-geometry] path")
    .evaluateAll((nodes) =>
      nodes.map((el) => {
        const p = el as SVGPathElement,
          m = p.getScreenCTM()!,
          l = p.getTotalLength();
        return [0, l].map((v) => {
          const q = p.getPointAtLength(v),
            t = new DOMPoint(q.x, q.y).matrixTransform(m);
          return { x: t.x, y: t.y };
        });
      }),
    );
  const close = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);
  expect(close(endpoints[0][0], info.a)).toBeLessThan(0.5);
  expect(close(endpoints[0][1], clickPoint)).toBeLessThan(1);
  expect(close(endpoints[1][0], clickPoint)).toBeLessThan(1);
  expect(close(endpoints[0][1], endpoints[1][0])).toBeLessThan(0.1);
  expect(close(endpoints[1][1], info.z)).toBeLessThan(0.5);
});
