import { expect, test, type Page } from '@playwright/test';

/**
 * The signature mechanic: Commit → Field Verification → Debrief.
 * Two runs of the uncertain-product decision:
 * - HOLD (unknown stays unknown) → the lab confirms contamination, nobody hurt.
 * - CLEAR (unknown treated as false) → visible harm to the human anchor.
 */

async function scanAt(page: Page, entityId: string): Promise<void> {
  await page.evaluate((id) => window.__ontologist!.debug.teleportTo(id), entityId);
  await page.waitForFunction(
    (id) => (window.__ontologist!.getState() as { nearbyId: string | null }).nearbyId === id,
    entityId,
  );
  await page.keyboard.press('e');
  await page.waitForFunction(
    (id) =>
      (window.__ontologist!.getState() as { scannedIds: readonly string[] }).scannedIds.includes(
        id,
      ),
    entityId,
  );
  await page.keyboard.press('Escape');
}

async function playWaveOne(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__ontologist?.ready === true, undefined, {
    timeout: 30_000,
  });
  for (const id of [
    'doc:recall-notice',
    'doc:delivery-manifest',
    'product:choco-oat-bites',
    'product:trail-crunch',
    'product:sunny-pops',
    'product:berry-granola',
  ]) {
    await scanAt(page, id);
  }
  await page.getByTestId('file-report-open').click();
  await expect(page.getByTestId('commit-panel')).toBeVisible();
  // Consequence Preview is present before commit.
  await expect(page.getByTestId('commit-panel')).toContainText('what the model predicts');
}

async function verifyAndOpenDebrief(page: Page): Promise<void> {
  await page.getByTestId('file-report').click();
  await expect(page.getByTestId('objective')).toContainText('Field Verification');
  // The wave-2 evidence appeared in the world only now.
  await scanAt(page, 'doc:lab-report');
  await expect(page.getByTestId('debrief-panel')).toBeVisible();
}

test('holding the uncertain product survives Field Verification', async ({ page }) => {
  await playWaveOne(page);
  await page.getByTestId('decision-product:trail-crunch-hold').check();
  await verifyAndOpenDebrief(page);

  await expect(page.getByTestId('debrief-product:trail-crunch')).toContainText(
    'Held until the lab confirmed',
  );
  await expect(page.getByTestId('debrief-anchor')).toContainText('shopped safely');
  // The lab resolved the unknown: Trail Crunch is now AFFECTED in the model.
  await expect(page.getByTestId('status-product:trail-crunch')).toContainText('AFFECTED');
  // The hidden competency battery passes against the completed model (#57).
  await expect(page.getByTestId('competency-results')).toContainText('3/3');
  await expect(page.getByTestId('case-complete')).toBeVisible();
});

test('clearing the uncertain product causes visible harm', async ({ page }) => {
  await playWaveOne(page);
  await page.getByTestId('decision-product:trail-crunch-clear').check();
  // The preview warns before commit — consequences are never a surprise.
  await expect(page.getByTestId('commit-panel')).toContainText('customers are exposed');
  await verifyAndOpenDebrief(page);

  await expect(page.getByTestId('debrief-product:trail-crunch')).toContainText(
    'Cleared while the model said',
  );
  await expect(page.getByTestId('debrief-anchor')).toContainText('bought the cleared product');
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
