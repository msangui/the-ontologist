import { expect, test, type Page } from '@playwright/test';
import { classifyInModelView, mergeInModelView, ready, scanAndRecordAll } from './helpers';

/**
 * G1 tech-gate line (#64): saves survive reload + export/import round-trip —
 * including the recorded-clue model and the undo stack.
 */

const state = (page: Page) =>
  page.evaluate(
    () =>
      window.__ontologist!.getState() as {
        scannedIds: readonly string[];
        savesWritten: number;
        canUndo: boolean;
        phase: string;
      },
  );

test('saves survive reload and export/import round-trip', async ({ page }) => {
  await page.goto('/');
  await ready(page);

  // Play partway (3 scans + 3 record-alls + 1 classify + 1 merge = 8 autosaves).
  await scanAndRecordAll(page, 'doc:recall-notice');
  await scanAndRecordAll(page, 'doc:delivery-manifest');
  await scanAndRecordAll(page, 'product:choco-oat-bites');
  await classifyInModelView(page, 'ing:hazelnut-paste', 'true');
  await mergeInModelView(page, 'mix:choco-base', 'mix:ns-choco-base');
  await page.waitForFunction(
    () => (window.__ontologist!.getState() as { savesWritten: number }).savesWritten >= 8,
  );

  // Hard reload → autosave resumes the exact case state, undo stack included.
  await page.reload();
  await ready(page);
  const resumed = await state(page);
  expect(resumed.scannedIds).toContain('doc:recall-notice');
  expect(resumed.scannedIds).toContain('product:choco-oat-bites');
  expect(resumed.canUndo).toBe(true);
  await expect(page.getByTestId('status-product:choco-oat-bites')).toContainText('AFFECTED');

  // Export the save to a file.
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-save').click();
  const download = await downloadPromise;
  const savePath = await download.path();
  expect(savePath).toBeTruthy();

  // Reset → fresh case; reload → STILL fresh (autosave was cleared).
  await page.getByTestId('reset-case').click();
  expect((await state(page)).scannedIds).toEqual([]);
  await page.reload();
  await ready(page);
  expect((await state(page)).scannedIds).toEqual([]);
  await expect(page.getByTestId('objective')).toContainText('find it in the backroom');

  // Import the exported file → the investigation is back.
  await page.getByTestId('import-save').click();
  await page.getByTestId('import-save-input').setInputFiles(savePath!);
  await page.waitForFunction(
    () =>
      (window.__ontologist!.getState() as { scannedIds: readonly string[] }).scannedIds.length ===
      3,
  );
  await expect(page.getByTestId('status-product:choco-oat-bites')).toContainText('AFFECTED');
});

test('a corrupt import is refused gracefully', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.getByTestId('import-save').click();
  await page.getByTestId('import-save-input').setInputFiles({
    name: 'bogus.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"saveVersion": 999, "nonsense": true}'),
  });
  await expect(page.getByTestId('import-error')).toContainText('not a valid save');
  // Play continues untouched.
  await expect(page.getByTestId('hud')).toBeVisible();
});
