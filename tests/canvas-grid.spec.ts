import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("dotted canvas can be hidden and never enters exports", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("X position", { exact: true })).toBeVisible();
  const svg = page.locator(".canvas-host > svg");
  const grid = svg.locator("[data-workspace-grid]");
  const pattern = svg.locator("[data-grid-pattern]");
  const toggle = page.getByRole("button", { name: "Show canvas grid" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(grid).toHaveAttribute("pointer-events", "none");
  await expect(svg.locator("[data-export-frame]")).toHaveAttribute(
    "fill",
    "none",
  );
  const before = await svg.getAttribute("viewBox");
  const spacing = Number(await pattern.getAttribute("width"));
  expect(spacing).toBeGreaterThan(0);
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5);
  await page.mouse.wheel(210, 180);
  await expect(svg).not.toHaveAttribute("viewBox", before!);
  expect(Number(await pattern.getAttribute("width"))).toBe(spacing);
  const values = (await svg.getAttribute("viewBox"))!.split(" ").map(Number);
  expect(Number(await grid.getAttribute("x"))).toBeCloseTo(values[0]);
  expect(Number(await grid.getAttribute("y"))).toBeCloseTo(values[1]);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(grid).toHaveAttribute("display", "none");
  await toggle.click();
  await page.getByLabel("Canvas zoom", { exact: true }).selectOption("4");
  await expect(grid).toHaveAttribute("display", "inline");
  const pixelSpacing = await svg.evaluate((el) => {
    const pattern = el.querySelector("[data-grid-pattern]")!;
    const matrix = (el as SVGSVGElement).getScreenCTM()!;
    return (
      Number(pattern.getAttribute("width")) * Math.hypot(matrix.a, matrix.b)
    );
  });
  expect(pixelSpacing).toBeCloseTo(24, 1);
  await page.locator(".export-menu>summary").click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG", exact: true }).click();
  const output = await readFile((await (await download).path())!, "utf8");
  expect(output).not.toContain("editor-world-grid");
  expect(output).not.toContain("data-workspace-grid");
});

test("fit selection finds artwork outside the export frame without changing the document", async ({
  page,
}) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await expect(page.getByLabel("X position", { exact: true })).toBeVisible();
  await page.locator(".file-menu>summary").click();
  await page.getByRole("button", { name: "New document", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Fit selection" }),
  ).toBeDisabled();
  await page.locator(".shapes-menu>summary").click();
  await page
    .getByRole("button", { name: "Create rectangle", exact: true })
    .click();
  await page.getByLabel("X position", { exact: true }).fill("1800");
  await page.getByLabel("X position", { exact: true }).press("Enter");
  const save = async () => {
    const event = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    return JSON.parse(await readFile((await (await event).path())!, "utf8"));
  };
  const before = await save();
  await page
    .getByRole("button", { name: "Fit selection", exact: true })
    .click();
  const part = (await page.locator(".canvas-host [data-part]").boundingBox())!;
  const host = (await page.locator(".canvas-host").boundingBox())!;
  expect(part.x + part.width / 2).toBeGreaterThan(host.x + host.width * 0.3);
  expect(part.x + part.width / 2).toBeLessThan(host.x + host.width * 0.7);
  expect(part.width).toBeGreaterThan(100);
  expect(await save()).toEqual(before);
});

test("dotted canvas stays subtle at every zoom and moves when panning", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByLabel("X position", { exact: true })).toBeVisible();
  const svg = page.locator(".canvas-host > svg");
  await expect(svg.locator("[data-grid-dot]")).toHaveCount(1);
  await expect(svg.locator("[data-grid-lines], [data-grid-cross]")).toHaveCount(
    0,
  );
  const metrics = async () =>
    svg.evaluate((el) => {
      const root = el as SVGSVGElement,
        p = root.querySelector("[data-grid-pattern]")!;
      const m = root.getScreenCTM()!,
        box = root.getBoundingClientRect();
      return {
        size: Number(p.getAttribute("width")) * Math.hypot(m.a, m.b),
        x: m.e - box.left,
        y: m.f - box.top,
        originX: Number(p.getAttribute("x")),
        originY: Number(p.getAttribute("y")),
      };
    });
  for (const z of ["0.05", "0.15", "1", "4", "16"]) {
    await page.getByLabel("Canvas zoom", { exact: true }).selectOption(z);
    const m = await metrics();
    expect(m.size).toBeGreaterThanOrEqual(13.9);
    expect(m.size).toBeLessThanOrEqual(24.1);
    expect(m.originX).toBe(0);
    expect(m.originY).toBe(0);
  }
  await page.getByLabel("Canvas zoom", { exact: true }).selectOption("1");
  const prior = await metrics();
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5);
  await page.mouse.wheel(83, 57);
  await expect
    .poll(async () => (await metrics()).x)
    .not.toBeCloseTo(prior.x, 1);
  const after = await metrics();
  expect(after.size).toBeCloseTo(prior.size, 1);
  expect(after.y).not.toBeCloseTo(prior.y, 1);
  await page.setViewportSize({ width: 1100, height: 680 });
  await expect.poll(async () => (await metrics()).size).toBeCloseTo(18, 1);
});

test("image actions stay readable in the desktop asset sidebar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 680 });
  await page.goto("/");
  await page
    .getByTestId("asset-input")
    .setInputFiles("tests/fixtures/sample-shapes.png");
  const button = page.getByRole("button", {
    name: "Make sample-shapes.png editable",
    exact: true,
  });
  await expect(button).toBeVisible();
  const metrics = await button.evaluate((el) => ({
    width: el.clientWidth,
    scroll: el.scrollWidth,
    whitespace: getComputedStyle(el).whiteSpace,
  }));
  expect(metrics.scroll).toBeLessThanOrEqual(metrics.width + 1);
  expect(metrics.whitespace).toBe("nowrap");
});
