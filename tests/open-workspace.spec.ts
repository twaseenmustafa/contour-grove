import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function start(page: Page) {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await expect(page.getByLabel("X position")).toBeVisible();
}
async function backup(page: Page) {
  const d = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  return JSON.parse(await readFile((await (await d).path())!, "utf8"));
}
async function load(page: Page, svg: string) {
  await page.getByTestId("logo-input").setInputFiles({
    name: "paths.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(svg),
  });
}
const two =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><rect x="20" y="20" width="100" height="100" fill="#eeeeee"/><rect x="70" y="20" width="100" height="100" fill="#777777"/></svg>';
test("open workspace pans and pointer zooms outside the export frame without document edits", async ({
  page,
}) => {
  await start(page);
  const labelSize = await page
    .locator("[data-artboard-name]")
    .evaluate((el) => {
      const m = (el as SVGGraphicsElement).getScreenCTM()!;
      return Number(el.getAttribute("font-size")) * Math.hypot(m.a, m.b);
    });
  expect(labelSize).toBeCloseTo(11, 1);
  const original = await backup(page);
  await page.getByLabel("Canvas zoom", { exact: true }).selectOption("0.15");
  const host = page.locator(".canvas-host"),
    b = (await host.boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * 0.4);
  const scene = await host.locator("svg").elementHandle();
  const before = await host.locator("svg").getAttribute("viewBox");
  await page.mouse.wheel(400, 300);
  await expect(host.locator("svg")).not.toHaveAttribute("viewBox", before!);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -160);
  await page.keyboard.up("Control");
  await expect
    .poll(async () =>
      Number(await host.locator("svg").getAttribute("data-zoom")),
    )
    .toBeGreaterThan(0.15);
  expect(await scene!.evaluate((el) => el.isConnected)).toBe(true);
  expect(await backup(page)).toEqual(original);
  await page
    .getByRole("button", { name: "Fit to canvas", exact: true })
    .click();
  await expect(page.getByLabel("Canvas zoom", { exact: true })).toHaveValue(
    "1",
  );
});
test("new documents create native vectors with editable outlines and fit-all", async ({
  page,
}) => {
  await start(page);
  await page.locator(".file-menu>summary").click();
  await page.getByRole("button", { name: "New document", exact: true }).click();
  await expect(page.locator(".canvas-host [data-part]")).toHaveCount(0);
  await page.locator(".shapes-menu>summary").click();
  await page.getByRole("button", { name: "Create star", exact: true }).click();
  await expect(page.locator(".canvas-host [data-part] polygon")).toHaveCount(1);
  await page.getByLabel("X position", { exact: true }).fill("1800");
  await page.getByRole("button", { name: "Fit all", exact: true }).click();
  expect(
    (await page.locator(".canvas-host [data-part]").boundingBox())!.width,
  ).toBeGreaterThan(20);
  await page.locator(".appearance-controls>summary").click();
  await page.getByLabel("Outline width", { exact: true }).fill("3");
  await page.getByLabel("Outline width", { exact: true }).press("Enter");
  expect((await backup(page)).parts[0].strokeWidth).toBe(3);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await backup(page)).parts[0].strokeWidth).toBe(0);
});
test("local command batches are atomic and reject malicious paint", async ({
  page,
}) => {
  await start(page);
  const original = await backup(page);
  await page.locator(".file-menu>summary").click();
  await page
    .getByRole("button", { name: "Automation workbench", exact: true })
    .click();
  const field = page.getByLabel("Command batch"),
    request = JSON.parse(await field.inputValue());
  request.commands.push({
    type: "set",
    ids: ["petal-1"],
    changes: { fill: "url(https://evil.example)" },
  });
  await field.fill(JSON.stringify(request));
  await page
    .getByRole("button", { name: "Apply atomically", exact: true })
    .click();
  await expect(page.locator(".command-dialog [role=alert]")).toBeVisible();
  request.commands.pop();
  await field.fill(JSON.stringify(request));
  await page
    .getByRole("button", { name: "Apply atomically", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply atomically", exact: true })
    .click();
  await field.fill(JSON.stringify(request));
  await page
    .getByRole("button", { name: "Apply atomically", exact: true })
    .click();
  await expect(page.locator(".command-dialog [role=alert]")).toContainText(
    "revision conflict",
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  expect((await backup(page)).parts).toHaveLength(original.parts.length + 2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await backup(page)).parts).toHaveLength(original.parts.length + 1);
});
for (const [operation, width] of [
  ["Union", 150],
  ["Subtract", 50],
  ["Intersect", 50],
  ["Exclude", 150],
] as const)
  test(`real worker Boolean ${operation} preserves source and Undo`, async ({
    page,
  }) => {
    await start(page);
    await load(page, two);
    const before = await backup(page);
    await page.getByRole("button", { name: "Select all", exact: true }).click();
    await page.getByRole("button", { name: operation, exact: true }).click();
    await expect(page.locator(".canvas-host [data-part]")).toHaveCount(1, {
      timeout: 12000,
    });
    expect((await backup(page)).source).toEqual(before.source);
    const widthActual = await page
      .locator(".canvas-host [data-part]")
      .evaluate((el) => (el as SVGGraphicsElement).getBBox().width);
    expect(widthActual).toBeCloseTo(width, 2);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    expect(await backup(page)).toEqual(before);
  });
test("node editing exposes actual anchors and preserves compound paths", async ({
  page,
}) => {
  await start(page);
  await load(
    page,
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path fill="#eeeeee" fill-rule="evenodd" d="M20 20H180V180H20Z M60 60H140V140H60Z"/></svg>',
  );
  const before = await backup(page);
  await page.locator(".geometry-controls>summary").click();
  await page
    .getByRole("button", { name: "Edit path nodes", exact: true })
    .click();
  await expect(page.getByLabel("Node x", { exact: true })).toBeVisible({
    timeout: 12000,
  });
  await expect(page.locator("[data-node-index]")).toHaveCount(8);
  await page.getByLabel("Node x", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Apply node", exact: true }).click();
  await expect(
    page.locator(".canvas-host [data-geometry] path"),
  ).not.toHaveAttribute("d", before.parts[0].geometry.d, { timeout: 12000 });
  await expect(page.locator("[data-node-index]")).toHaveCount(8);
  const after = await backup(page);
  expect(after.parts[0].geometry.d).not.toBe(before.parts[0].geometry.d);
  expect(after.parts[0].fillRule).toBe("evenodd");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await backup(page)).toEqual(before);
});
test("unsupported outlined Boolean inputs leave originals untouched", async ({
  page,
}) => {
  await start(page);
  await load(
    page,
    two.replace(
      'fill="#777777"',
      'fill="#777777" stroke="#ffffff" stroke-width="2"',
    ),
  );
  const before = await backup(page);
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page.getByRole("button", { name: "Union", exact: true }).click();
  await expect(page.locator(".geometry-error")).toContainText(
    "without visible outlines",
  );
  expect(await backup(page)).toEqual(before);
});
test("transformed outlined paths retain matrix and stroke behavior after world-coordinate node edits", async ({
  page,
}) => {
  await start(page);
  await load(
    page,
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><g transform="translate(20 30) scale(2)"><rect x="0" y="0" width="50" height="50" fill="#eeeeee" stroke="#777777" stroke-width="2"/></g></svg>',
  );
  const before = await backup(page);
  await page.locator(".geometry-controls>summary").click();
  await page
    .getByRole("button", { name: "Edit path nodes", exact: true })
    .click();
  await expect(page.getByLabel("Node x", { exact: true })).toBeVisible();
  await page.getByLabel("Node x", { exact: true }).fill("15");
  await page.getByRole("button", { name: "Apply node", exact: true }).click();
  await expect(page.locator(".canvas-host [data-geometry] path")).toHaveCount(
    1,
    { timeout: 12000 },
  );
  const after = await backup(page);
  expect(after.parts[0].matrix).toEqual(before.parts[0].matrix);
  expect(after.parts[0].strokeWidth).toBe(before.parts[0].strokeWidth);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await backup(page)).toEqual(before);
});
test("interrupted geometry work is cancelable and preserves all originals", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Native = window.Worker;
    window.Worker = class extends Native {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes("geometry.worker"))
          this.postMessage = () => {};
      }
    };
  });
  await start(page);
  await load(page, two);
  const before = await backup(page);
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page.getByRole("button", { name: "Union", exact: true }).click();
  await expect(page.locator(".geometry-progress")).toBeVisible();
  await page
    .locator(".geometry-progress")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(await backup(page)).toEqual(before);
  await expect(
    page.getByRole("button", { name: "Union", exact: true }),
  ).toBeEnabled();
});

test("SVG default paint is neutral black while explicit artwork paint is preserved", async ({
  page,
}) => {
  await start(page);
  await load(
    page,
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="60" height="60"/><circle cx="140" cy="40" r="30" fill="#17243b"/></svg>',
  );
  const saved = await backup(page);
  expect(saved.parts[0].fill).toBe("#000000");
  expect(saved.parts[1].fill).toBe("#17243b");
});
