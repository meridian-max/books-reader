import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  webServer: { command: "npm run preview -- --port 5173", url: "http://127.0.0.1:5173", reuseExistingServer: true, timeout: 15000 },
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "test-results/report" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    viewport: { width: 1365, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync("/home/divyansh/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome") ? "/home/divyansh/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome" : undefined),
    },
  },
  outputDir: "test-results/artifacts",
});
