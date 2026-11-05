import { test, expect, type Page, type Locator } from "@playwright/test";
import { readFile } from "node:fs/promises";
const sample =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect x="70" y="90" width="80" height="60" fill="#4266bb"/></svg>';
async function start(page: Page, text = sample) {
  await page.goto("/");
  await expect(page.getByLabel("X position")).toBeVisible();
  await page.getByTestId("logo-input").setInputFiles({
    name: "rectangle.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(text),
  });
  await expect(page.locator(".reference-note strong")).toHaveText(
    "rectangle.svg",
  );
  await expect(page.getByLabel("Width", { exact: true })).toBeVisible();
  await page.locator(".canvas-host").scrollIntoViewIfNeeded();
}
async function enter(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel(label, { exact: true }).press("Enter");
}
async function center(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw Error("Missing handle");
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
test("numeric dimensions and rotation undo, reset and survive backup, autosave and SVG/PNG exports", async ({
  page,
}) => {
  await start(page);
  await expect(page.getByLabel("Width", { exact: true })).toHaveValue("80");
  await enter(page, "Width", "120");
  await expect(page.getByLabel("Height", { exact: true })).toHaveValue("90");
  await enter(page, "Rotation", "30");
  await page.getByLabel("Enable shadow").check();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Enable shadow")).not.toBeChecked();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Rotation", { exact: true })).toHaveValue("0");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByLabel("Rotation", { exact: true })).toHaveValue("30");
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const backup = await readFile((await (await event).path())!, "utf8");
  expect(JSON.parse(backup).parts[0].adjustment).toMatchObject({
    scaleX: 1.5,
    scaleY: 1.5,
    rotation: 30,
  });
  await expect(page.locator(".save-status")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(page.getByLabel("Width", { exact: true })).toHaveValue("120");
  await expect(page.getByLabel("Rotation", { exact: true })).toHaveValue("30");
  const svgEvent = page.waitForEvent("download");
  await page.locator(".export-menu > summary").click();
  await page.getByRole("button", { name: "Export SVG", exact: true }).click();
  const svg = await readFile((await (await svgEvent).path())!, "utf8");
  expect(svg).toContain("rotate(30) scale(1.5 1.5)");
  expect(svg).not.toContain("data-selection");
  expect(svg).not.toContain("data-handle");
  const pngEvent = page.waitForEvent("download");
  await page.locator(".export-menu > summary").click();
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  const png = await readFile((await (await pngEvent).path())!);
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  await page.getByRole("button", { name: "Reset size & angle" }).click();
  await expect(page.getByLabel("Width", { exact: true })).toHaveValue("80");
  await expect(page.getByLabel("Rotation", { exact: true })).toHaveValue("0");
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("project-input").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup),
  });
  await expect(page.getByLabel("Rotation", { exact: true })).toHaveValue("30");
});
test("corner drag keeps opposite corner fixed and is a single undo step", async ({
  page,
}) => {
  await start(page);
  const before = await center(page.locator("[data-handle=nw]")),
    se = await center(page.locator("[data-handle=se]"));
  await page.mouse.move(se.x, se.y);
  await page.mouse.down();
  await page.mouse.move(se.x + 35, se.y + 28, { steps: 6 });
  await page.mouse.up();
  expect(
    Number(await page.getByLabel("Width", { exact: true }).inputValue()),
  ).toBeGreaterThan(80);
  const after = await center(page.locator("[data-handle=nw]"));
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.y).toBeCloseTo(before.y, 0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Width", { exact: true })).toHaveValue("80");
  await expect(page.getByLabel("X position")).toHaveValue("0");
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
});
test("rotation handle, snapping and pointer cancellation are reversible", async ({
  page,
}) => {
  await start(page);
  const handle = await center(page.locator("[data-handle=rotate]"));
  const pivot = await page.locator("[data-selection]").evaluate((el) => {
    const m = (el as SVGGraphicsElement).getScreenCTM()!;
    return { x: m.e, y: m.f };
  });
  const radius = pivot.y - handle.y;
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.keyboard.down("Shift");
  await page.mouse.move(pivot.x + radius, pivot.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(page.getByLabel("Rotation", { exact: true })).toHaveValue("90");
  const current = await center(page.locator("[data-handle=se]"));
  const before = await page
    .locator(".canvas-host [data-adjustment]")
    .getAttribute("transform");
  await page.mouse.move(current.x, current.y);
  await page.mouse.down();
  await page.mouse.move(current.x + 30, current.y + 25);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(
    await page
      .locator(".canvas-host [data-adjustment]")
      .getAttribute("transform"),
  ).toBe(before);
  const se = await center(page.locator("[data-handle=se]"));
  await page.mouse.move(se.x, se.y);
  await page.mouse.down();
  await page.mouse.move(se.x + 20, se.y + 10);
  await page
    .locator(".canvas-host")
    .dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  expect(
    await page
      .locator(".canvas-host [data-adjustment]")
      .getAttribute("transform"),
  ).toBe(before);
});
test("unlocked resize, invalid values and escaping draft input never corrupt geometry", async ({
  page,
}) => {
  await start(page);
  await page.getByLabel("Keep proportions").uncheck();
  await enter(page, "Width", "100");
  await expect(page.getByLabel("Height", { exact: true })).toHaveValue("60");
  await enter(page, "Width", "-4");
  await expect(page.getByRole("alert")).toContainText("positive");
  await expect(page.getByLabel("Width", { exact: true })).toHaveValue("100");
  await page.getByLabel("Width", { exact: true }).fill("999");
  await page.getByLabel("Width", { exact: true }).press("Escape");
  await expect(page.getByLabel("Width", { exact: true })).toHaveValue("100");
  await expect(
    page.locator(".canvas-host [data-geometry] rect").first(),
  ).toHaveAttribute("width", "80");
});
test("nested imported transforms and holes remain intact after adjustments", async ({
  page,
}) => {
  await start(
    page,
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><g transform="translate(10 20)"><path fill-rule="evenodd" d="M50 50H150V150H50Z M70 70H130V130H70Z"/></g></svg>',
  );
  await enter(page, "Width", "120");
  await enter(page, "Rotation", "-45");
  await expect(
    page.locator(".canvas-host [data-geometry] path"),
  ).toHaveAttribute("transform", "matrix(1 0 0 1 10 20)");
  await expect(
    page.locator(".canvas-host [data-geometry] path"),
  ).toHaveAttribute("fill-rule", "evenodd");
});
test("soft states, mobile layout, dark mode and reduced motion remain usable", async ({
  page,
}) => {
  await start(page);
  await enter(page, "Rotation", "18");
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: ".internal_docs/verifications/transform-desktop.jpg",
    fullPage: true,
  });
  await page.locator(".file-menu > summary").click();
  const button = page.getByRole("button", { name: "Import logo", exact: true });
  const beforeHover = await button.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  await button.hover();
  await expect
    .poll(() => button.evaluate((el) => getComputedStyle(el).backgroundColor))
    .not.toBe(beforeHover);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await button.hover();
  expect(await button.evaluate((el) => getComputedStyle(el).transform)).toBe(
    "none",
  );
  expect(
    await button.evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
  await button.press("Escape");
  await page.getByLabel("Rotation", { exact: true }).focus();
  await page.screenshot({
    path: ".internal_docs/verifications/transform-dark-reduced.jpg",
    fullPage: true,
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
  await expect(page.getByLabel("Width", { exact: true })).toBeVisible();
  await page.screenshot({
    path: ".internal_docs/verifications/transform-mobile.jpg",
    animations: "disabled",
    fullPage: true,
  });
});
