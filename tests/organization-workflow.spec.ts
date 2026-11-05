import { test, expect, type Page, type Locator } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function start(page: Page) {
  await page.goto("/");
  await expect(page.getByLabel("X position")).toBeVisible();
}
async function selectTwo(page: Page) {
  await page
    .getByRole("checkbox", { name: "Select Petal 2", exact: true })
    .check();
  await expect(
    page.getByRole("heading", { name: "2 parts selected", exact: true }),
  ).toBeVisible();
}
async function backup(page: Page) {
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  return JSON.parse(await readFile((await (await event).path())!, "utf8"));
}
async function center(el: Locator) {
  const b = await el.boundingBox();
  if (!b) throw Error("Missing shape");
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
test("group, move, duplicate, ungroup and undo retain independent geometry", async ({
  page,
}) => {
  await start(page);
  await selectTwo(page);
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Group 1", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".canvas-host [data-multiple]")).toHaveCount(1);
  await expect(page.locator(".canvas-host [data-handle]")).toHaveCount(0);
  await page.getByLabel("Move selection X").fill("18");
  await page.getByLabel("Move selection Y").fill("9");
  await page
    .getByRole("button", { name: "Move selection", exact: true })
    .click();
  const p = await backup(page);
  expect(p.parts[0].x).toBe(18);
  expect(p.parts[1].x).toBe(18);
  expect(p.parts[0].y).toBe(9);
  expect(p.groups).toHaveLength(1);
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(8);
  const copy = await backup(page);
  expect(copy.groups).toHaveLength(2);
  expect(new Set(copy.parts.map((p: { id: string }) => p.id)).size).toBe(8);
  await page.getByRole("button", { name: "Ungroup", exact: true }).click();
  expect((await backup(page)).groups).toHaveLength(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await backup(page)).groups).toHaveLength(2);
});
test("group click-drag moves all members in one undo step and Escape restores preview", async ({
  page,
}) => {
  await start(page);
  await selectTwo(page);
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await page.getByRole("button", { name: "Deselect", exact: true }).click();
  await page.locator(".canvas-host").scrollIntoViewIfNeeded();
  const shape = page.locator('.canvas-host [data-part="petal-1"] path');
  const pos = await center(shape);
  await page.mouse.move(pos.x, pos.y - 10);
  await page.mouse.down();
  await page.mouse.move(pos.x + 25, pos.y + 10, { steps: 6 });
  await page.mouse.up();
  const p = await backup(page);
  expect(p.parts[0].x).toBeGreaterThan(0);
  expect(p.parts[0].x).toBeCloseTo(p.parts[1].x);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const original = await backup(page);
  expect(original.parts[0].x).toBe(0);
  expect(original.parts[1].x).toBe(0);
  expect(original.groups).toHaveLength(1);
  await page.locator(".canvas-host").scrollIntoViewIfNeeded();
  const point = await center(shape);
  await page.mouse.move(point.x, point.y - 10);
  await page.mouse.down();
  await page.mouse.move(point.x + 20, point.y + 15);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(
    page.locator('.canvas-host [data-part="petal-1"] > g'),
  ).toHaveAttribute("transform", "translate(0 0)");
});
test("hidden parts stay out of exports while locked parts remain visible and protected", async ({
  page,
}) => {
  await start(page);
  await page.locator(".organization-controls summary").click();
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await expect(page.getByLabel("X position")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Delete", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Duplicate", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(6);
  await expect(page.locator(".canvas-host [data-handle]")).toHaveCount(0);
  await page.getByRole("button", { name: "Hide", exact: true }).click();
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(5);
  const event = page.waitForEvent("download");
  await page.locator(".export-menu > summary").click();
  await page.getByRole("button", { name: "Export SVG", exact: true }).click();
  const svg = await readFile((await (await event).path())!, "utf8");
  expect(svg).not.toContain('data-part="petal-1"');
  expect(svg).toContain('data-part="petal-2"');
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.getByLabel("X position")).toBeEnabled();
  await expect(page.locator(".canvas-host [data-handle]")).toHaveCount(5);
});
test("front/back order changes actual SVG order and survives reload with group flags", async ({
  page,
}) => {
  await start(page);
  await selectTwo(page);
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await page.getByRole("button", { name: "To front", exact: true }).click();
  expect(
    await page
      .locator(".canvas-host [data-part]")
      .evaluateAll((nodes) =>
        nodes.slice(-2).map((n) => n.getAttribute("data-part")),
      ),
  ).toEqual(["petal-1", "petal-2"]);
  expect(
    (await backup(page)).parts.slice(-2).map((p: { id: string }) => p.id),
  ).toEqual(["petal-1", "petal-2"]);
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await page.getByRole("button", { name: "Hide", exact: true }).click();
  await expect(page.locator(".save-status")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(4);
  const p = await backup(page);
  expect(p.groups).toHaveLength(1);
  expect(
    p.parts
      .slice(-2)
      .every((p: { locked: boolean; hidden: boolean }) => p.locked && p.hidden),
  ).toBe(true);
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("project-input").setInputFiles({
    name: "organized.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(4);
  expect((await backup(page)).groups).toHaveLength(1);
});
test("delete all yields a valid empty canvas, backup, export and reversible undo", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(0);
  await expect(
    page.getByText("Your canvas is empty.", { exact: false }),
  ).toBeVisible();
  const p = await backup(page);
  expect(p.parts).toHaveLength(0);
  const event = page.waitForEvent("download");
  await page.locator(".export-menu > summary").click();
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  expect(
    (await readFile((await (await event).path())!))
      .subarray(0, 8)
      .toString("hex"),
  ).toBe("89504e470d0a1a0a");
  await page.screenshot({
    path: ".internal_docs/verifications/organization-empty.jpg",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(6);
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("project-input").setInputFiles({
    name: "empty.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(0);
  await expect(page.locator(".save-status")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(0);
});
test("keyboard shortcuts respect text fields; selection and responsive states stay accessible", async ({
  page,
}) => {
  await start(page);
  await page.getByLabel("X position").fill("12");
  await page.getByLabel("X position").press("Delete");
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(6);
  await page.getByRole("button", { name: "Deselect", exact: true }).click();
  await page.getByRole("button", { name: /Petal 1/ }).click();
  await page.keyboard.press("Control+d");
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(7);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: /Petal 1/ }).click();
  await selectTwo(page);
  await page.keyboard.press("Control+g");
  await expect(
    page.getByRole("heading", { name: "Group 1", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: ".internal_docs/verifications/organization-desktop.jpg",
    fullPage: true,
    animations: "disabled",
  });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.screenshot({
    path: ".internal_docs/verifications/organization-dark.jpg",
    fullPage: true,
    animations: "disabled",
  });
  await page.emulateMedia({
    colorScheme: "light",
    reducedMotion: "no-preference",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".internal_docs/verifications/organization-mobile.jpg",
    fullPage: true,
    animations: "disabled",
  });
});
