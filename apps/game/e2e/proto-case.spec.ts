import { expect, test } from '@playwright/test';
import { classifyInModelView, ready, scanAndChoose, scanAndRecordAll } from './helpers';

/**
 * Wave 1 with the Model verb: scanning yields leads, RECORDING builds the
 * model, and only the recorded model drives inference, statuses, threads,
 * and the unlocked Act.
 */
test('the recall case plays end to end with live inference', async ({ page }) => {
  await page.goto('/');
  await ready(page);

  // Everything starts undetermined.
  await expect(page.getByTestId('status-product:choco-oat-bites')).toContainText('undetermined');

  await scanAndRecordAll(page, 'doc:recall-notice');
  await expect(page.getByTestId('objective')).toContainText('which shelf products');

  await scanAndRecordAll(page, 'doc:delivery-manifest');
  await scanAndRecordAll(page, 'product:choco-oat-bites');

  // The recall names a CLASS — nothing is affected until the player
  // classifies. The recorded facts alone don't implicate anything.
  await expect(page.getByTestId('status-product:choco-oat-bites')).not.toContainText('AFFECTED');

  // The Classify verb: hazelnut paste is a tree nut → the engine derives
  // that it's recalled (subclass) → the transitive chain implicates the product.
  await classifyInModelView(page, 'ing:hazelnut-paste', 'true');
  await expect(page.getByTestId('status-product:choco-oat-bites')).toContainText('AFFECTED');
  // The derived membership is visible (and explainable) in Model View.
  await page.getByTestId('model-toggle').click();
  await expect(
    page.getByTestId('member-class:recalled-ingredient-ing:hazelnut-paste'),
  ).toContainText('inferred');
  await page.getByTestId('model-toggle').click();

  // Unknown ≠ false: the smudged label is the player's call — record unknown.
  await scanAndChoose(page, 'product:trail-crunch', 0, 'unknown');
  await expect(page.getByTestId('status-product:trail-crunch')).toContainText('UNCERTAIN');

  // Sunny Pops: shelf tag contradicts the manifest → one red thread.
  await scanAndRecordAll(page, 'product:sunny-pops');
  await expect(page.getByTestId('thread-count')).toContainText('1 red thread');

  // A WRONG classification propagates: corn as tree nut → Sunny Pops
  // wrongly reads AFFECTED. Undo (#61) un-derives it.
  await classifyInModelView(page, 'ing:corn', 'true');
  await expect(page.getByTestId('status-product:sunny-pops')).toContainText('AFFECTED');
  await page.getByTestId('undo-record').click();
  await expect(page.getByTestId('status-product:sunny-pops')).not.toContainText('AFFECTED');

  await scanAndRecordAll(page, 'product:berry-granola');
  await expect(page.getByTestId('status-product:berry-granola')).toContainText('safe');
  // Wave 1 complete → the Act unlocks (Field Verification is its own spec).
  await expect(page.getByTestId('file-report-open')).toBeVisible();

  // Journal: the inferred fact exists and explains itself down to evidence.
  await page.keyboard.press('j');
  const journal = page.getByTestId('journal');
  await expect(journal).toBeVisible();
  const inferredRow = journal
    .locator('li', { hasText: 'Choco Oat Bites contains Hazelnut Paste' })
    .first();
  await expect(inferredRow).toBeVisible();
  await inferredRow.getByTestId('why-button').click();
  const trace = inferredRow.getByTestId('why-trace');
  await expect(trace).toContainText('Choco Oat Bites contains Choco Base Mix');
  await expect(trace).toContainText('Choco Base Mix contains Hazelnut Paste');
});
