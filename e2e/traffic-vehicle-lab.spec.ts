import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import path from 'node:path';
import type {
  TrafficVehicleLabSnapshot,
  TrafficVehicleLabView,
} from '../src/sandbox/scenarios/trafficVehicleLab';

test('vehicle lab presents every production traffic model and camera contract @visual', async ({
  page,
}) => {
  const issues: string[] = [];
  const failedRequests: string[] = [];
  const externalRequests: string[] = [];
  page.on('pageerror', (error) => issues.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') issues.push(message.text());
  });
  page.on('requestfailed', (request) => {
    const errorText = request.failure()?.errorText ?? 'unknown';
    // Asset fallback probes cancel redundant fetches once one source succeeds.
    if (errorText === 'net::ERR_ABORTED') return;
    failedRequests.push(`${request.url()} ${errorText}`);
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol === 'blob:') return;
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
      externalRequests.push(request.url());
    }
  });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?sandbox=traffic-vehicle-lab&e2e=1');
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__VANTA_TRAFFIC_VEHICLE_LAB__?.snapshot().ready ?? false,
      ),
    )
    .toBe(true);
  const overview = await snapshot(page);
  expect(overview.modelCount).toBe(7);
  expect(overview.models.map(({ id }) => id)).toEqual([
    'pickup-truck',
    'sports-car',
    'sport-coupe',
    'family-sedan',
    'taxi-sedan',
    'suv',
    'compact-wagon',
  ]);
  expect(new Set(overview.models.map(({ assetId }) => assetId)).size).toBe(7);
  expect(overview.models.every(({ forwardAxis }) => forwardAxis === '+z')).toBe(
    true,
  );
  await page.screenshot({
    path: screenshotPath('traffic-003-vehicle-lab-overview.png'),
    animations: 'disabled',
  });

  await setView(page, 'front');
  await expect(page.getByRole('button', { name: 'front' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.screenshot({
    path: screenshotPath('traffic-003-vehicle-lab-front.png'),
    animations: 'disabled',
  });

  await setView(page, 'side');
  await page.screenshot({
    path: screenshotPath('traffic-003-vehicle-lab-side.png'),
    animations: 'disabled',
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await setView(page, 'overview');
  const panel = page.getByTestId('traffic-vehicle-lab-panel');
  await expect(panel).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: screenshotPath('traffic-003-vehicle-lab-narrow.png'),
    animations: 'disabled',
  });

  expect(issues).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(externalRequests).toEqual([]);
});

async function snapshot(page: Page): Promise<TrafficVehicleLabSnapshot> {
  return page.evaluate(() => window.__VANTA_TRAFFIC_VEHICLE_LAB__!.snapshot());
}

async function setView(page: Page, view: TrafficVehicleLabView): Promise<void> {
  await page.evaluate(
    (next) => window.__VANTA_TRAFFIC_VEHICLE_LAB__!.setView(next),
    view,
  );
  await expect.poll(async () => (await snapshot(page)).view).toBe(view);
}

function screenshotPath(name: string): string {
  return path.join(process.cwd(), 'docs', 'screenshots', 'traffic-003', name);
}
