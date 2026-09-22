import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3000";
const authState = ".playwright/auth.json";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: {
    timeout: 10_000,
  },
  outputDir: "test-results/evidence-artifacts",
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-evidence-report", open: "never" }],
    ["json", { outputFile: "test-results/playwright-evidence-results.json" }],
  ],
  use: {
    baseURL,
    channel: "chrome",
    trace: "on",
    screenshot: "on",
    video: {
      mode: "on",
      size: { width: 1280, height: 720 },
    },
    viewport: { width: 1440, height: 960 },
  },
  projects: [
    {
      name: "setup",
      testMatch: /global\.setup\.ts/,
    },
    {
      name: "lifecycle-evidence",
      testMatch: /full-lifecycle\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        storageState: authState,
        trace: "on",
        screenshot: "on",
        video: {
          mode: "on",
          size: { width: 1280, height: 720 },
        },
        viewport: { width: 1440, height: 960 },
      },
    },
  ],
});
