import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("scissors cut a compound shape while preserving its hole and undo", async ({
  page,
}) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByLabel("X position", { exact: true }).waitFor();
  await page.getByTestId("logo-input").setInputFiles({
    name: "ring.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path fill="#eeeeee" fill-rule="evenodd" d="M20 20H180V180H20Z M60 60H140V140H60Z"/></svg>',
    ),
  });
  const parts = page.locator(".canvas-host [data-part]");
  await expect(parts).toHaveCount(1);
  const save = async () => {
    const ev = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Save project", exact: true })
      .click();
    return JSON.parse(await readFile((await (await ev).path())!, "utf8"));
  };
  const before = await save();
  const b = (await parts.first().boundingBox())!;
  await page.getByRole("button", { name: "Scissors tool" }).click();
  await page.mouse.move(b.x - 15, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width + 15, b.y + b.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(parts).toHaveCount(2, { timeout: 10000 });
  const geometry = await parts
    .locator("[data-geometry] path")
    .evaluateAll((paths) =>
      paths.map((el) => {
        const p = el as SVGGeometryElement;
        return {
          hole: p.isPointInFill(new DOMPoint(100, 80)),
          left: p.isPointInFill(new DOMPoint(40, 80)),
          right: p.isPointInFill(new DOMPoint(160, 80)),
        };
      }),
    );
  expect(geometry.some((g) => g.hole)).toBe(false);
  expect(geometry.some((g) => g.left)).toBe(true);
  expect(geometry.some((g) => g.right)).toBe(true);
  const after = await save();
  expect(after.parts.map((p: { fillRule: string }) => p.fillRule)).toEqual([
    "evenodd",
    "evenodd",
  ]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await save()).parts).toEqual(before.parts);
});

test("dragging a curve handle changes the actual path and is undoable", async ({
  page,
}) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByLabel("X position", { exact: true }).waitFor();
  await page.getByTestId("logo-input").setInputFiles({
    name: "curve.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path fill="none" stroke="#eeeeee" stroke-width="3" d="M20 100 C60 20 140 20 180 100"/></svg>',
    ),
  });
  await page.locator(".geometry-controls>summary").click();
  await page.getByRole("button", { name: "Edit path nodes" }).click();
  const handle = page.locator('[data-node-handle="out"]'),
    shape = page.locator(".canvas-host [data-geometry] path");
  await expect(handle).toHaveCount(1, { timeout: 12000 });
  const before = await shape.getAttribute("d"),
    b = (await handle.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 15, b.y + b.height / 2 + 10);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(shape).toHaveAttribute("d", before!);
  await expect(page.locator("[data-node-preview]")).toHaveCount(0);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 30, b.y + b.height / 2 + 20, {
    steps: 4,
  });
  await expect(page.locator("[data-node-preview]")).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator("[data-node-preview]")).toHaveCount(0);
  await expect(shape).not.toHaveAttribute("d", before!, { timeout: 12000 });
  await expect(page.locator("[data-node-overlay]")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(shape).toHaveAttribute("d", before!);
});

test("font, italic and spacing persist and export as editable text", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("X position", { exact: true }).waitFor();
  await page.locator(".insert-menu>summary").click();
  await page.getByRole("button", { name: "Create text" }).click();
  const text = page.locator(".canvas-host [data-part] text");
  await page.getByLabel("Font", { exact: true }).selectOption("Georgia");
  await page.getByLabel("Italic", { exact: true }).check();
  await page.getByLabel("Letter spacing", { exact: true }).fill("2.5");
  await page.getByLabel("Letter spacing", { exact: true }).press("Enter");
  await expect(text).toHaveAttribute("font-family", "Georgia");
  await expect(text).toHaveAttribute("font-style", "italic");
  await expect(text).toHaveAttribute("letter-spacing", "2.5");
  const ev = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const data = JSON.parse(await readFile((await (await ev).path())!, "utf8"));
  expect(data.parts.at(-1).textData).toMatchObject({
    font: "Georgia",
    italic: true,
    letterSpacing: 2.5,
  });
  await page.locator(".export-menu>summary").click();
  const svgEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG", exact: true }).click();
  const svg = await readFile((await (await svgEvent).path())!, "utf8");
  expect(svg).toContain('font-style="italic"');
  expect(svg).toContain('letter-spacing="2.5"');
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("project-input").setInputFiles({
    name: "styled.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(
    page.getByText(
      "Project reopened. Shapes and effect settings are editable.",
    ),
  ).toBeVisible();
  await page
    .locator('[aria-label="Logo part list"] button')
    .filter({ hasText: "Text" })
    .click();
  await expect(page.locator(".canvas-host [data-part] text")).toHaveAttribute(
    "letter-spacing",
    "2.5",
  );
  await expect(page.getByLabel("Italic", { exact: true })).toBeChecked();
  await page.getByLabel("Letter spacing", { exact: true }).fill("3");
  await page.getByLabel("Letter spacing", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(text).toHaveAttribute("letter-spacing", "2.5");
});

test("resize snaps the corner to the frame, holds the opposite corner and supports undo", async ({
  page,
}) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByLabel("X position", { exact: true }).waitFor();
  await page.locator(".file-menu>summary").click();
  await page.getByRole("button", { name: "New document", exact: true }).click();
  await page.locator(".file-menu>summary").click();
  await page.getByRole("button", { name: "Automation workbench" }).click();
  const cmd = page.getByLabel("Command batch"),
    request = JSON.parse(await cmd.inputValue());
  request.commands = [
    {
      type: "create",
      shape: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    },
  ];
  await cmd.fill(JSON.stringify(request));
  await page.getByRole("button", { name: "Apply atomically" }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Snap to objects" }).click();
  const svg = page.locator(".canvas-host > svg"),
    scale = await svg.evaluate((e) =>
      Math.hypot(
        (e as SVGSVGElement).getScreenCTM()!.a,
        (e as SVGSVGElement).getScreenCTM()!.b,
      ),
    );
  const nw = page.locator("[data-handle=nw]"),
    se = page.locator("[data-handle=se]"),
    a = (await nw.boundingBox())!,
    b = (await se.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    b.x + b.width / 2 + 310 * scale,
    b.y + b.height / 2 + 310 * scale,
    { steps: 4 },
  );
  await expect(page.locator("[data-snap-guides] line")).toHaveCount(1);
  await page.mouse.up();
  const other = (await nw.boundingBox())!;
  expect(other.x).toBeCloseTo(a.x, 0);
  expect(other.y).toBeCloseTo(a.y, 0);
  expect(
    Number(await page.getByLabel("Width", { exact: true }).inputValue()),
  ).toBeCloseTo(412, 1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Width", { exact: true })).toHaveValue("100");
  const next = (await se.boundingBox())!;
  await page.keyboard.down("Alt");
  await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    next.x + next.width / 2 + 310 * scale,
    next.y + next.height / 2 + 310 * scale,
    { steps: 4 },
  );
  await expect(page.locator("[data-snap-guides]")).toHaveCount(0);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  expect(
    Number(await page.getByLabel("Width", { exact: true }).inputValue()),
  ).toBeCloseTo(410, 1);
});

test("cutting an outlined shape gives each piece its own outline and undo restores it", async ({
  page,
}) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByLabel("X position", { exact: true }).waitFor();
  await page.getByTestId("logo-input").setInputFiles({
    name: "outlined.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g transform="translate(10 5)"><rect x="20" y="20" width="120" height="120" fill="#eeeeee" stroke="#777777" stroke-width="4"/></g></svg>',
    ),
  });
  await expect(page.getByText(/Opened outlined.svg/)).toBeVisible();
  const parts = page.locator(".canvas-host [data-part]");
  await expect(parts.first()).toBeVisible();
  const b = (await parts.first().boundingBox())!;
  await page.getByRole("button", { name: "Scissors tool" }).click();
  await expect(page.getByText(/Each piece gets its own outline/)).toBeVisible();
  await page.mouse.move(b.x - 20, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width + 20, b.y + b.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(parts).toHaveCount(2, { timeout: 10000 });
  const ev = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const saved = JSON.parse(await readFile((await (await ev).path())!, "utf8"));
  expect(saved.parts.map((p: { stroke: string }) => p.stroke)).toEqual([
    "#777777",
    "#777777",
  ]);
  expect(
    saved.parts.every((p: { strokeWidth: number }) => p.strokeWidth === 4),
  ).toBe(true);
  expect(saved.parts[0].matrix).toEqual(saved.parts[1].matrix);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(parts).toHaveCount(1);
});

test("switching selection never leaves duplicate text controls", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await page.getByLabel("X position", { exact: true }).waitFor();
  await page.locator(".insert-menu>summary").click();
  await page.getByRole("button", { name: "Create text" }).click();
  await expect(page.locator(".text-controls")).toHaveCount(1);
  await page
    .locator('[aria-label="Logo part list"] button')
    .filter({ hasText: "Petal 1" })
    .click();
  await expect(page.locator(".text-controls")).toHaveCount(0);
  await page
    .locator('[aria-label="Logo part list"] button')
    .filter({ hasText: "Text" })
    .click();
  await expect(page.locator(".text-controls")).toHaveCount(1);
  expect(errors.filter((e) => e.includes("same key"))).toEqual([]);
});
