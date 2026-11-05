import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function start(page: Page) {
  await page.goto("/");
  await expect(page.getByLabel("X position", { exact: true })).toBeVisible();
}
async function box(page: Page) {
  return (await page.locator(".canvas-host > svg").getAttribute("viewBox"))!
    .split(" ")
    .map(Number);
}
async function backup(page: Page) {
  const wait = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const data = JSON.parse(await readFile((await (await wait).path())!, "utf8"));
  await page
    .getByRole("button", { name: "Dismiss message", exact: true })
    .click();
  return data;
}
test("Hand pan changes only the preview camera; Fit restores it and export/backup are untouched", async ({
  page,
}) => {
  await start(page);
  const original = await backup(page),
    vb = await box(page);
  await page.getByRole("button", { name: "Hand tool", exact: true }).click();
  const b = (await page.locator(".canvas-host").boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.5 + 70, b.y + b.height * 0.5 + 35, {
    steps: 5,
  });
  await page.mouse.up();
  expect((await box(page))[0]).toBeLessThan(vb[0]);
  expect(await backup(page)).toEqual(original);
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await page.locator(".export-menu > summary").click();
  const wait = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG", exact: true }).click();
  const svg = await readFile((await (await wait).path())!, "utf8");
  expect(svg).toContain(`viewBox="${original.viewBox.join(" ")}"`);
  expect(svg).not.toMatch(/data-selection|data-tool|camera/);
  await page
    .getByRole("button", { name: "Fit to canvas", exact: true })
    .click();
  expect(await box(page)).toEqual(vb);
});
test("Space and middle-button pan never move artwork; Escape and focus loss restore a canceled camera", async ({
  page,
}) => {
  await start(page);
  const vb = await box(page),
    b = (await page.locator(".canvas-host").boundingBox())!;
  const x = b.x + b.width * 0.4,
    y = b.y + b.height * 0.4;
  await page.mouse.move(x, y);
  await page.keyboard.down("Space");
  await page.mouse.down();
  await page.mouse.move(x + 65, y + 20, { steps: 4 });
  expect(await box(page)).not.toEqual(vb);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.keyboard.up("Space");
  expect(await box(page)).toEqual(vb);
  await page.mouse.move(x, y);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(x - 40, y + 30, { steps: 4 });
  expect(await box(page)).not.toEqual(vb);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.mouse.up({ button: "middle" });
  expect(await box(page)).toEqual(vb);
  await expect(page.getByLabel("X position", { exact: true })).toHaveValue("0");
  await expect(
    page.getByRole("button", { name: "Select tool", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
test("Hand tool has keyboard pan alternatives and zoom retains camera/document separation", async ({
  page,
}) => {
  await start(page);
  const vb = await box(page);
  await page.getByRole("button", { name: "Hand tool", exact: true }).click();
  await page.locator(".canvas-host").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowUp");
  const p = await box(page);
  expect(p[0]).toBe(vb[0] + 10);
  expect(p[1]).toBe(vb[1] - 50);
  await page.getByLabel("Canvas zoom").selectOption("2");
  expect((await box(page))[2]).toBeCloseTo(vb[2] / 2, 4);
  await page
    .getByRole("button", { name: "Fit to canvas", exact: true })
    .click();
  expect(await box(page)).toEqual(vb);
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
});
