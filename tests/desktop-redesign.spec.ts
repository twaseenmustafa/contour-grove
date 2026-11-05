import { test, expect } from "@playwright/test";

for (const width of [1100, 1440]) {
  test(`desktop layout and controls remain usable at ${width}px`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Library", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Properties", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Pen tool" })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(dimensions.scroll).toBe(dimensions.client);
    const library = await page.locator(".parts-panel").boundingBox();
    const canvas = await page.locator(".canvas-panel").boundingBox();
    const properties = await page.locator(".inspector").boundingBox();
    expect(library!.x + library!.width).toBeLessThanOrEqual(canvas!.x + 1);
    expect(canvas!.x + canvas!.width).toBeLessThanOrEqual(properties!.x + 1);
    await page.getByRole("button", { name: "Hide library" }).click();
    await expect(page.locator(".parts-panel")).toBeHidden();
    await page.getByRole("button", { name: "Show library" }).click();
    await expect(page.locator(".parts-panel")).toBeVisible();
    await page.getByRole("button", { name: "Hide inspector" }).click();
    await expect(page.locator(".inspector")).toBeHidden();
    await page.getByRole("button", { name: "Show inspector" }).click();
    await expect(page.locator(".inspector")).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("primary panel text retains readable contrast", async ({ page }) => {
  await page.goto("/");
  await page.locator(".part-row.selected").waitFor();
  const pairs = await page.evaluate(() => {
    const color = (selector: string, property: "color" | "backgroundColor") =>
      getComputedStyle(document.querySelector(selector)!).getPropertyValue(
        property === "color" ? "color" : "background-color",
      );
    return [
      [
        color(".library-heading h2", "color"),
        color(".parts-panel", "backgroundColor"),
      ],
      [
        color(".inspector > .panel-title h2", "color"),
        color(".inspector > .panel-title", "backgroundColor"),
      ],
      [
        color(".part-row.selected strong", "color"),
        color(".part-row.selected", "backgroundColor"),
      ],
    ];
  });
  function luminance(s: string) {
    const n = s
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number)
      .map((v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2];
  }
  for (const [foreground, background] of pairs) {
    const a = luminance(foreground),
      b = luminance(background);
    expect(
      (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
    ).toBeGreaterThanOrEqual(4.5);
  }
});
