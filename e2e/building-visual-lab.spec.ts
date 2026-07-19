import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type {
  BuildingLabApi,
  BuildingLabLodState,
  BuildingLabSnapshot,
  BuildingLabView,
} from '../src/sandbox/scenarios/buildingVisualLab';

test('building lab renders every variant, material, diagnostic, LOD, and view @visual', async ({
  page,
}) => {
  const issues: string[] = [];
  const failedRequests: string[] = [];
  const externalRequests: string[] = [];
  page.on('pageerror', (error) => issues.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') issues.push(message.text());
  });
  page.on('requestfailed', (request) => failedRequests.push(request.url()));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname))
      externalRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?sandbox=building-visual-lab&e2e=1');
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__VANTA_BUILDING_LAB__?.snapshot().ready ?? false,
      ),
    )
    .toBe(true);

  const overview = await snapshot(page);
  expect(overview).toMatchObject({
    view: 'overview',
    lodState: 'near-detail',
    variantCount: 26,
    textureCount: 11,
    boundsVisible: true,
    collisionVisible: true,
  });
  expect(overview.meshCount).toBeGreaterThanOrEqual(52);
  expect(overview.variants).toHaveLength(26);
  expect(new Set(overview.textures)).toEqual(
    new Set([
      'concrete-deco',
      'brick-stucco',
      'corrugated-teal',
      'window-deco',
      'roof-membrane',
      'sidewalk-concrete',
      'curb-aggregate',
      'ribbed-zinc',
      'ceramic-tile',
      'glass-block',
      'painted-shopfront',
    ]),
  );
  expect(new Set(overview.variants.map(({ id }) => id)).size).toBe(26);
  expect(
    overview.variants.every(
      ({
        bounds,
        collisionBounds,
        footprint,
        height,
        localFrontage,
        entrances,
        lodPieces,
      }) =>
        bounds.max.every(Number.isFinite) &&
        bounds.min.every(Number.isFinite) &&
        collisionBounds.max.every(Number.isFinite) &&
        collisionBounds.min.every(Number.isFinite) &&
        footprint.every((value) => value > 0) &&
        height > 0 &&
        localFrontage.join(',') === '0,0,1' &&
        entrances.length > 0 &&
        lodPieces.near > 0 &&
        lodPieces.far > 0 &&
        Math.abs(bounds.min[0] - collisionBounds.min[0]) < 0.001 &&
        Math.abs(bounds.max[0] - collisionBounds.max[0]) < 0.001 &&
        Math.abs(bounds.min[1] - collisionBounds.min[1]) < 0.001 &&
        Math.abs(bounds.max[1] - collisionBounds.max[1]) < 0.001 &&
        Math.abs(bounds.min[2] - collisionBounds.min[2]) < 0.001 &&
        Math.abs(bounds.max[2] - collisionBounds.max[2]) < 0.001,
    ),
  ).toBe(true);
  for (const [index, variant] of overview.variants.entries()) {
    for (const other of overview.variants.slice(index + 1)) {
      const overlapX =
        variant.collisionBounds.min[0] < other.collisionBounds.max[0] &&
        variant.collisionBounds.max[0] > other.collisionBounds.min[0];
      const overlapZ =
        variant.collisionBounds.min[2] < other.collisionBounds.max[2] &&
        variant.collisionBounds.max[2] > other.collisionBounds.min[2];
      expect(overlapX && overlapZ, `${variant.id} overlaps ${other.id}`).toBe(
        false,
      );
    }
  }
  await expect(
    page.getByTestId('building-lab-panel').locator('tbody tr'),
  ).toHaveCount(26);
  await expect(page).toHaveScreenshot('building-lab-overview.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.02,
  });

  for (const variant of overview.variants) {
    await setFocusedVariant(page, variant.id);
    await expect
      .poll(async () => (await snapshot(page)).focusedVariantId)
      .toBe(variant.id);
  }

  await setFocusedVariant(page, 'arrival-shed');
  await setView(page, 'close');
  await expect(page).toHaveScreenshot('building-lab-close.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.02,
  });

  await setView(page, 'street');
  await expect(page).toHaveScreenshot('building-lab-street.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.02,
  });

  await setView(page, 'overhead');
  await expect(page).toHaveScreenshot('building-lab-overhead.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.02,
  });

  await setView(page, 'materials');
  await expect(page).toHaveScreenshot('building-lab-materials.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.02,
  });

  await setFocusedVariant(page, 'municipal-annex');
  await setLodState(page, 'far-detail');
  await setView(page, 'close');
  expect((await snapshot(page)).lodState).toBe('far-detail');
  await expect(page).toHaveScreenshot('building-lab-far-detail.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.02,
  });

  await setFocusedVariant(page, 'cold-store');
  await setLodState(page, 'shell-only');
  await setView(page, 'close');
  await expect(page).toHaveScreenshot('building-lab-shell-only.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.02,
  });

  await setLodState(page, 'near-detail');
  await page.evaluate(() => {
    window.__VANTA_BUILDING_LAB__!.setBoundsVisible(false);
    window.__VANTA_BUILDING_LAB__!.setCollisionVisible(false);
  });
  expect(await snapshot(page)).toMatchObject({
    boundsVisible: false,
    collisionVisible: false,
  });
  await page.evaluate(() => {
    window.__VANTA_BUILDING_LAB__!.setBoundsVisible(true);
    window.__VANTA_BUILDING_LAB__!.setCollisionVisible(true);
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await setFocusedVariant(page, 'corner-chemist');
  await setView(page, 'close');
  const panel = page.getByTestId('building-lab-panel');
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole('button', { name: 'close', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page).toHaveScreenshot('building-lab-narrow.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.02,
  });
  expect(issues).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(externalRequests).toEqual([]);
});

async function snapshot(page: Page): Promise<BuildingLabSnapshot> {
  return page.evaluate(() => window.__VANTA_BUILDING_LAB__!.snapshot());
}

async function setView(page: Page, view: BuildingLabView): Promise<void> {
  await page.evaluate(
    (next) => window.__VANTA_BUILDING_LAB__!.setView(next),
    view,
  );
}

async function setFocusedVariant(page: Page, id: string): Promise<void> {
  await page.evaluate(
    (next) => window.__VANTA_BUILDING_LAB__!.setFocusedVariant(next),
    id,
  );
}

async function setLodState(
  page: Page,
  state: BuildingLabLodState,
): Promise<void> {
  await page.evaluate(
    (next) => window.__VANTA_BUILDING_LAB__!.setLodState(next),
    state,
  );
}

declare global {
  interface Window {
    __VANTA_BUILDING_LAB__?: BuildingLabApi;
  }
}
