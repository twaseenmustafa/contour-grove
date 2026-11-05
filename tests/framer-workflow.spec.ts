import { test, expect } from "@playwright/test";

test("compact editor keeps document and history in one header, with refined docks and inline geometry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByLabel("X position", { exact: true })).toBeVisible();
  await expect(page.locator(".topbar .document-title")).toContainText(
    "Bloom study",
  );
  await expect(page.locator(".topbar .history-actions")).toBeVisible();
  await expect(page.locator(".canvas-toolbar")).toHaveCount(0);
  const m = await page.evaluate(() => {
    const header = document.querySelector(".topbar")!.getBoundingClientRect();
    const dock = getComputedStyle(document.querySelector(".parts-panel")!);
    const width = document.querySelector<HTMLInputElement>(
      '[aria-label="Width"]',
    )!;
    const label = width.closest("label")!.getBoundingClientRect();
    const input = width.getBoundingClientRect();
    return {
      headerHeight: header.height,
      radius: dock.borderRadius,
      labelHeight: label.height,
      inputHeight: input.height,
      scroll: document.documentElement.scrollHeight,
      height: innerHeight,
    };
  });
  expect(m.headerHeight).toBe(56);
  expect(m.radius).toBe("0px");
  expect(m.labelHeight).toBeLessThanOrEqual(38);
  expect(m.inputHeight).toBeGreaterThanOrEqual(28);
  expect(m.scroll).toBeLessThanOrEqual(m.height + 1);
  await page.getByLabel("Width", { exact: true }).fill("90");
  await page.getByLabel("Width", { exact: true }).press("Enter");
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeEnabled();
});

test("mobile history icons stay visible and undo works without keyboard shortcuts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("link", { name: "Properties", exact: true }).click();
  await page.getByLabel("X position", { exact: true }).fill("24");
  await expect(page.getByLabel("X position", { exact: true })).toHaveValue(
    "24",
  );
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await undo.scrollIntoViewIfNeeded();
  await expect(undo.locator("svg")).toBeVisible();
  await undo.click();
  await expect(page.getByLabel("X position", { exact: true })).toHaveValue("0");
  await expect(
    page.getByRole("button", { name: "Redo", exact: true }).locator("svg"),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
