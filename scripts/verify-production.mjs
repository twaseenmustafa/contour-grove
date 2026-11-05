import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "5174",
    "--strictPort",
  ],
  { cwd: process.cwd(), stdio: "pipe" },
);
let log = "";
server.stdout.on("data", (b) => (log += b));
server.stderr.on("data", (b) => (log += b));
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw Error("Preview server failed: " + log);
    try {
      if ((await fetch("http://127.0.0.1:5174")).ok) {
        ready = true;
        break;
      }
    } catch {
      /* Wait for the preview server to start. */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  assert(ready, "Preview did not start");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const workers = [];
  page.on("worker", (worker) => workers.push(worker.url()));
  await page.goto("http://127.0.0.1:5174");
  await page.getByLabel("X position", { exact: true }).waitFor();
  await page
    .getByTestId("logo-input")
    .setInputFiles("tests/fixtures/user-sunburst.png");
  const accept = page.getByRole("button", { name: "Use these shapes" });
  await accept.waitFor();
  await page.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent === "Use these shapes",
      )?.disabled,
    {},
    { timeout: 25000 },
  );
  assert.equal(
    await page.getByTestId("trace-preview").locator("[data-part]").count(),
    7,
  );
  await accept.click();
  await page.getByLabel("X position").fill("17");
  const originalWidth = Number(
    await page.getByLabel("Width", { exact: true }).inputValue(),
  );
  await page
    .getByLabel("Width", { exact: true })
    .fill(String(Math.round(originalWidth * 1.1 * 100) / 100));
  await page.getByLabel("Width", { exact: true }).press("Enter");
  await page.getByLabel("Rotation", { exact: true }).fill("12");
  await page.getByLabel("Rotation", { exact: true }).press("Enter");
  await page.waitForFunction(() =>
    document
      .querySelector(".save-status")
      ?.textContent?.includes("Saved on this device"),
  );
  await page.reload();
  assert.equal(await page.getByLabel("X position").inputValue(), "17");
  assert.equal(
    await page.getByLabel("Rotation", { exact: true }).inputValue(),
    "12",
  );
  assert(
    Number(await page.getByLabel("Width", { exact: true }).inputValue()) >
      originalWidth,
  );
  assert(
    workers.some((url) => /assets\/trace\.worker-.*\.js/.test(url)),
    "Bundled production worker must load",
  );
  assert.deepEqual(errors, []);
  await page.screenshot({
    path: ".internal_docs/verifications/tracing-production-editor.jpg",
    fullPage: true,
  });
  await page
    .getByRole("checkbox", { name: "Select Part 2", exact: true })
    .check();
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await page.screenshot({
    path: ".internal_docs/verifications/organization-production.jpg",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await page.getByRole("button", { name: "Hide", exact: true }).click();
  await page.waitForFunction(() =>
    document
      .querySelector(".save-status")
      ?.textContent?.includes("Saved on this device"),
  );
  await page.reload();
  await page.waitForFunction(
    () => document.querySelectorAll(".canvas-host [data-part]").length === 5,
  );
  await page.locator(".canvas-setup > summary").click();
  await page.getByLabel("Canvas width", { exact: true }).fill("700");
  await page.getByLabel("Canvas height", { exact: true }).fill("420");
  await page
    .getByRole("button", { name: "Apply canvas size", exact: true })
    .click();
  await page.getByLabel("Canvas zoom", { exact: true }).selectOption("2");
  await page
    .getByRole("button", { name: "Fit to canvas", exact: true })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector(".save-status")
      ?.textContent?.includes("Saved on this device"),
  );
  await page.reload();
  await page.locator(".canvas-setup > summary").click();
  assert.equal(
    await page.getByLabel("Canvas width", { exact: true }).inputValue(),
    "700",
  );
  assert.equal(
    await page.getByLabel("Canvas height", { exact: true }).inputValue(),
    "420",
  );
  await page.screenshot({
    path: ".internal_docs/verifications/studio-production.jpg",
    fullPage: true,
    animations: "disabled",
  });
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const data = JSON.parse(await readFile(await (await event).path(), "utf8"));
  assert.equal(data.groups.length, 1);
  assert.deepEqual(data.viewBox.slice(2), [700, 420]);
  assert.equal(data.zoom, undefined);
  assert.equal(data.parts.filter((p) => p.hidden && p.locked).length, 2);
  assert(data.source.raster.dataURL.startsWith("data:image/png;base64,"));
  assert.deepEqual(errors, []);
  await page.getByTestId("asset-input").setInputFiles([
    {
      name: "production-mark.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="35" fill="#8ca7ff"/></svg>',
      ),
    },
    {
      name: "production-reference.png",
      mimeType: "image/png",
      buffer: await readFile("tests/fixtures/user-sunburst.png"),
    },
  ]);
  await page.waitForFunction(
    () => document.querySelectorAll(".asset-card").length === 2,
  );
  await page
    .getByRole("button", {
      name: "Add production-mark.svg to canvas",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: "Add production-reference.png to canvas",
      exact: true,
    })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector(".save-status")
      ?.textContent?.includes("Saved on this device"),
  );
  await page.reload();
  await page.waitForFunction(
    () => document.querySelectorAll(".canvas-host image").length === 1,
  );
  const projectDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const composed = JSON.parse(
    await readFile(await (await projectDownload).path(), "utf8"),
  );
  assert.equal(composed.assets.length, 2);
  assert.equal(composed.parts.length, 9);
  assert.equal(composed.parts.at(-1).kind, "image");
  assert.equal(composed.groups.length, 1);
  const svgDownload = page.waitForEvent("download");
  await page.locator(".export-menu > summary").click();
  await page.getByRole("button", { name: "Export SVG", exact: true }).click();
  const exported = await readFile(await (await svgDownload).path(), "utf8");
  assert(exported.includes('href="data:image/png;base64,'));
  assert(exported.includes("<image"));
  const pngDownload = page.waitForEvent("download");
  await page.locator(".export-menu > summary").click();
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  const exportedPNG = await readFile(await (await pngDownload).path());
  assert.equal(exportedPNG.readUInt32BE(16), 1600);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      multiAssetProduction: "PASS",
      libraryAssets: 2,
      canvasItems: 9,
      placedRasterExport: true,
      autosaveReload: true,
      pageErrors: errors,
    }),
  );
  console.log(
    JSON.stringify({
      production: "PASS",
      parts: 7,
      autosaveReload: true,
      bundledWorker: true,
      organizationPersistence: true,
      canvasFramingPersistence: true,
      previewCameraIsolation: true,
      pageErrors: errors,
    }),
  );
} finally {
  if (browser) await browser.close();
  server.kill();
}
