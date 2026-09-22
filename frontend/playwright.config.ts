import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3000";
const authState = ".playwright/auth.json";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "test-results/playwright-results.json" }],
  ],
  use: {
    baseURL,
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    viewport: { width: 1440, height: 960 },
  },
  projects: [
    {
      name: "setup",
      testMatch: /global\.setup\.ts/,
    },
    {
      name: "desktop",
      testIgnore: /global\.setup\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        storageState: authState,
        viewport: { width: 1440, height: 960 },
      },
    },
    {
      name: "tablet",
      testIgnore: /global\.setup\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        storageState: authState,
        viewport: { width: 1024, height: 900 },
      },
    },
    {
      name: "mobile",
      testIgnore: /global\.setup\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        storageState: authState,
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
