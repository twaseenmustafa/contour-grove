import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function backup(page: Page) {
  const d = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  return JSON.parse(await readFile((await (await d).path())!, "utf8"));
}
async function start(page: Page) {
  await page.goto("/");
  await expect(page.getByLabel("X position")).toBeVisible();
  await page.getByTestId("logo-input").setInputFiles({
    name: "layout.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -20 400 200"><rect x="0" y="0" width="20" height="30"/><rect x="80" y="40" width="40" height="20"/><rect x="200" y="80" width="10" height="10"/></svg>',
    ),
  });
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(3);
}
async function boxes(page: Page) {
  return page.locator(".canvas-host [data-part]").evaluateAll((els) =>
    els.map((el) => {
      const b = (el as SVGGraphicsElement).getBBox();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    }),
  );
}
test("alignment uses actual transformed bounds and is one undoable document edit", async ({
  page,
}) => {
  await start(page);
  const before = await backup(page);
  await page
    .getByRole("button", { name: "Align horizontal center", exact: true })
    .click();
  expect((await boxes(page))[0].x).toBe(140);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await backup(page)).toEqual(before);
});
test("equal spacing preserves endpoints and group alignment translates all members rigidly", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page
    .getByRole("button", { name: "Distribute horizontal spacing", exact: true })
    .click();
  let b = await boxes(page);
  expect(b[1].x - b[0].x - b[0].width).toBeCloseTo(
    b[2].x - b[1].x - b[1].width,
    5,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page
    .locator(".organize-controls > summary")
    .count()
    .then(async (n) => {
      if (n) await page.locator(".organize-controls > summary").click();
    });
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await page.getByLabel("Align relative to").selectOption("canvas");
  await page.getByRole("button", { name: "Align left", exact: true }).click();
  b = await boxes(page);
  expect(b.map((x) => x.x)).toEqual([-50, 30, 150]);
});
