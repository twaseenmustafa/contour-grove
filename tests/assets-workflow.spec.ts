import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
const mark = (name: string, color: string) => ({
  name,
  mimeType: "image/svg+xml",
  buffer: Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><path d="M90 210L150 75L210 210Z" fill="${color}"/><circle cx="150" cy="160" r="24" fill="#f8fafc"/></svg>`,
  ),
});
async function reference() {
  return {
    name: "reference.png",
    mimeType: "image/png",
    buffer: await readFile("tests/fixtures/sample-shapes.png"),
  };
}
async function start(page: Page) {
  await page.goto("/");
  await expect(page.getByLabel("X position")).toBeVisible();
}
async function backup(page: Page) {
  const wait = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  return JSON.parse(await readFile((await (await wait).path())!, "utf8"));
}
async function upload(page: Page) {
  await page
    .getByTestId("asset-input")
    .setInputFiles([
      mark("mark-a.svg", "#8ca7ff"),
      mark("mark-b.svg", "#65bca2"),
      await reference(),
    ]);
  await expect(page.locator(".asset-card")).toHaveCount(3);
}
async function add(page: Page, name: string) {
  await page
    .getByRole("button", { name: "Add " + name + " to canvas", exact: true })
    .click();
}
async function drop(page: Page, id: string, rx = 0.5, ry = 0.5) {
  const canvas = page.locator(".canvas-host");
  await canvas.scrollIntoViewIfNeeded();
  const b = await canvas.boundingBox();
  if (!b) throw Error("Canvas missing");
  await page
    .locator(`[data-asset-id="${id}"]`)
    .dragTo(canvas, { targetPosition: { x: b.width * rx, y: b.height * ry } });
}
test("multi-upload stays in a reusable library; vector placements compose without replacing existing designs", async ({
  page,
}) => {
  await start(page);
  const original = await backup(page);
  await upload(page);
  expect((await backup(page)).parts).toEqual(original.parts);
  await add(page, "mark-a.svg");
  await add(page, "mark-b.svg");
  await add(page, "reference.png");
  const p = await backup(page);
  expect(p.parts).toHaveLength(11);
  expect(p.assets).toHaveLength(3);
  expect(p.groups).toHaveLength(2);
  expect(p.viewBox).toEqual(original.viewBox);
  expect(p.source).toEqual(original.source);
  expect(p.parts.slice(0, 6)).toEqual(original.parts);
  await add(page, "reference.png");
  const copies = await backup(page);
  expect(copies.parts).toHaveLength(12);
  expect(
    copies.parts.filter((p: { assetId?: string }) => p.assetId === "asset-3"),
  ).toHaveLength(2);
  expect(new Set(copies.parts.map((p: { id: string }) => p.id)).size).toBe(12);
  expect(copies.assets).toHaveLength(3);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await backup(page)).parts).toHaveLength(11);
});
test("native thumbnail drag respects zoomed canvas coordinates and creates independent grouped copies", async ({
  page,
}) => {
  await start(page);
  await upload(page);
  await page.getByLabel("Canvas zoom", { exact: true }).selectOption("1.5");
  await page.locator(".canvas-host").evaluate((el) =>
    el.addEventListener(
      "drop",
      (event) => {
        const e = event as DragEvent;
        (el as HTMLElement).dataset.dropX = String(e.clientX);
        (el as HTMLElement).dataset.dropY = String(e.clientY);
      },
      { once: true },
    ),
  );
  await drop(page, "asset-3", 0.4, 0.6);
  const expected = await page.locator(".canvas-host > svg").evaluate((el) => {
    const parent = el.parentElement!;
    const point = new DOMPoint(
      Number(parent.dataset.dropX),
      Number(parent.dataset.dropY),
    ).matrixTransform((el as SVGSVGElement).getScreenCTM()!.inverse());
    return { x: point.x, y: point.y };
  });
  await expect(page.locator(".canvas-host image")).toHaveCount(1);
  const p = await backup(page),
    im = p.parts.at(-1),
    asset = p.assets.find((a: { id: string }) => a.id === "asset-3");
  expect(im.matrix[4] + (asset.width * im.matrix[0]) / 2).toBeCloseTo(
    expected.x,
    0,
  );
  expect(im.matrix[5] + (asset.height * im.matrix[3]) / 2).toBeCloseTo(
    expected.y,
    0,
  );
  await drop(page, "asset-1", 0.65, 0.35);
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(9);
  expect((await backup(page)).groups).toHaveLength(1);
  await page.getByRole("button", { name: "Ungroup", exact: true }).click();
  await page.getByRole("tab", { name: /Layers/ }).click();
  await expect(page.getByRole("tab", { name: /Layers/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "Deselect", exact: true }).click();
});
test("placed raster references resize, rotate, fade, export and survive saved-project reopening", async ({
  page,
}) => {
  await start(page);
  await page.getByTestId("asset-input").setInputFiles(await reference());
  await expect(page.locator(".asset-card")).toHaveCount(1);
  await add(page, "reference.png");
  await expect(page.getByLabel("Part color", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Reference image", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Width", { exact: true }).fill("150");
  await page.getByLabel("Width", { exact: true }).press("Enter");
  await page.getByLabel("Rotation", { exact: true }).fill("18");
  await page.getByLabel("Rotation", { exact: true }).press("Enter");
  await page.getByLabel("Image opacity", { exact: true }).press("End");
  await page.getByLabel("Image opacity", { exact: true }).press("ArrowLeft");
  const p = await backup(page);
  expect(p.parts.at(-1).opacity).toBe(0.99);
  expect(p.parts.at(-1).adjustment.rotation).toBe(18);
  const event = page.waitForEvent("download");
  await page.locator(".export-menu > summary").click();
  await page.getByRole("button", { name: "Export SVG", exact: true }).click();
  const svg = await readFile((await (await event).path())!, "utf8");
  expect(svg).toContain("<image");
  expect(svg).toContain('href="data:image/png;base64,');
  expect(svg).not.toContain("data-selection");
  const pngEvent = page.waitForEvent("download");
  await page.locator(".export-menu > summary").click();
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  const png = await readFile((await (await pngEvent).path())!);
  expect(png.readUInt32BE(16)).toBe(1600);
  const nonEmpty = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 40;
    c.height = 40;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, 40, 40);
    return ctx
      .getImageData(0, 0, 40, 40)
      .data.some((n, i) => i % 4 === 3 && n > 0);
  }, png.toString("base64"));
  expect(nonEmpty).toBe(true);
  await expect(page.locator(".save-status")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  expect((await backup(page)).parts.at(-1).opacity).toBe(0.99);
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("project-input").setInputFiles({
    name: "assets.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(page.locator(".canvas-host image")).toHaveCount(1);
  expect((await backup(page)).assets).toHaveLength(1);
});
test("tracing a library reference appends vectors and canceling never replaces the scene", async ({
  page,
}) => {
  await start(page);
  await page.getByTestId("asset-input").setInputFiles(await reference());
  await expect(page.locator(".asset-card")).toHaveCount(1);
  await add(page, "reference.png");
  const before = await backup(page);
  await page
    .getByRole("button", { name: "Make reference.png editable", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Keep workspace", exact: true })
    .click();
  expect(await backup(page)).toEqual(before);
  await page
    .getByRole("button", { name: "Make reference.png editable", exact: true })
    .click();
  const accept = page.getByRole("button", {
    name: "Add shapes to canvas",
    exact: true,
  });
  await expect(accept).toBeEnabled({ timeout: 25000 });
  await accept.click();
  await expect(page.locator(".asset-card")).toHaveCount(2);
  const p = await backup(page);
  expect(p.parts).toHaveLength(14);
  expect(p.parts.slice(0, 7)).toEqual(before.parts);
  expect(p.source).toEqual(before.source);
  expect(p.assets[0]).toEqual(before.assets[0]);
  expect(p.assets[1].kind).toBe("vector");
  expect(p.assets[1].parts).toHaveLength(7);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await backup(page)).parts).toHaveLength(7);
  expect((await backup(page)).assets).toHaveLength(1);
});
test("in-use image removal is protected; hidden references do not export; library and scene undo together", async ({
  page,
}) => {
  await start(page);
  await page.getByTestId("asset-input").setInputFiles(await reference());
  await expect(page.locator(".asset-card")).toHaveCount(1);
  await add(page, "reference.png");
  const remove = page.getByRole("button", {
    name: "Remove reference.png from assets",
    exact: true,
  });
  await expect(remove).toBeDisabled();
  await page.locator(".organization-controls > summary").click();
  await page.getByRole("button", { name: "Hide", exact: true }).click();
  const event = page.waitForEvent("download");
  await page.locator(".export-menu > summary").click();
  await page.getByRole("button", { name: "Export SVG", exact: true }).click();
  expect(await readFile((await (await event).path())!, "utf8")).not.toContain(
    "data:image/png",
  );
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(remove).toBeEnabled();
  await remove.click();
  expect((await backup(page)).assets).toHaveLength(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".canvas-host image")).toHaveCount(1);
  expect((await backup(page)).assets).toHaveLength(1);
});
test("unsupported or oversized batches do not partly change the library or canvas", async ({
  page,
}) => {
  await start(page);
  const before = await backup(page);
  await page.getByTestId("asset-input").setInputFiles([
    mark("good.svg", "#8ca7ff"),
    {
      name: "bad.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      ),
    },
  ]);
  await expect(page.getByRole("alert")).toBeVisible();
  expect(await backup(page)).toEqual(before);
  await page.getByTestId("asset-input").setInputFiles({
    name: "too-large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(4000001),
  });
  await expect(page.getByRole("alert")).toContainText("4 MB");
  expect(await backup(page)).toEqual(before);
});
test("asynchronous asset upload keeps intervening edits and cannot leak into a replacement document", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function () {
      return new Promise<ArrayBuffer>((resolve) =>
        setTimeout(() => resolve(original.call(this)), 450),
      );
    };
  });
  await start(page);
  const original = await backup(page);
  await page.getByTestId("asset-input").setInputFiles(await reference());
  await expect(
    page.getByRole("button", { name: "Cancel upload", exact: true }),
  ).toBeVisible();
  await page.getByLabel("X position").fill("31");
  await expect(page.locator(".asset-card")).toHaveCount(1);
  expect((await backup(page)).parts[0].x).toBe(31);
  await page.getByTestId("asset-input").setInputFiles(await reference());
  await expect(
    page.getByRole("button", { name: "Cancel upload", exact: true }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("project-input").setInputFiles({
    name: "original.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(original)),
  });
  await expect(
    page.getByRole("button", { name: "Cancel upload", exact: true }),
  ).toHaveCount(0);
  expect((await backup(page)).assets).toBeUndefined();
});
test("reference-only compositions trim correctly and responsive asset actions stay reachable", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await upload(page);
  await add(page, "reference.png");
  await page.locator(".canvas-setup > summary").click();
  await page.getByLabel("Trim padding", { exact: true }).fill("12");
  await page
    .getByRole("button", { name: "Trim to artwork", exact: true })
    .click();
  const p = await backup(page);
  expect(p.parts).toHaveLength(1);
  expect(p.viewBox[2]).toBeCloseTo(200, 0);
  expect(p.viewBox[3]).toBeCloseTo(123, 0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Dismiss message", exact: true })
    .click();
  await page.screenshot({
    path: ".internal_docs/verifications/assets-desktop.jpg",
    fullPage: true,
    animations: "disabled",
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Add mark-a.svg to canvas", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".internal_docs/verifications/assets-mobile.jpg",
    fullPage: true,
    animations: "disabled",
  });
});
test("external multi-file canvas drop adds a composition atomically", async ({
  page,
}) => {
  await start(page);
  const files = [mark("drop-a.svg", "#8ca7ff"), mark("drop-b.svg", "#65bca2")];
  const transfer = await page.evaluateHandle(
    (items) => {
      const dt = new DataTransfer();
      for (const item of items)
        dt.items.add(
          new File([atob(item.data)], item.name, { type: item.type }),
        );
      return dt;
    },
    files.map((f) => ({
      name: f.name,
      type: f.mimeType,
      data: f.buffer.toString("base64"),
    })),
  );
  const canvas = page.locator(".canvas-host");
  const box = await canvas.boundingBox();
  if (!box) throw Error("Missing canvas");
  await canvas.dispatchEvent("drop", {
    dataTransfer: transfer,
    clientX: box.x + box.width / 2,
    clientY: box.y + box.height / 2,
  });
  await expect(page.locator(".asset-card")).toHaveCount(2);
  const p = await backup(page);
  expect(p.parts).toHaveLength(10);
  expect(p.groups).toHaveLength(2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const undone = await backup(page);
  expect(undone.parts).toHaveLength(6);
  expect(undone.assets).toBeUndefined();
});
test("multi-logo studio remains clear on desktop and mobile with keyboard library navigation", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("tab", { name: /Assets/ }).click();
  await page.screenshot({
    path: ".internal_docs/verifications/assets-empty.jpg",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("tab", { name: /Assets/ }).press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Layers/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.locator(".canvas-setup > summary").click();
  await page.getByLabel("Canvas width", { exact: true }).fill("900");
  await page.getByLabel("Canvas height", { exact: true }).fill("600");
  await page
    .getByRole("button", { name: "Apply canvas size", exact: true })
    .click();
  await page.locator(".canvas-setup > summary").click();
  await upload(page);
  await drop(page, "asset-1", 0.25, 0.25);
  await drop(page, "asset-2", 0.75, 0.25);
  await drop(page, "asset-3", 0.5, 0.72);
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(5);
  const p = await backup(page);
  expect(p.assets).toHaveLength(3);
  expect(p.groups).toHaveLength(2);
  await page
    .getByRole("button", { name: "Dismiss message", exact: true })
    .click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".parts-panel").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({
    path: ".internal_docs/verifications/assets-composition-desktop.jpg",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".internal_docs/verifications/assets-composition-mobile.jpg",
    fullPage: true,
    animations: "disabled",
  });
});
