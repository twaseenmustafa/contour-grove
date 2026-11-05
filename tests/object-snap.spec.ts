import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("object snapping aligns a drag, shows guides, supports Alt and undo", async ({
  page,
}) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByLabel("X position", { exact: true }).waitFor();
  await page.locator(".file-menu>summary").click();
  await page.getByRole("button", { name: "New document", exact: true }).click();
  await page.locator(".file-menu>summary").click();
  await page.getByRole("button", { name: "Automation workbench" }).click();
  const field = page.getByLabel("Command batch"),
    request = JSON.parse(await field.inputValue());
  request.commands = [
    {
      type: "create",
      shape: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    },
    {
      type: "create",
      shape: "rectangle",
      x: 300,
      y: 200,
      width: 100,
      height: 100,
    },
  ];
  await field.fill(JSON.stringify(request));
  await page.getByRole("button", { name: "Apply atomically" }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const parts = page.locator(".canvas-host [data-part]"),
    svg = page.locator(".canvas-host > svg");
  await expect(parts).toHaveCount(2);
  const snap = page.getByRole("button", { name: "Snap to objects" });
  await expect(snap).toHaveAttribute("aria-pressed", "false");
  await snap.click();
  const scale = await svg.evaluate((e) =>
    Math.hypot(
      (e as SVGSVGElement).getScreenCTM()!.a,
      (e as SVGSVGElement).getScreenCTM()!.b,
    ),
  );
  const drag = async (alt = false) => {
    const b = (await parts.first().boundingBox())!;
    if (alt) await page.keyboard.down("Alt");
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      b.x + b.width / 2 + 98 * scale,
      b.y + b.height / 2 + 38 * scale,
      { steps: 4 },
    );
  };
  await drag();
  await expect(page.locator("[data-snap-guides] line")).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator("[data-snap-guides]")).toHaveCount(0);
  const backup = async () => {
    const ev = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    return JSON.parse(await readFile((await (await ev).path())!, "utf8"));
  };
  let p = await backup();
  expect(p.parts[0].x).toBeCloseTo(200, 1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  p = await backup();
  expect(p.parts[0].x).toBe(100);
  await drag(true);
  await expect(page.locator("[data-snap-guides]")).toHaveCount(0);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  p = await backup();
  expect(p.parts[0].x).toBeCloseTo(198, 0);
});
