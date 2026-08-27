import { expect, test } from '@playwright/test';
import { ready, scanAndChoose, scanAndRecordAll } from './helpers';

/**
 * The Test verb over the PLAYER'S model: queries answer from what was
 * recorded — the inferred yes, the unknown with its missing evidence,
 * and no false positives.
 */
test('sentence query answers in tri-state with explanations', async ({ page }) => {
  await page.goto('/');
  await ready(page);

  await scanAndRecordAll(page, 'doc:recall-notice');
  await scanAndRecordAll(page, 'doc:delivery-manifest');
  await scanAndRecordAll(page, 'product:choco-oat-bites');
  await scanAndChoose(page, 'product:trail-crunch', 0, 'unknown');

  // Open the Ask panel and build the sentence.
  await page.getByTestId('query-toggle').click();
  const panel = page.getByTestId('query-panel');
  await expect(panel).toBeVisible();
  await page.getByTestId('query-slot').selectOption('ing:hazelnut-paste');
  await page.getByTestId('query-run').click();

  // Inferred yes: Choco Oat Bites (via the transitive chain).
  const bites = page.getByTestId('answer-product:choco-oat-bites');
  await expect(bites).toBeVisible();
  await expect(bites).not.toContainText('can’t tell');
  await bites.locator('summary').click();
  await expect(bites).toContainText('Choco Base Mix contains Hazelnut Paste');

  // Unknown: Trail Crunch — and its missing evidence is named.
  const crunch = page.getByTestId('answer-product:trail-crunch');
  await expect(crunch).toContainText('can’t tell yet');
  await crunch.locator('summary').click();
  await expect(crunch).toContainText('unknown');

  // No false positives.
  await expect(page.getByTestId('answer-product:berry-granola')).toHaveCount(0);
  await expect(page.getByTestId('answer-product:sunny-pops')).toHaveCount(0);

  // Second template: sold-at (inverse-backed) still answers.
  await page.getByTestId('query-template').selectOption('soldHere');
  await page.getByTestId('query-run').click();
  await expect(page.getByTestId('answer-product:choco-oat-bites')).toBeVisible();
});
