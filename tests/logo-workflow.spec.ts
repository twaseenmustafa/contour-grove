import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
const simple =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g transform="translate(10 20)"><path id="Ring" fill="#2765ce" fill-rule="evenodd" d="M20 20H150V150H20Z M50 50H120V120H50Z"/><circle id="Dot" cx="85" cy="85" r="15" fill="#ee985b"/></g></svg>';
async function upload(page: Page, text: string, name = "sample.svg") {
  await page.getByTestId("logo-input").setInputFiles({
    name,
    mimeType: "image/svg+xml",
    buffer: Buffer.from(text),
  });
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Logo studio" }),
  ).toBeVisible();
});
test("demo renders; edits, undo and redo work", async ({ page }) => {
  await expect(
    page.getByRole("heading", { name: "Logo studio" }),
  ).toBeVisible();
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(6);
  await page.getByLabel("X position").fill("42");
  await expect(
    page.locator('.canvas-host [data-part="petal-1"] > g'),
  ).toHaveAttribute("transform", "translate(42 0)");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("X position")).toHaveValue("0");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByLabel("X position")).toHaveValue("42");
  await page
    .getByRole("button", { name: "Set color #a78bfa", exact: true })
    .click();
  await expect(
    page.locator('.canvas-host [data-part="petal-1"] path'),
  ).toHaveAttribute("fill", "#a78bfa");
});
test("supported SVG preserves holes and nested transforms", async ({
  page,
}) => {
  await upload(page, simple);
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(2);
  await expect(
    page.locator(".canvas-host [data-geometry] path"),
  ).toHaveAttribute("fill-rule", "evenodd");
  await expect(
    page.locator(".canvas-host [data-geometry] path"),
  ).toHaveAttribute("transform", "matrix(1 0 0 1 10 20)");
  await page.getByRole("button", { name: /Dot/ }).click();
  await page.getByLabel("Y position").fill("15");
  await expect(
    page.locator('.canvas-host [data-part="part-2"] > g'),
  ).toHaveAttribute("transform", "translate(0 15)");
});
test("shadow is reversible and survives download/reopen and refresh", async ({
  page,
}) => {
  await page.getByLabel("Enable shadow").check();
  await expect(page.locator(".canvas-host feDropShadow")).toHaveCount(1);
  const saved = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const download = await saved;
  const path = await download.path();
  expect(path).toBeTruthy();
  const text = await readFile(path!, "utf8");
  const data = JSON.parse(text);
  expect(data.parts[0].shadow.enabled).toBe(true);
  await page.getByLabel("Enable shadow").uncheck();
  await expect(page.locator(".canvas-host feDropShadow")).toHaveCount(0);
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("project-input").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(text),
  });
  await expect(page.getByLabel("Enable shadow")).toBeChecked();
  await page.waitForTimeout(650);
  await page.reload();
  await expect(page.getByLabel("Enable shadow")).toBeChecked();
});
test("PNG and SVG export contain no selection UI and PNG can be decoded", async ({
  page,
}) => {
  await page.getByLabel("Enable shadow").check();
  const svgDownload = page.waitForEvent("download");
  await page.locator(".export-menu > summary").click();
  await page.getByRole("button", { name: "Export SVG", exact: true }).click();
  const svg = await readFile((await (await svgDownload).path())!, "utf8");
  expect(svg).toContain("feDropShadow");
  expect(svg).not.toContain("data-selection");
  const pngDownload = page.waitForEvent("download");
  await page.locator(".export-menu > summary").click();
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  const png = await readFile((await (await pngDownload).path())!);
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  const result = await page.evaluate(
    async ({ svg, png }) => {
      const load = async (src: string) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        return img;
      };
      const a = await load("data:image/svg+xml;base64," + btoa(svg));
      const b = await load("data:image/png;base64," + png);
      const c = document.createElement("canvas");
      c.width = 1600;
      c.height = b.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(a, 0, 0, c.width, c.height);
      const ap = ctx.getImageData(0, 0, c.width, c.height).data;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(b, 0, 0);
      const bp = ctx.getImageData(0, 0, c.width, c.height).data;
      let diff = 0;
      for (let i = 0; i < ap.length; i++) diff += Math.abs(ap[i] - bp[i]);
      return {
        width: b.width,
        height: b.height,
        meanDifference: diff / ap.length,
      };
    },
    { svg, png: png.toString("base64") },
  );
  expect(result.width).toBe(1600);
  expect(result.height).toBeGreaterThan(0);
  expect(result.meanDifference).toBeLessThan(2);
  await page.locator(".export-menu > summary").click();
  await page.getByLabel("Include effects").uncheck();
  await page.keyboard.press("Escape");
  const cleanEvent = page.waitForEvent("download");
  await page.locator(".export-menu > summary").click();
  await page.getByRole("button", { name: "Export SVG", exact: true }).click();
  const clean = await readFile((await (await cleanEvent).path())!, "utf8");
  expect(clean).not.toContain("feDropShadow");
});
test("unsafe and unsupported files leave existing work unchanged", async ({
  page,
}) => {
  await upload(
    page,
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><script>alert(1)</script></svg>',
  );
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(6);
  await upload(
    page,
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="10" height="10" onclick="alert(1)"/></svg>',
  );
  await expect(page.getByRole("alert")).toContainText("active SVG");
  await page.getByTestId("logo-input").setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: Buffer.from("image"),
  });
  await expect(page.getByRole("alert")).toContainText("PNG");
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(6);
  await page.getByTestId("project-input").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"schemaVersion":99}'),
  });
  await expect(page.getByRole("alert")).toContainText("version");
});
test("pointer drag commits one undoable movement", async ({ page }) => {
  const shape = page.locator('.canvas-host [data-part="center"] circle');
  const box = await shape.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2 + 35,
    box!.y + box!.height / 2 + 20,
    { steps: 5 },
  );
  await page.mouse.up();
  expect(
    Number(await page.getByLabel("X position").inputValue()),
  ).toBeGreaterThan(10);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("X position")).toHaveValue("0");
});
test("desktop and narrow layouts have no page overflow", async ({ page }) => {
  for (const [width, height] of [
    [1440, 1100],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.getByLabel("X position", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/workspace-${width}.png`,
      fullPage: true,
    });
  }
});
