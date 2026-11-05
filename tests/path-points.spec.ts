import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function open(page: Page, content: string) {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByLabel("X position", { exact: true }).waitFor();
  await page.getByTestId("logo-input").setInputFiles({
    name: "shape.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(content),
  });
  await expect(page.getByText(/Opened shape.svg/)).toBeVisible();
  await page.locator(".geometry-controls>summary").click();
  await page.getByRole("button", { name: "Edit path nodes" }).click();
  await expect(page.getByLabel("Path anchor")).toBeVisible({ timeout: 12000 });
}
async function save(page: Page) {
  const d = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  return JSON.parse(await readFile((await (await d).path())!, "utf8"));
}
const curve =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g transform="translate(10 0) scale(.9)"><path fill="none" stroke="#eeeeee" stroke-width="3" d="M20 100 C60 20 140 20 180 100"/></g></svg>';
test("add and remove points preserve transform and allow undo", async ({
  page,
}) => {
  await open(page, curve);
  const path = page.locator(".canvas-host [data-geometry] path");
  const before = await save(page);
  const measure = async () =>
    path.evaluate((el) => {
      const p = el as SVGPathElement,
        l = p.getTotalLength();
      return [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => {
        const v = p.getPointAtLength(l * t);
        return [v.x, v.y];
      });
    });
  const points = await measure();
  await page.getByRole("button", { name: "Add point after" }).click();
  await expect(page.locator("[data-node-index]")).toHaveCount(3, {
    timeout: 12000,
  });
  const next = await save(page);
  expect(next.parts[0].matrix).toEqual(before.parts[0].matrix);
  expect(next.parts[0].stroke).toBe(before.parts[0].stroke);
  const added = await measure();
  for (let i = 0; i < points.length; i++)
    for (let j = 0; j < 2; j++)
      expect(added[i][j]).toBeCloseTo(points[i][j], 1);
  await page.getByRole("button", { name: "Remove point" }).click();
  await expect(page.locator("[data-node-index]")).toHaveCount(2, {
    timeout: 12000,
  });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await save(page)).parts).toEqual(next.parts);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await save(page)).parts).toEqual(before.parts);
});
test("double-click on a curve inserts a point", async ({ page }) => {
  await open(page, curve);
  const path = page.locator(".canvas-host [data-geometry] path");
  const p = await path.evaluate((el) => {
    const q = el as SVGPathElement,
      m = q.getScreenCTM()!,
      pt = q.getPointAtLength(q.getTotalLength() * 0.4);
    const r = new DOMPoint(pt.x, pt.y).matrixTransform(m);
    return { x: r.x, y: r.y };
  });
  await page.mouse.dblclick(p.x, p.y);
  await expect(page.locator("[data-node-index]")).toHaveCount(3, {
    timeout: 12000,
  });
  await expect(page.getByLabel("Path anchor")).toHaveValue("1");
});
test("minimum point counts are protected", async ({ page }) => {
  await open(
    page,
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path fill="#eeeeee" d="M20 20L180 20L100 180Z"/></svg>',
  );
  const before = await save(page);
  await page.getByRole("button", { name: "Remove point" }).click();
  await expect(page.locator(".geometry-error")).toContainText(
    "at least three points",
  );
  expect((await save(page)).parts).toEqual(before.parts);
});

test("double-click text opens the inspector and selects its words", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("X position", { exact: true }).waitFor();
  await page.locator(".insert-menu>summary").click();
  await page.getByRole("button", { name: "Create text" }).click();
  await page.getByRole("button", { name: "Hide inspector" }).click();
  const text = page.locator(".canvas-host [data-part] text");
  await text.dblclick();
  const field = page.getByLabel("Text", { exact: true });
  await expect(field).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Hide inspector" }),
  ).toBeVisible();
  expect(
    await field.evaluate(
      (e: HTMLInputElement) => e.selectionEnd! - e.selectionStart!,
    ),
  ).toBe("Your text".length);
  await field.fill("Studio");
  await field.press("Enter");
  await expect(text).toHaveText("Studio");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(text).toHaveText("Your text");
});

test("Delete in point editing removes a point, not the entire shape", async ({
  page,
}) => {
  await open(page, curve);
  const before = await save(page);
  await page.getByRole("button", { name: "Add point after" }).click();
  await expect(page.locator("[data-node-index]")).toHaveCount(3, {
    timeout: 12000,
  });
  await page.locator(".canvas-host").focus();
  await page.keyboard.press("Delete");
  await expect(page.locator("[data-node-index]")).toHaveCount(2, {
    timeout: 12000,
  });
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await save(page)).parts).toEqual(before.parts);
});

test("adding a point to a compound hole preserves fill rule and all subpaths", async ({
  page,
}) => {
  await open(
    page,
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path fill="#eeeeee" fill-rule="evenodd" d="M20 20H180V180H20Z M60 60H140V140H60Z"/></svg>',
  );
  const before = await save(page);
  await page.getByLabel("Node subpath").selectOption({ value: "1" });
  await page.getByRole("button", { name: "Add point after" }).click();
  await expect(page.locator("[data-node-index]")).toHaveCount(9, {
    timeout: 12000,
  });
  const shape = page.locator(".canvas-host [data-geometry] path");
  expect(
    await shape.evaluate((e) =>
      (e as SVGGeometryElement).isPointInFill(new DOMPoint(100, 100)),
    ),
  ).toBe(false);
  const after = await save(page);
  expect(after.parts[0].fillRule).toBe("evenodd");
  expect(after.source).toEqual(before.source);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await save(page)).parts).toEqual(before.parts);
});

test("adding after the last point on an open line leaves it unchanged", async ({
  page,
}) => {
  await open(page, curve);
  const before = await save(page);
  await page.getByLabel("Path anchor").selectOption({ value: "1" });
  await page.getByRole("button", { name: "Add point after" }).click();
  await expect(page.locator(".geometry-error")).toContainText("line after");
  expect((await save(page)).parts).toEqual(before.parts);
});

test("an open line keeps at least two points", async ({ page }) => {
  await open(page, curve);
  const before = await save(page);
  await page.getByRole("button", { name: "Remove point" }).click();
  await expect(page.locator(".geometry-error")).toContainText(
    "two in an open line",
  );
  expect((await save(page)).parts).toEqual(before.parts);
});
