import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function blank(page: Page) {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByLabel("X position", { exact: true }).waitFor();
  await page.locator(".file-menu>summary").click();
  await page.getByRole("button", { name: "New document", exact: true }).click();
}
async function insert(page: Page, name: string) {
  await page
    .locator(name === "text" ? ".insert-menu>summary" : ".shapes-menu>summary")
    .click();
  await page
    .getByRole("button", { name: `Create ${name}`, exact: true })
    .click();
}
async function backup(page: Page) {
  const ev = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  return JSON.parse(await readFile((await (await ev).path())!, "utf8"));
}
test("drag scissors across a filled shape; preserve style and undo", async ({
  page,
}) => {
  await blank(page);
  await insert(page, "rectangle");
  const parts = page.locator(".canvas-host [data-part]");
  const before = await backup(page);
  const b = (await parts.first().boundingBox())!;
  await page.getByRole("button", { name: "Scissors tool" }).click();
  await page.mouse.move(b.x - 25, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width + 25, b.y + b.height / 2, { steps: 5 });
  await expect(page.locator("[data-cut-preview]")).toHaveCount(1);
  await page.mouse.up();
  await expect(parts).toHaveCount(2, { timeout: 10000 });
  const after = await backup(page);
  expect(after.parts.map((p: { kind: string }) => p.kind)).toEqual([
    "path",
    "path",
  ]);
  expect(after.parts[0].fill).toBe(before.parts[0].fill);
  expect(after.parts[1].fill).toBe(before.parts[0].fill);
  expect(after.parts[0].matrix).toEqual(before.parts[0].matrix);
  expect(after.source).toEqual(before.source);
  expect(
    after.parts.every(
      (p: { geometry: { d: string } }) => p.geometry.d.length > 5,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await backup(page)).parts).toEqual(before.parts);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(parts).toHaveCount(2);
});
test("partial scissors drag does not modify a shape", async ({ page }) => {
  await blank(page);
  await insert(page, "rectangle");
  const parts = page.locator(".canvas-host [data-part]"),
    b = (await parts.first().boundingBox())!;
  await page.getByRole("button", { name: "Scissors tool" }).click();
  await page.mouse.move(b.x - 20, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(
    page.getByText(/cut must pass all the way through/i),
  ).toBeVisible({ timeout: 10000 });
  await expect(parts).toHaveCount(1);
});
test("pen backspace removes the last draft point without deleting artwork", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("X position", { exact: true }).waitFor();
  const b = (await page.locator(".canvas-host").boundingBox())!;
  await page.getByRole("button", { name: "Pen tool" }).click();
  await page.mouse.click(b.x + 100, b.y + 100);
  await page.mouse.click(b.x + 200, b.y + 100);
  await page.mouse.click(b.x + 210, b.y + 190);
  await expect(page.locator("[data-pen-preview] circle")).toHaveCount(3);
  await page.keyboard.press("Backspace");
  await expect(page.locator("[data-pen-preview] circle")).toHaveCount(2);
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(6);
  await page.keyboard.press("Enter");
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(7);
});
test("typing previews text immediately, Escape restores, and Enter commits once", async ({
  page,
}) => {
  await blank(page);
  await insert(page, "text");
  const field = page.getByLabel("Text", { exact: true }),
    text = page.locator(".canvas-host [data-part] text");
  await field.fill("A < B");
  await expect(text).toHaveText("A < B");
  await field.fill("A considerably longer name");
  const glyph = (await text.boundingBox())!;
  const outline = (await page
    .locator("[data-selection] rect")
    .first()
    .boundingBox())!;
  expect(outline.width).toBeGreaterThanOrEqual(glyph.width);
  await field.press("Escape");
  await expect(text).toHaveText("Your text");
  await field.fill("Brand");
  await expect(text).toHaveText("Brand");
  await field.press("Enter");
  await expect(text).toHaveText("Brand");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(text).toHaveText("Your text");
});
test("snap aligns a single shape to the export frame", async ({ page }) => {
  await blank(page);
  await page.locator(".file-menu>summary").click();
  await page.getByRole("button", { name: "Automation workbench" }).click();
  const field = page.getByLabel("Command batch"),
    request = JSON.parse(await field.inputValue());
  request.commands = [
    {
      type: "create",
      shape: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    },
  ];
  await field.fill(JSON.stringify(request));
  await page.getByRole("button", { name: "Apply atomically" }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Snap to objects" }).click();
  const shape = page.locator(".canvas-host [data-part]").first(),
    b = (await shape.boundingBox())!,
    svg = page.locator(".canvas-host > svg");
  const scale = await svg.evaluate((e) =>
    Math.hypot(
      (e as SVGSVGElement).getScreenCTM()!.a,
      (e as SVGSVGElement).getScreenCTM()!.b,
    ),
  );
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    b.x + b.width / 2 - 98 * scale,
    b.y + b.height / 2 + 30 * scale,
    { steps: 4 },
  );
  await expect(page.locator("[data-snap-guides] line")).toHaveCount(1);
  await page.mouse.up();
  expect((await backup(page)).parts[0].x).toBeCloseTo(0, 1);
});
