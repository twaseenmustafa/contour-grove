import { test, expect, type Page } from "@playwright/test";
async function setup(page: Page) {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByLabel("X position", { exact: true }).waitFor();
  await page.getByTestId("logo-input").setInputFiles({
    name: "square.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path fill="#eeeeee" d="M30 30 L170 30 L170 170 L30 170 Z"/></svg>',
    ),
  });
  await expect(page.getByText(/Opened square.svg/)).toBeVisible();
  await page.locator(".geometry-controls>summary").click();
  await page.getByRole("button", { name: "Edit path nodes" }).click();
  await expect(page.locator("[data-node-index]")).toHaveCount(4, {
    timeout: 12000,
  });
}
async function center(page: Page, index: number) {
  const box = await page.locator(`[data-node-index="${index}"]`).boundingBox();
  if (!box) throw Error("Missing node");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
test("Alt-drag creates a curve handle from a corner and undo restores it", async ({
  page,
}) => {
  await setup(page);
  const shape = page.locator(".canvas-host [data-geometry] path"),
    before = await shape.getAttribute("d");
  const p = await center(page, 0);
  await page.keyboard.down("Alt");
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 55, p.y + 35, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect(shape).not.toHaveAttribute("d", before!, { timeout: 12000 });
  await expect(page.locator('[data-node-handle="out"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(shape).toHaveAttribute("d", before!);
});

test("dragging an unselected point selects and moves it in one gesture", async ({
  page,
}) => {
  await setup(page);
  const shape = page.locator(".canvas-host [data-geometry] path");
  const before = await shape.getAttribute("d");
  const p = await center(page, 1);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 30, p.y + 25, { steps: 4 });
  await page.mouse.up();
  await expect(shape).not.toHaveAttribute("d", before!, { timeout: 12000 });
  await expect(page.getByLabel("Path anchor")).toHaveValue("1");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(shape).toHaveAttribute("d", before!);
});

test("Shift-drag constrains a point to its dominant axis", async ({ page }) => {
  await setup(page);
  const shape = page.locator(".canvas-host [data-geometry] path"),
    before = await shape.getAttribute("d"),
    p = await center(page, 0);
  await page.keyboard.down("Shift");
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 50, p.y + 20, { steps: 3 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(shape).not.toHaveAttribute("d", before!, { timeout: 12000 });
  await expect(page.getByLabel("Node y")).toHaveValue("30");
  expect(Number(await page.getByLabel("Node x").inputValue())).toBeGreaterThan(
    30,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(shape).toHaveAttribute("d", before!);
});

test("arrow keys nudge the selected point with a larger Shift step and undo", async ({
  page,
}) => {
  await setup(page);
  const shape = page.locator(".canvas-host [data-geometry] path"),
    before = await shape.getAttribute("d");
  await page.locator(".canvas-host").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel("Node x")).toHaveValue("31", { timeout: 12000 });
  await page.keyboard.press("Shift+ArrowDown");
  await expect(page.getByLabel("Node y")).toHaveValue("40", { timeout: 12000 });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(shape).toHaveAttribute("d", before!);
});

test("Escape cancels a point drag before leaving point editing", async ({
  page,
}) => {
  await setup(page);
  const shape = page.locator(".canvas-host [data-geometry] path"),
    before = await shape.getAttribute("d"),
    p = await center(page, 0);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 30, p.y + 20, { steps: 3 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(shape).toHaveAttribute("d", before!);
  await expect(page.locator("[data-node-overlay]")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-node-overlay]")).toHaveCount(0);
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(1);
  await expect(shape).toHaveAttribute("d", before!);
});

test("Alt+Shift-drag creates an independent incoming handle", async ({
  page,
}) => {
  await setup(page);
  const p = await center(page, 1),
    shape = page.locator(".canvas-host [data-geometry] path"),
    before = await shape.getAttribute("d");
  await page.keyboard.down("Alt");
  await page.keyboard.down("Shift");
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x - 45, p.y + 20, { steps: 3 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await page.keyboard.up("Alt");
  await expect(shape).not.toHaveAttribute("d", before!, { timeout: 12000 });
  await expect(page.locator('[data-node-handle="in"]')).toHaveCount(1);
  await expect(page.getByLabel("Path anchor")).toHaveValue("1");
});
test("typing in a coordinate field and keys during a drag do not nudge the path", async ({
  page,
}) => {
  await setup(page);
  const shape = page.locator(".canvas-host [data-geometry] path"),
    before = await shape.getAttribute("d");
  const input = page.getByLabel("Node x");
  await input.focus();
  await page.keyboard.press("ArrowUp");
  await expect(shape).toHaveAttribute("d", before!);
  const p = await center(page, 0);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(shape).toHaveAttribute("d", before!);
  await expect(page.locator("[data-node-overlay]")).toHaveCount(1);
});
