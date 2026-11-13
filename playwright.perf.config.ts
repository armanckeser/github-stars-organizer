import { defineConfig, devices } from "@playwright/test";

// The perf harness (e2e/perf/), kept out of `npx playwright test`. It builds the
// production app with the board reachable from the page (VITE_PERF=1), serves it with
// `vite preview`, and plays a seeded run in Chromium on this machine's GPU:
//
//   PERF_LABEL=before npx playwright test -c playwright.perf.config.ts          # desktop and phone
//   PERF_LABEL=before npx playwright test -c playwright.perf.config.ts run.perf.ts --project=phone
//   PERF_LABEL=before PERF_PROFILE=1 npx playwright test -c playwright.perf.config.ts run.perf.ts
//
// run.perf.ts measures a 7-round run (about 10 minutes a device): its numbers land in
// perf-results/<label>-<device>.json, and `npx tsx e2e/perf/compare.ts before after`
// prints two labels side by side. look.perf.ts saves the same seeded frames and pictures
// under perf-results/look/, so a change can show the screen did not change.
// options.perf.ts runs on its own project, the phone on a GPU in software, and measures
// what the visual trade-offs (pixel ratio, shadows, blur) would buy.
// PERF_PROFILE=1 adds the hottest functions from a CPU profile, which slows the page, so
// leave it off for the frame numbers.
const PORT = Number(process.env.PERF_PORT ?? 5197);
const PHONE = { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

export default defineConfig({
  testDir: "e2e/perf",
  testMatch: "*.perf.ts",
  timeout: 30 * 60_000,
  // One board at a time: two would share the GPU and each other's frames.
  workers: 1,
  fullyParallel: false,
  outputDir: "perf-results/artifacts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "off", reducedMotion: "no-preference", actionTimeout: 20_000 },
  projects: [
    // The full Chromium in its new headless mode draws WebGL on the machine's GPU; the headless shell only has SwiftShader.
    // A laptop's screen: two device pixels to the CSS pixel, as on every MacBook.
    { name: "desktop", testIgnore: "options.perf.ts", use: { ...devices["Desktop Chrome"], channel: "chromium", viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 } },
    { name: "phone", testIgnore: "options.perf.ts", use: { ...PHONE, channel: "chromium" } },
    // The phone on SwiftShader, a GPU in software, so the GPU's share of a frame shows in frame times (options.perf.ts).
    { name: "phone-software", testMatch: "options.perf.ts", use: { ...PHONE, channel: "chromium", launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } } },
  ],
  webServer: {
    command: `VITE_DEMO=1 VITE_PERF=1 npx vite build --sourcemap --outDir dist-perf --emptyOutDir && npx vite preview --outDir dist-perf --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/run`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
