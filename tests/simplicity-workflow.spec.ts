import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function start(page: Page) {
  await page.goto("/");
  await expect(page.getByLabel("X position", { exact: true })).toBeVisible();
}
async function backup(page: Page) {
  const wait = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  return JSON.parse(await readFile((await (await wait).path())!, "utf8"));
}
test("dark transparency preview and optional ink outlines never alter source colors, geometry or exports", async ({
  page,
}) => {
  await start(page);
  await page.getByTestId("logo-input").setInputFiles({
    name: "black-mark.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"><path d="M60 180 L110 50 L160 110 L260 50 L230 100 L150 150 L115 110 L85 190Z" fill="#111111"/></svg>',
    ),
  });
  await expect(page.locator(".canvas-host [data-dark-ink]")).toHaveCount(1);
  expect(
    await page.locator(".canvas-host").evaluate((el) => ({
      color: getComputedStyle(el).backgroundColor,
      image: getComputedStyle(el).backgroundImage,
    })),
  ).toEqual({ color: "rgba(0, 0, 0, 0)", image: "none" });
  const original = await backup(page);
  await page.locator(".canvas-setup > summary").click();
  await page.getByLabel("Outline dark ink in preview").uncheck();
  await expect(page.locator(".canvas-host")).toHaveAttribute(
    "data-ink-edges",
    "false",
  );
  expect(await backup(page)).toEqual(original);
  await page.getByLabel("Outline dark ink in preview").check();
  expect(await backup(page)).toEqual(original);
  await page.locator(".export-menu > summary").click();
  const wait = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG", exact: true }).click();
  const svg = await readFile((await (await wait).path())!, "utf8");
  expect(svg).toContain('fill="#111111"');
  expect(svg).not.toMatch(/data-dark-ink|drop-shadow|data-selection|#292623/);
  await page
    .getByRole("button", { name: "Dismiss message", exact: true })
    .click();
  await page.locator(".canvas-setup > summary").click();
  await page.locator(".inspector").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({
    path: ".internal_docs/verifications/simplicity-black-ink.jpg",
    fullPage: true,
    animations: "disabled",
  });
});
test("file and export menus are keyboard dismissible and options stay open until an action is chosen", async ({
  page,
}) => {
  await start(page);
  const file = page.locator(".file-menu > summary");
  await file.focus();
  await file.press("Enter");
  await expect(
    page.getByRole("button", { name: "Open project", exact: true }),
  ).toBeVisible();
  await file.press("Escape");
  await expect(file).toBeFocused();
  await expect(page.locator(".file-menu")).not.toHaveAttribute("open", "");
  await file.click();
  await page.locator(".brand").click();
  await expect(page.locator(".file-menu")).not.toHaveAttribute("open", "");
  await page.locator(".export-menu > summary").click();
  await page.getByLabel("Include effects").uncheck();
  await expect(page.locator(".export-menu")).toHaveAttribute("open", "");
  await page.screenshot({
    path: ".internal_docs/verifications/simplicity-export.jpg",
    fullPage: true,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(page.locator(".export-menu > summary")).toBeFocused();
  await expect(page.locator(".export-menu")).not.toHaveAttribute("open", "");
});
test("simplified desktop has one command bar and small screens retain all editing regions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await start(page);
  await expect(
    page.getByRole("navigation", { name: "Workspace navigation" }),
  ).not.toBeVisible();
  await expect(page.locator(".export-bar")).toHaveCount(0);
  await expect(page.getByLabel("Width", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Part color", { exact: true })).toBeVisible();
  await page.screenshot({
    path: ".internal_docs/verifications/simplicity-desktop.jpg",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("link", { name: "Assets", exact: true }).click();
  await page
    .getByRole("button", { name: "+ Upload assets", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "+ Upload assets", exact: true }),
  ).toBeEnabled();
  await page.getByRole("link", { name: "Properties", exact: true }).click();
  await page.getByLabel("Rotation", { exact: true }).fill("20");
  await page.getByLabel("Rotation", { exact: true }).press("Enter");
  await expect(page.getByLabel("Rotation", { exact: true })).toHaveValue("20");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "Canvas", exact: true }).click();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: ".internal_docs/verifications/simplicity-mobile.jpg",
    fullPage: true,
    animations: "disabled",
  });
  await page.locator(".studio-help > summary").click();
  await expect(
    page.getByRole("button", { name: "Close guide", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".internal_docs/verifications/simplicity-mobile-guide.jpg",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Close guide", exact: true }).click();
});
