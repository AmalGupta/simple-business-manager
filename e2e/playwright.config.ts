import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8787;
const BASE_URL = `http://localhost:${PORT}`;

// Local-profile-only Playwright suite — docs/LOCAL_PROFILE.md. Runs entirely
// against `wrangler dev --local` (Miniflare D1/R2, .dev.vars secrets). Never
// deploys and never touches a remote Cloudflare resource.
export default defineConfig({
  testDir: path.join(E2E_DIR, "tests"),
  // Tests share one local D1 database (todos, escalations, staff counts) —
  // run serially so one spec's writes can't race another's reads.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  globalSetup: path.join(E2E_DIR, "global-setup.ts"),
  // The local Miniflare worker is noticeably slower than a real deploy —
  // give navigations and assertions room before calling it a failure.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },
  webServer: {
    command: "bash run-local-worker.sh",
    cwd: E2E_DIR,
    url: `${BASE_URL}/upload`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // The sandbox pre-installs Chromium at a fixed path/revision that
        // doesn't always match @playwright/test's expected download — point
        // at it directly rather than fetching a browser at test time.
        launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
      },
    },
  ],
});
