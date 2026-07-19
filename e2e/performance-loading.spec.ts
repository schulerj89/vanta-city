import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { BrowserTestSnapshot } from '../src/debug/BrowserTestBridge';

const base = '/?e2e=1&debug=1&skipPicker=1';

test('reports controlled slow progress and clean loading disposal', async ({
  page,
}) => {
  await page.goto(`${base}&loadDelayMs=900`);
  const progress = page.getByRole('progressbar', { name: 'Startup progress' });
  await expect(progress).toBeVisible();
  await expect
    .poll(async () => Number(await progress.getAttribute('value')))
    .toBeGreaterThan(0);
  await expect
    .poll(async () => Number(await progress.getAttribute('value')))
    .toBeLessThan(1);

  await waitForReady(page);
  await waitForLoadingReady(page);
  const state = await snapshot(page);
  expect(state.performance.loading.disposed).toBe(true);
  expect(state.performance.loading.durationsMs.total).toBeGreaterThan(800);
  expect(state.performance.assets.inFlight).toBe(0);
  expect(state.performance.assetFaults).toMatchObject({
    delayMs: 900,
    activeLoads: 0,
  });
  expect(state.performance.runtime).toMatchObject({ enabled: true });
  expect(state.performance.renderer.frameTime).toMatchObject({ enabled: true });
  expect(state.performance.renderer.drawCalls).toBeGreaterThan(0);
  expect(state.performance.renderer.triangles).toBeGreaterThan(0);
});

test('simulates selected logical failure and reaches placeholder gameplay @smoke', async ({
  page,
}) => {
  await page.goto(`${base}&loadDelayMs=300&loadFail=character.casual.model`);
  await waitForReady(page);
  await waitForLoadingReady(page);
  await expect(page.getByText('Ashfall City is ready')).toBeVisible();
  const state = await snapshot(page);
  expect(state.character.source).toBe('placeholder');
  expect(state.performance.loading.fallbackAssetIds).toContain(
    'character.casual.model',
  );
  expect(state.performance.assets.failures).toBeGreaterThan(0);
  expect(state.gameState).toBe('playing');

  await page.goto(base);
  await waitForReady(page);
  await waitForLoadingReady(page);
  const recovered = await snapshot(page);
  expect(recovered.character.source).toBe('asset');
  expect(recovered.performance.assetFaults).toMatchObject({
    delayMs: 0,
    failureAssetId: undefined,
  });
});

test('defers Help, survives cold reload, and replaces disposed startup state', async ({
  page,
}) => {
  await page.goto(base);
  await waitForReady(page);
  await waitForLoadingReady(page);
  expect(await helpResources(page)).toEqual([]);
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Controls' })).toBeVisible();
  expect((await helpResources(page)).length).toBe(1);

  await page.reload();
  await waitForReady(page);
  await waitForLoadingReady(page);
  const state = await snapshot(page);
  expect(state.performance.loading.disposed).toBe(true);
  expect(state.performance.assets.inFlight).toBe(0);
  expect(state.performance.assetFaults?.activeLoads).toBe(0);
  expect(await helpResources(page)).toEqual([]);
});

async function waitForReady(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () => window.__VANTA_TEST__?.snapshot().gameState ?? 'unavailable',
        ),
      { timeout: 20_000 },
    )
    .toBe('playing');
}

async function waitForLoadingReady(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__VANTA_TEST__?.snapshot().performance.loading.readiness ??
            'unavailable',
        ),
      { timeout: 20_000 },
    )
    .toBe('ready');
}

async function snapshot(page: Page): Promise<BrowserTestSnapshot> {
  return page.evaluate(() => {
    if (!window.__VANTA_TEST__) throw new Error('Test bridge unavailable');
    return window.__VANTA_TEST__.snapshot();
  });
}

async function helpResources(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map(({ name }) => name)
      .filter((name) => /\/HelpOverlaySystem(?:-|\.|$)/.test(name)),
  );
}
