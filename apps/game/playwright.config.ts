import { defineConfig } from '@playwright/test';

/**
 * Smoke/E2E harness (backlog #18).
 *
 * Two modes:
 * - E2E_BASE_URL set (CI against a Vercel preview URL): test that deployment.
 * - Otherwise: build + serve the local production preview.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173';

/**
 * Sandboxed dev environments pre-install Chromium at a fixed path; when that
 * build doesn't match this Playwright version's registry, point at it directly
 * (PW_CHROMIUM_PATH). CI installs the matching browser and leaves this unset.
 */
const executablePath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  ...(process.env.E2E_BASE_URL
    ? {}
    : {
        webServer: {
          command: 'pnpm preview',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        },
      }),
});
