import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type {
  BuildingLabApi,
  BuildingLabSnapshot,
} from '../src/sandbox/scenarios/buildingVisualLab';

test('building lab renders every variant, diagnostic, material, and view @visual', async ({
  page,
}) => {
  const issues: string[] = [];
  page.on('pageerror', (error) => issues.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') issues.push(message.text());
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?sandbox=building-visual-lab&e2e=1');
  await expect.poll(async () => (await snapshot(page)).ready).toBe(true);

  const overview = await snapshot(page);
  expect(overview).toMatchObject({
    view: 'overview',
    variantCount: 18,
    textureCount: 5,
  });
  expect(overview.meshCount).toBeGreaterThanOrEqual(36);
  expect(overview.variants).toHaveLength(18);
  expect(new Set(overview.variants.map(({ id }) => id)).size).toBe(18);
  expect(
    overview.variants.every(
      ({ bounds, footprint, height, uvMetersPerRepeat }) =>
        bounds.max.every(Number.isFinite) &&
        bounds.min.every(Number.isFinite) &&
        footprint.every((value) => value > 0) &&
        height > 0 &&
        uvMetersPerRepeat >= 2,
    ),
  ).toBe(true);
  await expect(
    page.getByTestId('building-lab-panel').locator('tbody tr'),
  ).toHaveCount(18);
  await expect(page).toHaveScreenshot('building-lab-overview.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.02,
  });

  await setView(page, 'street');
  await expect.poll(async () => (await snapshot(page)).view).toBe('street');
  await expect(page).toHaveScreenshot('building-lab-street.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.02,
  });

  await setView(page, 'overhead');
  await expect.poll(async () => (await snapshot(page)).view).toBe('overhead');
  await expect(page).toHaveScreenshot('building-lab-overhead.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.02,
  });

  await page.setViewportSize({ width: 390, height: 760 });
  await setView(page, 'street');
  await expect(page.getByTestId('building-lab-panel')).toBeVisible();
  await expect(page).toHaveScreenshot('building-lab-narrow.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.02,
  });
  expect(issues).toEqual([]);
});

async function snapshot(page: Page): Promise<BuildingLabSnapshot> {
  return page.evaluate(() => window.__VANTA_BUILDING_LAB__!.snapshot());
}

async function setView(
  page: Page,
  view: 'overview' | 'street' | 'overhead',
): Promise<void> {
  await page.evaluate(
    (next) => window.__VANTA_BUILDING_LAB__!.setView(next),
    view,
  );
}

declare global {
  interface Window {
    __VANTA_BUILDING_LAB__?: BuildingLabApi;
  }
}
