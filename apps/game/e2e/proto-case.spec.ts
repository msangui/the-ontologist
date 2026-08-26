import { expect, test, type Page } from '@playwright/test';

/**
 * Playthrough of the proto recall case: teleport near each scannable
 * (debug hook), scan with E, and assert the engine's verdicts reach the UI —
 * the affected chain, the unknown-vs-false "uncertain", the contradiction
 * red thread, and the explanation trace.
 */

async function scanAt(page: Page, entityId: string): Promise<void> {
  const teleported = await page.evaluate(
    (id) => window.__ontologist!.debug.teleportTo(id),
    entityId,
  );
  expect(teleported).toBe(true);
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
  await page.keyboard.press('Escape'); // close the lens card between scans
}

test('the recall case plays end to end with live inference', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__ontologist?.ready === true, undefined, {
    timeout: 30_000,
  });

  // Everything starts undetermined.
  await expect(page.getByTestId('status-product:choco-oat-bites')).toContainText('undetermined');

  // Investigate: notice → manifest → shelf products.
  await scanAt(page, 'doc:recall-notice');
  await expect(page.getByTestId('objective')).toContainText('which shelf products');

  await scanAt(page, 'doc:delivery-manifest');
  await scanAt(page, 'product:choco-oat-bites');

  // The engine derived the transitive chain: product → mix → recalled paste.
  await expect(page.getByTestId('status-product:choco-oat-bites')).toContainText('AFFECTED');

  // Unknown ≠ false: the smudged label leaves Trail Crunch UNCERTAIN, not safe.
  await scanAt(page, 'product:trail-crunch');
  await expect(page.getByTestId('status-product:trail-crunch')).toContainText('UNCERTAIN');

  // Sunny Pops: shelf tag contradicts the manifest → one red thread.
  await scanAt(page, 'product:sunny-pops');
  await expect(page.getByTestId('thread-count')).toContainText('1 red thread');

  await scanAt(page, 'product:berry-granola');
  await expect(page.getByTestId('status-product:berry-granola')).toContainText('safe');
  await expect(page.getByTestId('case-complete')).toBeVisible();

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
