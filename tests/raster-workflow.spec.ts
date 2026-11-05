import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function start(page: Page) {
  await page.goto("/");
  await expect(page.getByLabel("X position", { exact: true })).toBeVisible();
}
async function trace(page: Page) {
  await page
    .getByTestId("logo-input")
    .setInputFiles("tests/fixtures/sample-shapes.png");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Use these shapes" }),
  ).toBeEnabled({ timeout: 25000 });
}
test("sample PNG becomes separate editable paths, survives autosave and exports no original image", async ({
  page,
}) => {
  await start(page);
  await trace(page);
  const count = await page
    .getByTestId("trace-preview")
    .locator("[data-part]")
    .count();
  console.log("Sample image separate traced parts:", count);
  expect(count).toBeGreaterThanOrEqual(6);
  expect(count).toBeLessThan(20);
  await page.screenshot({
    path: ".internal_docs/verifications/tracing-desktop.jpg",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Use these shapes" }).click();
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(count);
  await page.getByLabel("X position").fill("24");
  await page.getByLabel("Enable shadow").check();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const backup = await readFile((await (await event).path())!, "utf8"),
    project = JSON.parse(backup);
  expect(project.source.raster.width).toBe(2048);
  expect(project.source.raster.height).toBe(1152);
  expect(project.source.raster.dataURL).toMatch(/^data:image\/png;base64,/);
  expect(project.parts[0].x).toBe(24);
  await expect(page.locator(".save-status")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(page.getByLabel("X position")).toHaveValue("24");
  await expect(page.getByLabel("Enable shadow")).toBeChecked();
  await page.locator(".reference-note > summary").click();
  await page
    .getByRole("button", { name: "Compare / retrace original" })
    .click();
  await expect(
    page.getByRole("button", { name: "Use these shapes" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Keep current logo" }).click();
  await expect(page.getByLabel("X position")).toHaveValue("24");
  const svgEvent = page.waitForEvent("download");
  await page.locator(".export-menu > summary").click();
  await page.getByRole("button", { name: "Export SVG", exact: true }).click();
  const svg = await readFile((await (await svgEvent).path())!, "utf8");
  expect(svg).not.toContain("<image");
  expect(svg).not.toContain("data:image");
  expect(svg).toContain("feDropShadow");
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("project-input").setInputFiles({
    name: "raster-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup),
  });
  await expect(page.getByLabel("X position")).toHaveValue("24");
});
test("canceling preview preserves work; color settings work; mobile preview fits", async ({
  page,
}) => {
  await start(page);
  await page.getByLabel("X position").fill("32");
  page.once("dialog", (d) => d.accept());
  await trace(page);
  await page.getByLabel("Shape colors").selectOption("color");
  await expect(
    page.getByRole("button", { name: "Use these shapes" }),
  ).toBeEnabled({ timeout: 25000 });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page
      .getByRole("dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await page.screenshot({
    path: ".internal_docs/verifications/tracing-mobile.jpg",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Keep current logo" }).click();
  await expect(page.getByLabel("X position")).toHaveValue("32");
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(6);
});
test("JPEG uploads trace and blank image cannot replace work", async ({
  page,
}) => {
  await start(page);
  const jpeg = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 100;
    c.height = 80;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 100, 80);
    ctx.fillStyle = "black";
    ctx.fillRect(10, 10, 20, 40);
    ctx.fillRect(60, 10, 20, 40);
    return c.toDataURL("image/jpeg").split(",")[1];
  });
  await page.getByTestId("logo-input").setInputFiles({
    name: "two.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(jpeg, "base64"),
  });
  await expect(
    page.getByRole("button", { name: "Use these shapes" }),
  ).toBeEnabled();
  await expect(
    page.getByTestId("trace-preview").locator("[data-part]"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Keep current logo" }).click();
  const blank = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 40;
    c.height = 40;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 40, 40);
    return c.toDataURL().split(",")[1];
  });
  await page.getByTestId("logo-input").setInputFiles({
    name: "blank.png",
    mimeType: "image/png",
    buffer: Buffer.from(blank, "base64"),
  });
  await expect(page.getByRole("dialog")).toContainText("No dark shapes");
  await expect(
    page.getByRole("button", { name: "Use these shapes" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Keep current logo" }).click();
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(6);
});
