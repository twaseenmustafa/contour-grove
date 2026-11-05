import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("pen creates a closed editable shape, undo and redo as one action", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("X position", { exact: true }).waitFor();
  const parts = page.locator(".canvas-host [data-part]");
  await expect(parts).toHaveCount(6);
  await page.getByRole("button", { name: "Pen tool" }).click();
  const host = page.locator(".canvas-host"),
    box = (await host.boundingBox())!;
  const click = async (x: number, y: number) =>
    page.mouse.click(box.x + x, box.y + y);
  await click(100, 100);
  await click(210, 100);
  await click(160, 190);
  await expect(page.locator("[data-pen-preview] circle")).toHaveCount(3);
  await click(100, 100);
  await expect(parts).toHaveCount(7);
  await expect(
    page.getByRole("button", { name: "Select tool" }),
  ).toHaveAttribute("aria-pressed", "true");
  const last = parts.last();
  await expect(last.locator("[data-geometry] path")).toHaveAttribute("d", /Z$/);
  await expect(page.locator("[data-pen-preview]")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(parts).toHaveCount(6);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(parts).toHaveCount(7);
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const saved = JSON.parse(
    await readFile((await (await event).path())!, "utf8"),
  );
  expect(saved.parts.at(-1).name).toBe("Pen shape");
});

test("pen finishes an open line with Enter and Escape cancels a draft", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("X position", { exact: true }).waitFor();
  const parts = page.locator(".canvas-host [data-part]");
  const box = (await page.locator(".canvas-host").boundingBox())!;
  const click = async (x: number, y: number) =>
    page.mouse.click(box.x + x, box.y + y);
  await page.getByRole("button", { name: "Pen tool" }).click();
  await click(110, 120);
  await click(170, 180);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-pen-preview]")).toHaveCount(0);
  await expect(parts).toHaveCount(6);
  await click(110, 120);
  await click(170, 180);
  await page.keyboard.press("Enter");
  await expect(parts).toHaveCount(7);
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const saved = JSON.parse(
    await readFile((await (await event).path())!, "utf8"),
  );
  const line = saved.parts.at(-1);
  expect(line.name).toBe("Pen line");
  expect(line.fill).toBe("none");
  expect(line.stroke).toBe("#eeeeee");
  expect(line.geometry.d).not.toContain("Z");
});

test("switching tools cancels a draft and the pen works outside the export frame", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("X position", { exact: true }).waitFor();
  await page.getByLabel("Canvas zoom", { exact: true }).selectOption("0.15");
  const host = page.locator(".canvas-host"),
    box = (await host.boundingBox())!;
  await page.getByRole("button", { name: "Pen tool" }).click();
  await page.mouse.click(box.x + 100, box.y + 200);
  await page.getByRole("button", { name: "Hand tool" }).click();
  await expect(page.locator("[data-pen-preview]")).toHaveCount(0);
  await page.getByRole("button", { name: "Pen tool" }).click();
  await page.mouse.click(box.x + 100, box.y + 200);
  await page.mouse.click(box.x + 150, box.y + 260);
  await page.keyboard.press("Enter");
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(7);
});

test("dragging pen points creates curves that survive save and undo", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("X position", { exact: true }).waitFor();
  const box = (await page.locator(".canvas-host").boundingBox())!;
  await page.getByRole("button", { name: "Pen tool" }).click();
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 110, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator("[data-pen-handle]")).toHaveCount(1);
  await page.mouse.click(box.x + 250, box.y + 190);
  await expect(page.locator("[data-pen-preview] path").first()).toHaveAttribute(
    "d",
    / C /,
  );
  await page.keyboard.press("Enter");
  const parts = page.locator(".canvas-host [data-part]");
  await expect(parts).toHaveCount(7);
  const path = parts.last().locator("[data-geometry] path");
  await expect(path).toHaveAttribute("d", / C /);
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const saved = JSON.parse(
    await readFile((await (await event).path())!, "utf8"),
  );
  expect(saved.parts.at(-1).geometry.d).toContain(" C ");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(parts).toHaveCount(6);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(parts).toHaveCount(7);
  await expect(parts.last().locator("[data-geometry] path")).toHaveAttribute(
    "d",
    / C /,
  );
});
