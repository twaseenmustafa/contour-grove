import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("editable text saves, exports safely and supports undo", async ({
  page,
}) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByLabel("X position", { exact: true }).waitFor();
  await page.locator(".file-menu>summary").click();
  await page.getByRole("button", { name: "New document", exact: true }).click();
  await page.locator(".insert-menu>summary").click();
  await page.getByRole("button", { name: "Create text" }).click();
  const text = page.locator(".canvas-host [data-part] text");
  await expect(text).toHaveText("Your text");
  await page.getByLabel("Text", { exact: true }).fill("A < B & Co");
  await page.getByLabel("Text", { exact: true }).press("Enter");
  await expect(text).toHaveText("A < B & Co");
  await page.getByLabel("Font", { exact: true }).selectOption("serif");
  await page.getByLabel("Text size", { exact: true }).fill("80");
  await page.getByLabel("Text size", { exact: true }).press("Enter");
  await page.getByLabel("Bold", { exact: true }).check();
  await expect(text).toHaveAttribute("font-family", "serif");
  await expect(text).toHaveAttribute("font-size", "80");
  await expect(text).toHaveAttribute("font-weight", "bold");
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const project = JSON.parse(
    await readFile((await (await event).path())!, "utf8"),
  );
  expect(project.parts[0].textData).toEqual({
    value: "A < B & Co",
    font: "serif",
    size: 80,
    bold: true,
  });
  await page.locator(".export-menu>summary").click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG", exact: true }).click();
  const svg = await readFile((await (await download).path())!, "utf8");
  expect(svg).toContain("A &lt; B &amp; Co");
  expect(svg).toContain('font-family="serif"');
  await page.locator(".export-menu>summary").click();
  const pngEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  const png = await readFile((await (await pngEvent).path())!);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const pixels = await page.evaluate(async (b64) => {
    const raw = atob(b64),
      bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0)),
      url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const c = document.createElement("canvas");
      c.width = image.width;
      c.height = image.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      return ctx
        .getImageData(0, 0, c.width, c.height)
        .data.some((v, i) => i % 4 === 3 && v > 0);
    } finally {
      URL.revokeObjectURL(url);
    }
  }, png.toString("base64"));
  expect(pixels).toBe(true);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(text).toHaveAttribute("font-weight", "normal");
});
test("invalid blank text is rejected without losing the existing words", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("X position", { exact: true }).waitFor();
  await page.locator(".insert-menu>summary").click();
  await page.getByRole("button", { name: "Create text" }).click();
  const input = page.getByLabel("Text", { exact: true });
  await input.fill(" ");
  await input.press("Enter");
  await expect(input).toHaveValue("Your text");
  await expect(page.getByText("Enter a single line of text.")).toBeVisible();
});

test("text project backup reopens with editable content", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByLabel("X position", { exact: true }).waitFor();
  await page.locator(".insert-menu>summary").click();
  await page.getByRole("button", { name: "Create text" }).click();
  await page.getByLabel("Text", { exact: true }).fill("Brand name");
  await page.getByLabel("Text", { exact: true }).press("Enter");
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const data = await readFile((await (await event).path())!);
  await page.locator(".file-menu>summary").click();
  await page.getByRole("button", { name: "New document", exact: true }).click();
  await page.getByTestId("project-input").setInputFiles({
    name: "test.json",
    mimeType: "application/json",
    buffer: data,
  });
  await expect(page.locator(".canvas-host [data-part] text")).toHaveText(
    "Brand name",
  );
});

test("new text is sized to fit a small export frame", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("X position", { exact: true }).waitFor();
  await page.locator(".insert-menu>summary").click();
  await page.getByRole("button", { name: "Create text" }).click();
  const frame = (await page.locator("[data-export-frame]").boundingBox())!,
    text = (await page.locator(".canvas-host [data-part] text").boundingBox())!;
  expect(text.x).toBeGreaterThan(frame.x);
  expect(text.x + text.width).toBeLessThan(frame.x + frame.width);
});
