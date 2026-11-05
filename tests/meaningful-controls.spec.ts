import { test, expect } from "@playwright/test";

test("Add and Shapes have clear, separate choices", async ({ page }) => {
  await page.goto("/");
  const add = page.locator(".insert-menu > summary");
  const shapes = page.locator(".shapes-menu > summary");
  await expect(add).toHaveAttribute("aria-label", "Add");
  await expect(shapes).toHaveAttribute("aria-label", "Shapes");
  const alignment = await add.evaluate((el) => {
    const outer = el.getBoundingClientRect();
    const icon = el.querySelector("svg")!.getBoundingClientRect();
    return {
      x: Math.abs((outer.left + outer.right - icon.left - icon.right) / 2),
      y: Math.abs((outer.top + outer.bottom - icon.top - icon.bottom) / 2),
    };
  });
  expect(alignment.x).toBeLessThan(1);
  expect(alignment.y).toBeLessThan(1);
  await add.click();
  await expect(page.getByRole("button", { name: "Create text" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Upload image or SVG" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create rectangle" }),
  ).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(add).toBeFocused();
  await shapes.click();
  await expect(
    page.getByRole("button", { name: "Create rectangle" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create rectangle" }).click();
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(7);
  await expect(shapes).toBeFocused();
});

test("panel controls are next to their panels and reopen from the canvas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator(".topbar .dock-toggle")).toHaveCount(0);
  await page
    .locator(".parts-panel")
    .getByRole("button", { name: "Hide library" })
    .click();
  const library = page.getByRole("button", { name: "Show library" });
  await expect(library).toBeVisible();
  await expect(library).toBeFocused();
  await library.click();
  await expect(page.locator(".parts-panel")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Hide library" }),
  ).toBeFocused();
  await page
    .locator(".inspector")
    .getByRole("button", { name: "Hide inspector" })
    .click();
  const properties = page.getByRole("button", { name: "Show inspector" });
  await expect(properties).toBeVisible();
  await expect(properties).toBeFocused();
  await properties.click();
  await expect(page.locator(".inspector")).toBeVisible();
});
