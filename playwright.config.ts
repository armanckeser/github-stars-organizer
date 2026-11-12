import { defineConfig, devices } from "@playwright/test";

// Browser tests for the Play screen (e2e/). The 3D board needs WebGL, which headless
// Chromium draws in software with SwiftShader, so no GPU is needed.
const PORT = 5198;

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  // Software WebGL is slow: more than a few boards at once starve each other.
  workers: 3,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 860 },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 }, launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] } },
    },
  ],
  webServer: { command: `npx vite --port ${PORT} --strictPort`, url: `http://localhost:${PORT}/run`, reuseExistingServer: !process.env.CI },
});
