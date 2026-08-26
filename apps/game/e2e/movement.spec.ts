import { expect, test, type Page } from '@playwright/test';

/**
 * Movement regression: keys are screen-aligned, not world-axis-aligned.
 * With the fixed camera at alpha = -π/4, "up on screen" is world (−x, +z)
 * and "right on screen" is world (+x, +z).
 */

async function playerPosition(page: Page): Promise<{ x: number; z: number }> {
  return page.evaluate(() => window.__ontologist!.debug.getPlayerPosition());
}

async function hold(page: Page, key: string, ms: number): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

test('arrow keys move the player in screen directions', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__ontologist?.ready === true, undefined, {
    timeout: 30_000,
  });

  // Start mid-floor with room in every direction.
  await page.evaluate(() => window.__ontologist!.debug.teleportTo('product:choco-oat-bites'));
  await page.keyboard.press('Escape');

  // Up: toward the top of the screen → x decreases, z increases.
  const start = await playerPosition(page);
  await hold(page, 'ArrowUp', 350);
  const afterUp = await playerPosition(page);
  expect(afterUp.x).toBeLessThan(start.x - 0.2);
  expect(afterUp.z).toBeGreaterThan(start.z + 0.2);

  // Right: toward the right of the screen → x increases (z also increases
  // for this camera angle; the sign of x is what distinguishes it from up).
  await hold(page, 'ArrowRight', 350);
  const afterRight = await playerPosition(page);
  expect(afterRight.x).toBeGreaterThan(afterUp.x + 0.2);

  // Down: back toward the bottom → x increases, z decreases.
  await hold(page, 'ArrowDown', 350);
  const afterDown = await playerPosition(page);
  expect(afterDown.z).toBeLessThan(afterRight.z - 0.2);
});

declare global {
  interface Window {
    __ontologist?: {
      ready: boolean;
      webgl2: boolean;
      getState: () => unknown;
      debug: {
        teleportTo: (entityId: string) => boolean;
        getPlayerPosition: () => { x: number; z: number };
      };
    };
  }
}
