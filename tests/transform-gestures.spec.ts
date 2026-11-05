import { test, expect, type Locator } from "@playwright/test";
async function center(el: Locator) {
  const b = await el.boundingBox();
  if (!b) throw Error("Missing handle");
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect x="70" y="90" width="80" height="60" fill="#4266bb"/></svg>';
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("X position")).toBeVisible();
  await page.getByTestId("logo-input").setInputFiles({
    name: "gesture.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(svg),
  });
  await expect(page.locator(".reference-note strong")).toHaveText(
    "gesture.svg",
  );
});
test("rotated pointer resize holds its opposite anchor; focus loss cancels the next gesture", async ({
  page,
}) => {
  await page.getByLabel("Rotation", { exact: true }).fill("35");
  await page.getByLabel("Rotation", { exact: true }).press("Enter");
  await page.locator(".canvas-host").scrollIntoViewIfNeeded();
  const nw = await center(page.locator("[data-handle=nw]")),
    se = await center(page.locator("[data-handle=se]"));
  await page.mouse.move(se.x, se.y);
  await page.mouse.down();
  await page.mouse.move(se.x + 30, se.y + 32, { steps: 5 });
  await page.mouse.up();
  const after = await center(page.locator("[data-handle=nw]"));
  expect(after.x).toBeCloseTo(nw.x, 0);
  expect(after.y).toBeCloseTo(nw.y, 0);
  expect(
    Number(await page.getByLabel("Width", { exact: true }).inputValue()),
  ).toBeGreaterThan(80);
  const before = await page
      .locator(".canvas-host [data-adjustment]")
      .getAttribute("transform"),
    handle = await center(page.locator("[data-handle=se]"));
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 10, handle.y + 20);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.mouse.up();
  expect(
    await page
      .locator(".canvas-host [data-adjustment]")
      .getAttribute("transform"),
  ).toBe(before);
});
test("touch-emulated corner gesture works in a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".canvas-host").scrollIntoViewIfNeeded();
  const se = await center(page.locator("[data-handle=se]"));
  const client = await page.context().newCDPSession(page);
  const touch = (x: number, y: number) => [
    { x, y, id: 1, radiusX: 6, radiusY: 6, force: 1 },
  ];
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: touch(se.x, se.y),
  });
  for (let i = 1; i <= 5; i++)
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: touch(se.x + i * 4, se.y + i * 3),
    });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(async () =>
      Number(await page.getByLabel("Width", { exact: true }).inputValue()),
    )
    .toBeGreaterThan(80);
  await client.detach();
});
