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
test("desktop workbench fits its viewport and preview fits width and height without document edits", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await start(page);
  const before = await backup(page);
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(size);
    const m = await page.evaluate(() => {
      const rect = (s: string) =>
        document.querySelector(s)!.getBoundingClientRect().toJSON();
      return {
        scroll: document.documentElement.scrollHeight,
        inner: innerHeight,
        main: rect(".workspace-grid"),
        mount: rect(".artboard-mount"),
        canvas: rect(".canvas-host"),
        toolbar: rect(".topbar"),
      };
    });
    expect(m.scroll).toBeLessThanOrEqual(m.inner + 1);
    expect(m.canvas.width).toBeGreaterThan(170);
    expect(m.canvas.height).toBeGreaterThan(170);
    expect(m.canvas.width).toBeLessThanOrEqual(m.mount.width + 1);
    expect(m.canvas.height).toBeLessThanOrEqual(m.mount.height + 1);
    expect(m.toolbar.bottom).toBeLessThanOrEqual(m.inner);
    await expect(page.locator(".handle-rotate .handle-ink")).toBeVisible();
    const ink = await page.locator(".handle-rotate .handle-ink").boundingBox();
    expect(ink!.y).toBeGreaterThanOrEqual(m.canvas.y);
    expect(ink!.y + ink!.height).toBeLessThanOrEqual(m.canvas.bottom);
  }
  expect(await backup(page)).toEqual(before);
  await page
    .getByRole("button", { name: "Dismiss message", exact: true })
    .click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: ".internal_docs/verifications/workbench-desktop.jpg",
    fullPage: true,
    animations: "disabled",
  });
  await page.locator(".canvas-setup > summary").click();
  await page.getByLabel("Canvas width", { exact: true }).fill("900");
  await page.getByLabel("Canvas height", { exact: true }).fill("300");
  await page
    .getByRole("button", { name: "Apply canvas size", exact: true })
    .click();
  const b = await page
    .locator(".canvas-host [data-export-frame]")
    .boundingBox();
  expect(b!.width / b!.height).toBeCloseTo(3, 1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await backup(page)).viewBox).toEqual(before.viewBox);
});
test("anchored guide does not displace the canvas and Escape returns focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await start(page);
  const before = await page.locator(".canvas-host").boundingBox();
  const summary = page.locator(".studio-help > summary");
  await summary.click();
  await expect(
    page.getByText("Stay in control", { exact: true }),
  ).toBeVisible();
  expect(await page.locator(".canvas-host").boundingBox()).toEqual(before);
  await page.screenshot({
    path: ".internal_docs/verifications/workbench-guide.jpg",
    fullPage: true,
    animations: "disabled",
  });
  await summary.press("Escape");
  await expect(page.locator(".studio-help")).not.toHaveAttribute("open", "");
  await expect(summary).toBeFocused();
});
test("narrow workbench retains all real controls and accessible region navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await page.getByRole("link", { name: "Properties", exact: true }).click();
  await expect(page).toHaveURL(/#logo-properties$/);
  await page.getByLabel("Rotation", { exact: true }).fill("15");
  await page.getByLabel("Rotation", { exact: true }).press("Enter");
  await page.getByRole("link", { name: "Assets", exact: true }).click();
  await expect(page.getByRole("tab", { name: /Assets/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "+ Upload assets", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.screenshot({
    path: ".internal_docs/verifications/workbench-mobile.jpg",
    fullPage: true,
    animations: "disabled",
  });
  await page.locator(".studio-help > summary").click();
  await expect(
    page.getByText("Stay in control", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".internal_docs/verifications/workbench-mobile-guide.jpg",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Close guide", exact: true }).click();
  await expect(page.locator(".studio-help")).not.toHaveAttribute("open", "");
});
