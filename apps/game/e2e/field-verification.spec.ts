import { expect, test, type Page } from '@playwright/test';
import { ready, scanAndChoose, scanAndRecordAll } from './helpers';

/**
 * The signature mechanic under the Model verb: how the player RECORDS the
 * ambiguous clue shapes the whole case.
 * - Record it UNKNOWN → uncertain → hold → the lab confirms → nobody hurt.
 * - Record it FALSE (unknown-vs-false mistake) → "safe" → left on sale →
 *   the lab contradicts the player's own model → visible harm.
 */

async function playWaveOne(page: Page, trailChoice: 'unknown' | 'false'): Promise<void> {
  await page.goto('/');
  await ready(page);
  await scanAndRecordAll(page, 'doc:recall-notice');
  await scanAndRecordAll(page, 'doc:delivery-manifest');
  await scanAndRecordAll(page, 'product:choco-oat-bites');
  await scanAndChoose(page, 'product:trail-crunch', 0, trailChoice);
  await scanAndRecordAll(page, 'product:sunny-pops');
  await scanAndRecordAll(page, 'product:berry-granola');
  await page.getByTestId('file-report-open').click();
  await expect(page.getByTestId('commit-panel')).toBeVisible();
  // Consequence Preview is present before commit.
  await expect(page.getByTestId('commit-panel')).toContainText('what the model predicts');
}

async function verifyAndClose(page: Page): Promise<void> {
  await page.getByTestId('file-report').click();
  await expect(page.getByTestId('objective')).toContainText('Field Verification');
  // The wave-2 evidence appeared only now; its findings must be RECORDED too.
  await scanAndRecordAll(page, 'doc:lab-report');
  await page.getByTestId('close-case').click();
  await expect(page.getByTestId('debrief-panel')).toBeVisible();
}

test('recording the ambiguity as unknown and holding survives Field Verification', async ({
  page,
}) => {
  await playWaveOne(page, 'unknown');
  await expect(page.getByTestId('status-product:trail-crunch')).toContainText('UNCERTAIN');
  await page.getByTestId('decision-product:trail-crunch-hold').check();
  await verifyAndClose(page);

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

test('recording the ambiguity as false causes visible harm', async ({ page }) => {
  await playWaveOne(page, 'false');
  // The modeling mistake makes it read "safe" — no hold/clear choice appears.
  await expect(page.getByTestId('status-product:trail-crunch')).toContainText('safe');
  await verifyAndClose(page);

  // The lab's finding contradicts the player's own recorded "false":
  // a second red thread, and the harm lands on the anchor.
  await expect(page.getByTestId('thread-count')).toContainText('2 red threads');
  await expect(page.getByTestId('debrief-product:trail-crunch')).toContainText(
    'never justified clearing it',
  );
  await expect(page.getByTestId('debrief-anchor')).toContainText('bought the cleared product');
});
