import { expect, test, type Page } from '@playwright/test';

/**
 * The Test verb: build "Which products contain Hazelnut Paste?" through the
 * sentence slots and assert tri-state answers — the inferred yes, the
 * unknown ("can't tell yet") with its missing evidence, and no false
 * positives for unscanned/unrelated products.
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

test('sentence query answers in tri-state with explanations', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__ontologist?.ready === true, undefined, {
    timeout: 30_000,
  });

  await scanAt(page, 'doc:recall-notice');
  await scanAt(page, 'doc:delivery-manifest');
  await scanAt(page, 'product:choco-oat-bites');
  await scanAt(page, 'product:trail-crunch');

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
