import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  timeout: 30000,
  use: {
    baseURL: process.env.PRODUCTION_E2E
      ? "http://127.0.0.1:5174"
      : "http://127.0.0.1:5173",
    channel: "chrome",
    headless: true,
    screenshot: "only-on-failure",
  },
  webServer: {
    command: process.env.PRODUCTION_E2E
      ? "npm run preview -- --port 5174 --strictPort"
      : "npm run dev",
    url: process.env.PRODUCTION_E2E
      ? "http://127.0.0.1:5174"
      : "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 30000,
  },
});
