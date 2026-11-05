import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function start(page: Page) {
  await page.goto("/");
  await expect(page.getByLabel("X position")).toBeVisible();
}
async function backup(page: Page) {
  const wait = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  return JSON.parse(await readFile((await (await wait).path())!, "utf8"));
}
async function canvasSetup(page: Page) {
  await page.locator(".canvas-setup > summary").click();
  await expect(page.getByLabel("Canvas width", { exact: true })).toBeVisible();
}
const fixture = {
  name: "framing.svg",
  mimeType: "image/svg+xml",
  buffer: Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400"><g transform="translate(100 80) scale(2)"><rect x="10" y="20" width="30" height="40" fill="#08090b"/></g><circle cx="500" cy="300" r="20" fill="#4266bb"/></svg>',
  ),
};
test("studio navigation, guide and dark surfaces are usable on desktop and mobile", async ({
  page,
}) => {
  await start(page);
  await expect(
    page.getByRole("tablist", { name: "Library panels" }),
  ).toBeVisible();
  await page.locator(".studio-help > summary").click();
  await expect(
    page.getByText("Stay in control", { exact: true }),
  ).toBeVisible();
  const stage = await page
    .locator(".canvas-surround")
    .evaluate((e) => getComputedStyle(e).backgroundColor);
  const channels = stage.match(/\d+/g)!.slice(0, 3).map(Number);
  expect(Math.max(...channels)).toBeLessThanOrEqual(30);
  await page.locator(".studio-help > summary").click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: ".internal_docs/verifications/studio-desktop.jpg",
    fullPage: true,
    animations: "disabled",
  });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "Properties", exact: true }).click();
  await expect(page).toHaveURL(/#logo-properties$/);
  await canvasSetup(page);
  await page.locator(".studio-help > summary").click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".internal_docs/verifications/studio-mobile-expanded.jpg",
    fullPage: true,
    animations: "disabled",
  });
});
test("zoom changes only the camera and fitted drag coordinates remain correct", async ({
  page,
}) => {
  await start(page);
  const before = await backup(page);
  const fittedWidth = await page
    .locator(".canvas-host > svg")
    .evaluate((el) => (el as SVGSVGElement).viewBox.baseVal.width);
  await page.getByLabel("Canvas zoom", { exact: true }).selectOption("2");
  await expect(page.locator(".canvas-host > svg")).toHaveAttribute(
    "data-zoom",
    "2",
  );
  const width = await page
    .locator(".canvas-host > svg")
    .evaluate((el) => (el as SVGSVGElement).viewBox.baseVal.width);
  expect(width).toBeCloseTo(fittedWidth / 2, 3);
  expect(await backup(page)).toEqual(before);
  const download = page.waitForEvent("download");
  await page.locator(".export-menu > summary").click();
  await page.getByRole("button", { name: "Export SVG", exact: true }).click();
  const svg = await readFile((await (await download).path())!, "utf8");
  expect(svg).toContain('viewBox="' + before.viewBox.join(" ") + '"');
  expect(svg).not.toContain("data-export-frame");
  expect(svg).not.toContain("data-zoom");
  // Pixel drag under zoom must use the SVG camera's inverse, not the fitted scale.
  await page.locator(".canvas-host").scrollIntoViewIfNeeded();
  const shape = page.locator('.canvas-host [data-part="petal-1"] path');
  const box = await shape.boundingBox();
  if (!box) throw Error("Missing shape");
  const scale = await page
    .locator(".canvas-host > svg")
    .evaluate((el) => (el as SVGSVGElement).getScreenCTM()!.a);
  const x = box.x + box.width / 2,
    y = Math.max(
      box.y + box.height / 2,
      (await page.locator(".canvas-host [data-export-frame]").boundingBox())!
        .y + 35,
    );
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 12, y + 8, { steps: 4 });
  await page.mouse.up();
  const moved = await backup(page);
  expect(moved.parts[0].x - before.parts[0].x).toBeCloseTo(12 / scale, 1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await backup(page)).parts).toEqual(before.parts);
  await page
    .getByRole("button", { name: "Fit to canvas", exact: true })
    .click();
  await expect(page.getByLabel("Canvas zoom", { exact: true })).toHaveValue(
    "1",
  );
  await page.getByLabel("Canvas zoom", { exact: true }).selectOption("0.05");
  await expect(
    page.getByRole("button", { name: "Zoom out", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Canvas zoom", { exact: true }).selectOption("16");
  await expect(
    page.getByRole("button", { name: "Zoom in", exact: true }),
  ).toBeDisabled();
});
test("canvas sizing is reversible, persists and drives SVG and PNG export dimensions", async ({
  page,
}) => {
  await start(page);
  const original = await backup(page);
  await canvasSetup(page);
  await page.getByLabel("Canvas width", { exact: true }).fill("500");
  await page.getByLabel("Canvas height", { exact: true }).fill("300");
  await page
    .getByRole("button", { name: "Apply canvas size", exact: true })
    .click();
  let p = await backup(page);
  expect(p.viewBox.slice(2)).toEqual([500, 300]);
  const artboard = await page
    .locator(".canvas-host [data-export-frame]")
    .boundingBox();
  expect(artboard!.width / artboard!.height).toBeCloseTo(500 / 300, 1);
  expect(p.parts).toEqual(original.parts);
  expect(p.source).toEqual(original.source);
  await expect(page.locator(".save-status")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  p = await backup(page);
  expect(p.viewBox.slice(2)).toEqual([500, 300]);
  const event = page.waitForEvent("download");
  await page.locator(".export-menu > summary").click();
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  const bytes = await readFile((await (await event).path())!);
  expect(bytes.readUInt32BE(16)).toBe(1600);
  expect(bytes.readUInt32BE(20)).toBe(960);
  await canvasSetup(page);
  await page.getByLabel("Canvas width", { exact: true }).fill("50");
  await page.getByLabel("Canvas height", { exact: true }).fill("50");
  await page
    .getByRole("button", { name: "Apply canvas size", exact: true })
    .click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await backup(page)).viewBox).toEqual(p.viewBox);
  await page.screenshot({
    path: ".internal_docs/verifications/studio-framing.jpg",
    fullPage: true,
    animations: "disabled",
  });
});
test("trim measures transformed shapes, excludes hidden parts and retains locked geometry", async ({
  page,
}) => {
  await start(page);
  await page.getByTestId("logo-input").setInputFiles(fixture);
  const original = await backup(page);
  await page.getByRole("button", { name: /Part 2/ }).click();
  await page.locator(".organization-controls > summary").click();
  await page.getByRole("button", { name: "Hide", exact: true }).click();
  await page.getByRole("button", { name: /Part 1/ }).click();
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await canvasSetup(page);
  await page.getByLabel("Trim padding", { exact: true }).fill("10");
  await page
    .getByRole("button", { name: "Trim to artwork", exact: true })
    .click();
  const p = await backup(page);
  expect(p.viewBox).toEqual([110, 110, 80, 100]);
  expect(p.parts.map((p: { geometry: unknown }) => p.geometry)).toEqual(
    original.parts.map((p: { geometry: unknown }) => p.geometry),
  );
  expect(p.parts[0].locked).toBe(true);
  expect(p.parts[1].hidden).toBe(true);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await backup(page)).viewBox).toEqual(original.viewBox);
});
test("invalid trim, empty states, frame previews and controls never mutate source", async ({
  page,
}) => {
  await start(page);
  const before = await backup(page);
  await canvasSetup(page);
  await page.getByLabel("Trim padding", { exact: true }).fill("-1");
  await page
    .getByRole("button", { name: "Trim to artwork", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Padding must be");
  expect(await backup(page)).toEqual(before);
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page.getByRole("button", { name: "Hide", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Trim to artwork", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(0);
  await page.screenshot({
    path: ".internal_docs/verifications/studio-empty.jpg",
    fullPage: true,
    animations: "disabled",
  });
});
test("stroke-aware trim keeps conservative outline room and cleans measurement nodes", async ({
  page,
}) => {
  await start(page);
  await page.getByTestId("logo-input").setInputFiles({
    name: "outline.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"><rect x="100" y="100" width="50" height="80" transform="rotate(30 125 140) scale(1.2)" fill="none" stroke="#141619" stroke-width="8" /></svg>',
    ),
  });
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(1);
  const b = await page.locator(".canvas-host [data-part]").evaluate((el) => {
    const r = (el as SVGGraphicsElement).getBBox();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  await canvasSetup(page);
  await page.getByLabel("Trim padding", { exact: true }).fill("0");
  await page
    .getByRole("button", { name: "Trim to artwork", exact: true })
    .click();
  const p = await backup(page);
  expect(p.viewBox[0]).toBeLessThan(b.x);
  expect(p.viewBox[1]).toBeLessThan(b.y);
  expect(p.viewBox[2]).toBeGreaterThan(b.width);
  expect(p.viewBox[3]).toBeGreaterThan(b.height);
  expect(await page.locator("body > svg").count()).toBe(0);
});
