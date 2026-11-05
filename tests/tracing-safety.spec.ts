import { test, expect } from "@playwright/test";
import { demoProject } from "../src/demo/logo";
const legacyKey = "logo-workshop.project.v1";
test("legacy autosave migrates without deleting the recovery copy", async ({
  page,
}) => {
  const project = demoProject();
  project.parts[0].x = 57;
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: legacyKey, value: JSON.stringify(project) },
  );
  await page.goto("/");
  await expect(page.getByLabel("X position")).toHaveValue("57");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), legacyKey),
  ).not.toBeNull();
  await page.getByLabel("X position").fill("63");
  await expect(page.locator(".save-status")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(page.getByLabel("X position")).toHaveValue("63");
});
test("corrupt autosave stays untouched until explicit recovery", async ({
  page,
}) => {
  await page.addInitScript(
    (key) => localStorage.setItem(key, "broken-json"),
    legacyKey,
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("not been overwritten");
  await page.getByLabel("X position").fill("21");
  await page.waitForTimeout(700);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), legacyKey),
  ).toBe("broken-json");
  await expect(page.locator(".save-status")).toContainText("paused");
});
test("worker failure and canceled tracing preserve the current logo", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("X position")).toBeVisible();
  let intercepted = 0;
  await page.route("**/trace.worker*", (route) => {
    intercepted++;
    return route.abort();
  });
  await page
    .getByTestId("logo-input")
    .setInputFiles("tests/fixtures/sample-shapes.png");
  await expect(page.getByRole("dialog")).toContainText("worker could not run");
  expect(intercepted).toBeGreaterThan(0);
  await expect(
    page.getByRole("button", { name: "Use these shapes" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Keep current logo" }).click();
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(6);
});
test("changing options quickly accepts only the latest result and dark preview fits", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByLabel("X position")).toBeVisible();
  await page
    .getByTestId("logo-input")
    .setInputFiles("tests/fixtures/sample-shapes.png");
  await page.locator(".trace-advanced > summary").click();
  await page.getByLabel("Shape colors").selectOption("color");
  await page.getByLabel("Number of colors").selectOption("4");
  await page.getByLabel("Shape colors").selectOption("silhouette");
  await page.getByLabel("Shape detail").selectOption("detailed");
  await expect(
    page.getByRole("button", { name: "Use these shapes" }),
  ).toBeEnabled({ timeout: 25000 });
  await expect(
    page.getByTestId("trace-preview").locator("[data-part]"),
  ).toHaveCount(7);
  await page
    .getByRole("button", { name: "Use these shapes" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".internal_docs/verifications/tracing-dark.jpg",
    fullPage: false,
  });
  await page.getByRole("button", { name: "Use these shapes" }).click();
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(7);
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const download = await event;
  const stream = await download.createReadStream();
  let text = "";
  for await (const chunk of stream!) text += chunk.toString();
  const data = JSON.parse(text);
  expect(data.source.raster.options.mode).toBe("silhouette");
  expect(data.source.raster.options.detail).toBe("detailed");
});
