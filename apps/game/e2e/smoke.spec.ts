import { expect, test } from '@playwright/test';

/**
 * Smoke test v1 (backlog #18): page loads → WebGL2 boots → canvas renders →
 * React overlay mounts → the Zustand round-trip works → no console errors.
 */
test('game boots with WebGL2, overlay mounts, store round-trip works', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('/');

  // Engine-ready hook exposed by main.tsx.
  await page.waitForFunction(() => window.__ontologist?.ready === true, undefined, {
    timeout: 30_000,
  });
  const hook = await page.evaluate(() => ({
    webgl2: window.__ontologist?.webgl2,
    ready: window.__ontologist?.ready,
  }));
  expect(hook.webgl2).toBe(true);
  expect(hook.ready).toBe(true);

  // Canvas present and sized; React overlay mounted beside it.
  await expect(page.locator('#render-canvas')).toBeVisible();
  await expect(page.getByTestId('overlay-panel')).toBeVisible();

  // React → store round-trip: the pulse button updates state.
  await page.getByTestId('pulse-button').click();
  await expect(page.getByTestId('pulse-button')).toContainText('(1)');
  const pulseCount = await page.evaluate(
    () => (window.__ontologist?.getState() as { pulseCount: number }).pulseCount,
  );
  expect(pulseCount).toBe(1);

  expect(consoleErrors).toEqual([]);
});

declare global {
  interface Window {
    __ontologist?: { ready: boolean; webgl2: boolean; getState: () => unknown };
  }
}
