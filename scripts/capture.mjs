import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: Number(process.argv[2] ?? 1440), height: 1100 },
  colorScheme: process.argv[3] === "dark" ? "dark" : "light",
});
await page.goto("http://127.0.0.1:5173");
await page
  .getByRole("heading", { name: "Small changes. Your signature." })
  .waitFor();
await page.getByLabel("Enable shadow").check();
await page.screenshot({
  path: `test-results/visual-${process.argv[2] ?? 1440}-${process.argv[3] ?? "light"}.jpg`,
  fullPage: true,
  type: "jpeg",
  quality: 62,
});
console.log("Visual capture completed.");
await browser.close();
