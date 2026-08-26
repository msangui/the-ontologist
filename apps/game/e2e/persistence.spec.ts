import { expect, test, type Page } from '@playwright/test';

/**
 * G1 tech-gate line (#64): saves survive reload + export/import round-trip.
 * Flow: play partway → hard reload resumes → export file → reset (fresh) →
 * reload stays fresh (autosave cleared) → import file → state restored.
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

const ready = (page: Page) =>
  page.waitForFunction(() => window.__ontologist?.ready === true, undefined, { timeout: 30_000 });

const state = (page: Page) =>
  page.evaluate(
    () =>
      window.__ontologist!.getState() as {
        scannedIds: readonly string[];
        savesWritten: number;
        phase: string;
      },
  );

test('saves survive reload and export/import round-trip', async ({ page }) => {
  await page.goto('/');
  await ready(page);

  // Play partway and let both autosaves land.
  await scanAt(page, 'doc:recall-notice');
  await scanAt(page, 'doc:delivery-manifest');
  await scanAt(page, 'product:choco-oat-bites');
  await page.waitForFunction(
    () => (window.__ontologist!.getState() as { savesWritten: number }).savesWritten >= 3,
  );

  // Hard reload → autosave resumes the exact case state.
  await page.reload();
  await ready(page);
  const resumed = await state(page);
  expect(resumed.scannedIds).toContain('doc:recall-notice');
  expect(resumed.scannedIds).toContain('product:choco-oat-bites');
  await expect(page.getByTestId('status-product:choco-oat-bites')).toContainText('AFFECTED');
  await expect(page.getByTestId('objective')).toContainText('which shelf products');

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
  await expect(page.getByTestId('objective')).toContainText('which shelf products');
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
