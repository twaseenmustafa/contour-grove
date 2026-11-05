import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("X position", { exact: true }).waitFor();
});
test("right-click a layer duplicates and undo restores it", async ({
  page,
}) => {
  const parts = page.locator(".canvas-host [data-part]");
  await expect(parts).toHaveCount(6);
  const p = parts.nth(0);
  await p.click({ button: "right", force: true });
  const menu = page.getByRole("menu", { name: "Canvas actions" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(parts).toHaveCount(7);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(parts).toHaveCount(6);
});
test("right-click exposes ungroup, after which layers can be selected individually", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page.keyboard.press("Control+g");
  await expect(page.getByText("Grouped selected parts.")).toBeVisible();
  await page
    .locator(".canvas-host [data-part]")
    .first()
    .click({ button: "right", force: true });
  const menu = page.getByRole("menu", { name: "Canvas actions" });
  await expect(menu.getByRole("menuitem", { name: "Ungroup" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "Ungroup" }).click();
  await expect(
    page.getByText("Ungrouped. The shapes stay separate."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Deselect" }).click();
  await page.getByRole("button", { name: "Petal 1", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Select Petal 1" }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Select Petal 2" }),
  ).not.toBeChecked();
});
test("menu respects locked layers and keyboard dismissal", async ({ page }) => {
  const part = page.getByRole("button", { name: "Petal 1", exact: true });
  await part.click({ button: "right" });
  let menu = page.getByRole("menu", { name: "Canvas actions" });
  await menu.getByRole("menuitem", { name: "Lock", exact: true }).click();
  await page
    .getByRole("button", { name: "Petal 1 Locked", exact: true })
    .click({ button: "right" });
  menu = page.getByRole("menu", { name: "Canvas actions" });
  await expect(menu.getByRole("menuitem", { name: "Delete" })).toBeDisabled();
  await expect(menu.getByRole("menuitem", { name: "Unlock" })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(page.locator(".canvas-host")).toBeFocused();
});
test("menu stays inside viewport and closes when clicking elsewhere", async ({
  page,
}) => {
  const host = page.locator(".canvas-host"),
    box = (await host.boundingBox())!;
  await page.mouse.click(box.x + box.width - 2, box.y + box.height - 2, {
    button: "right",
  });
  const menu = page.getByRole("menu", { name: "Canvas actions" });
  await expect(menu).toBeVisible();
  const r = (await menu.boundingBox())!;
  expect(r.x).toBeGreaterThanOrEqual(0);
  expect(r.y).toBeGreaterThanOrEqual(0);
  expect(r.x + r.width).toBeLessThanOrEqual(1280);
  expect(r.y + r.height).toBeLessThanOrEqual(720);
  await page.getByRole("button", { name: "Hide inspector" }).click();
  await expect(menu).toHaveCount(0);
});

test("keyboard context menu keeps the selection and supports arrow keys", async ({
  page,
}) => {
  await page.locator(".canvas-host").focus();
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu", { name: "Canvas actions" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Duplicate" })).toBeEnabled();
  await page.keyboard.press("ArrowDown");
  await expect(
    menu.getByRole("menuitem", { name: "Cut with scissors" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".canvas-host")).toBeFocused();
});

test("ungroup a vector design, cut a shape from its menu and undo", async ({
  page,
}) => {
  page.on("dialog", (d) => d.accept());
  await page.getByTestId("logo-input").setInputFiles({
    name: "pieces.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="20" y="20" width="160" height="160" fill="#eee"/><circle cx="100" cy="100" r="20" fill="#777"/></svg>',
    ),
  });
  const parts = page.locator(".canvas-host [data-part]");
  await expect(parts).toHaveCount(2);
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page.keyboard.press("Control+g");
  await parts.first().click({ button: "right", force: true });
  let menu = page.getByRole("menu", { name: "Canvas actions" });
  await expect(
    menu.getByRole("menuitem", { name: "Cut with scissors" }),
  ).toBeDisabled();
  await menu.getByRole("menuitem", { name: "Ungroup" }).click();
  await page.getByRole("button", { name: "Deselect" }).click();
  await parts
    .first()
    .click({ button: "right", force: true, position: { x: 10, y: 10 } });
  menu = page.getByRole("menu", { name: "Canvas actions" });
  await menu.getByRole("menuitem", { name: "Cut with scissors" }).click();
  await expect(
    page.getByRole("button", { name: "Scissors tool" }),
  ).toHaveAttribute("aria-pressed", "true");
  const b = (await parts.first().boundingBox())!;
  await page.mouse.move(b.x - 15, b.y + b.height / 3);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width + 15, b.y + b.height / 3, { steps: 6 });
  await page.mouse.up();
  await expect(parts).toHaveCount(3, { timeout: 10000 });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(parts).toHaveCount(2);
});
