import { expect, test } from '@playwright/test';

/**
 * Smoke test (backlog #18): page loads → WebGL2 boots → canvas renders →
 * React overlay mounts → no console errors.
 */
test('game boots with WebGL2 and the overlay mounts', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('/');

  await page.waitForFunction(() => window.__ontologist?.ready === true, undefined, {
    timeout: 30_000,
  });
  const hook = await page.evaluate(() => ({
    webgl2: window.__ontologist?.webgl2,
    ready: window.__ontologist?.ready,
  }));
  expect(hook.webgl2).toBe(true);
  expect(hook.ready).toBe(true);

  await expect(page.locator('#render-canvas')).toBeVisible();
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('status-panel')).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

declare global {
  interface Window {
    __ontologist?: {
      ready: boolean;
      webgl2: boolean;
      getState: () => unknown;
      debug: { teleportTo: (entityId: string) => boolean };
    };
  }
}
