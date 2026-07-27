import { defineConfig, devices } from "@playwright/test";

/**
 * Two projects against two separate app containers:
 *
 * - `api` exercises the cross-module seams (API + database + market data + LLM)
 *   with no browser at all.
 * - `e2e` drives the real UI in Chromium.
 *
 * Each project owns its own container, so the browser suite never sees cash the
 * API suite spent. Within a project the specs run serially in filename order:
 * only `01-*` may assert the seeded state, everything after it takes its own
 * baseline first.
 */

const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:8000";
const API_BASE_URL = process.env.API_BASE_URL ?? E2E_BASE_URL;

export default defineConfig({
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  projects: [
    {
      name: "api",
      testDir: "./api",
      use: { baseURL: API_BASE_URL },
    },
    {
      name: "e2e",
      testDir: "./e2e",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: E2E_BASE_URL,
        viewport: { width: 1680, height: 1000 },
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
      },
    },
  ],
});
