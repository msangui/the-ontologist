import { expect, type Page } from '@playwright/test';

/** Shared playthrough helpers for the clue-based (Model verb) flow. */

export const ready = (page: Page) =>
  page.waitForFunction(() => window.__ontologist?.ready === true, undefined, { timeout: 30_000 });

export async function scanAt(page: Page, entityId: string): Promise<void> {
  await page.evaluate((id) => window.__ontologist!.debug.teleportTo(id), entityId);
  await page.waitForFunction(
    (id) => (window.__ontologist!.getState() as { nearbyId: string | null }).nearbyId === id,
    entityId,
  );
  await page.keyboard.press('e');
  await expect(page.getByTestId('lens-card')).toBeVisible();
}

/** Scan and record every unambiguous clue from the entity's lens card. */
export async function scanAndRecordAll(page: Page, entityId: string): Promise<void> {
  await scanAt(page, entityId);
  const recordAll = page.getByTestId('record-all');
  if ((await recordAll.count()) > 0) await recordAll.click();
  await page.keyboard.press('Escape');
}

/** Classify a candidate in Model View (the Classify verb). */
export async function classifyInModelView(
  page: Page,
  entityId: string,
  choice: 'true' | 'false',
): Promise<void> {
  await page.getByTestId('model-toggle').click();
  await expect(page.getByTestId('model-view')).toBeVisible();
  await page.getByTestId(`classify-${entityId}-${choice}`).click();
  await page.getByTestId('model-toggle').click();
}

/** Scan and resolve the entity's ambiguous clue with the given choice. */
export async function scanAndChoose(
  page: Page,
  entityId: string,
  clueIndex: number,
  choice: 'unknown' | 'true' | 'false',
): Promise<void> {
  await scanAt(page, entityId);
  await page.getByTestId(`clue-${entityId}#${clueIndex}-${choice}`).click();
  await page.keyboard.press('Escape');
}

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
