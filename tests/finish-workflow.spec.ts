import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function backup(page: Page) {
  const d = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  return JSON.parse(await readFile((await (await d).path())!, "utf8"));
}
async function start(page: Page) {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await expect(page.getByLabel("X position")).toBeVisible();
  await page.locator(".finish-controls > summary").click();
}
test("grain and depth are deterministic, reversible, persistent and shared by SVG/PNG export", async ({
  page,
}) => {
  await start(page);
  const original = await backup(page);
  await page.getByLabel("Grain amount", { exact: true }).fill("30");
  await page.getByLabel("Depth amount", { exact: true }).fill("12");
  await page.getByLabel("Depth amount", { exact: true }).press("Enter");
  await expect(
    page.locator(".canvas-host #finish-petal-1 feTurbulence"),
  ).toHaveAttribute("seed", "17");
  await expect(
    page.locator(".canvas-host #finish-petal-1 feOffset"),
  ).toHaveCount(6);
  const changed = await backup(page);
  expect(changed.parts[0].geometry).toEqual(original.parts[0].geometry);
  expect(changed.source).toEqual(original.source);
  expect(changed.parts[0].finish).toEqual({
    grain: 0.3,
    depth: 12,
    angle: 45,
    color: "#444444",
  });
  await page.locator(".export-menu > summary").click();
  let d = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG", exact: true }).click();
  let svg = await readFile((await (await d).path())!, "utf8");
  expect(svg).toContain("feTurbulence");
  expect(svg).toContain('viewBox="68 68 344 344"');
  await page.locator(".export-menu > summary").click();
  await page.getByLabel("Include effects", { exact: true }).uncheck();
  d = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG", exact: true }).click();
  svg = await readFile((await (await d).path())!, "utf8");
  expect(svg).not.toContain("feTurbulence");
  expect(svg).toContain('viewBox="80 80 320 320"');
  await page.locator(".export-menu > summary").click();
  await page.getByLabel("Include effects", { exact: true }).check();
  d = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  const png = await readFile((await (await d).path())!);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.length).toBeGreaterThan(10000);
  await page
    .getByRole("button", { name: "Remove finish", exact: true })
    .click();
  await expect(page.locator(".canvas-host #finish-petal-1")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await backup(page)).parts[0].finish.depth).toBe(12);
  await page.getByTestId("project-input").setInputFiles({
    name: "finish.logo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(changed)),
  });
  await expect(
    page.locator(".canvas-host #finish-petal-1 feOffset"),
  ).toHaveCount(6);
  await page.screenshot({
    path: ".internal_docs/verifications/finish-desktop.jpg",
    fullPage: true,
  });
});
test("finished paths still transform correctly and unsafe finish backups are rejected without replacing artwork", async ({
  page,
}) => {
  await start(page);
  await page.getByLabel("Depth amount", { exact: true }).fill("8");
  await page.getByLabel("X position", { exact: true }).fill("22");
  await expect(
    page.locator('.canvas-host [data-part="petal-1"] [data-translation]'),
  ).toHaveAttribute("transform", "translate(22 0)");
  await page.getByLabel("Depth amount", { exact: true }).fill("20");
  await page.getByLabel("Depth amount", { exact: true }).press("Escape");
  await page.getByLabel("Depth amount", { exact: true }).press("Tab");
  expect(
    await page.getByLabel("Depth amount", { exact: true }).inputValue(),
  ).toBe("8");
  const before = await backup(page),
    bad = structuredClone(before);
  bad.parts[0].finish.color = "url(https://evil.example)";
  await page.getByTestId("project-input").setInputFiles({
    name: "unsafe.logo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(bad)),
  });
  await expect(
    page.getByText("Invalid surface finish.", { exact: true }),
  ).toBeVisible();
  expect(await backup(page)).toEqual(before);
});
test("finished geometry drags in one undo step and combined shadow/depth padding survives refresh", async ({
  page,
}) => {
  await start(page);
  await page.getByLabel("Depth amount", { exact: true }).fill("8");
  await page.getByLabel("Depth amount", { exact: true }).press("Enter");
  const before = await backup(page),
    shape = page.locator('.canvas-host [data-part="petal-1"] path'),
    box = (await shape.boundingBox())!;
  const scale = await page
    .locator(".canvas-host > svg")
    .evaluate((el) => (el as SVGSVGElement).getScreenCTM()!.a);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 24,
    box.y + box.height / 2 + 12,
    { steps: 4 },
  );
  await page.mouse.up();
  const moved = await backup(page);
  expect(moved.parts[0].x - before.parts[0].x).toBeCloseTo(24 / scale, 2);
  expect(moved.parts[0].finish).toEqual(before.parts[0].finish);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await backup(page)).toEqual(before);
  await page.getByLabel("Enable shadow", { exact: true }).check();
  const p = await backup(page),
    s = p.parts[0].shadow,
    pad = Math.ceil(Math.max(Math.abs(s.dx), Math.abs(s.dy)) + s.blur * 4 + 8);
  await page.locator(".export-menu > summary").click();
  const d = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG", exact: true }).click();
  const svg = await readFile((await (await d).path())!, "utf8");
  expect(svg).toContain(
    `viewBox="${[80 - pad, 80 - pad, 320 + pad * 2, 320 + pad * 2].join(" ")}"`,
  );
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.locator(".canvas-host #finish-petal-1 feOffset"),
  ).toHaveCount(6);
  await expect(page.locator(".canvas-host #shadow-petal-1")).toHaveCount(1);
});
