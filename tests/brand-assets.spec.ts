import { test, expect } from "@playwright/test";

test("brand and preview assets load with honest metadata", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const logo = page.locator(".brand-mark img");
  await expect(logo).toBeVisible();
  expect(
    await logo.evaluate(
      (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
    ),
  ).toBe(true);
  await expect(
    page.locator('link[rel="icon"][type="image/svg+xml"]'),
  ).toHaveAttribute("href", "./favicon-animated.svg");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#111112",
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "Logo Workshop",
  );
  const response = await request.get("/social-preview.png");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("image/png");
  const dimensions = await page.evaluate(async () => {
    const image = new Image();
    image.src = "/social-preview.png";
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  });
  expect(dimensions).toEqual([1200, 630]);
});
