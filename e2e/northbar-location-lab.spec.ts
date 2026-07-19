import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { NorthbarLabApi } from '../src/sandbox/scenarios/northbarLocationLab';

const captureDirectory = path.resolve('docs/screenshots/northbar-002');

test('@visual Northbar depot staging views are production-readable', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const externalRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => failedRequests.push(request.url()));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      externalRequests.push(request.url());
    }
  });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?sandbox=northbar-location-lab');
  await expect
    .poll(() =>
      page.evaluate(() => window.__VANTA_NORTHBAR_LAB__?.snapshot().ready),
    )
    .toBe(true);

  const initial = await page.evaluate(() =>
    window.__VANTA_NORTHBAR_LAB__!.snapshot(),
  );
  expect(initial.levelId).toBe('northbar-coach-depot');
  expect(initial.activeSectors).toEqual([
    'sector.northbar.arrival',
    'sector.northbar.departure',
    'sector.northbar.infrastructure',
  ]);
  expect(initial.colliders).toBeGreaterThan(20);

  await mkdir(captureDirectory, { recursive: true });
  for (const view of [
    'establishing',
    'street',
    'overhead',
    'mack-close',
    'della-close',
    'departure',
  ] as const) {
    await page.evaluate((nextView) => {
      window.__VANTA_NORTHBAR_LAB__!.setView(nextView);
    }, view);
    await expect
      .poll(() =>
        page.evaluate(() => window.__VANTA_NORTHBAR_LAB__?.snapshot().view),
      )
      .toBe(view);
    await page.screenshot({
      path: path.join(captureDirectory, `${view}-1280x720.png`),
    });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    window.__VANTA_NORTHBAR_LAB__!.setView('della-close');
  });
  await page.screenshot({
    path: path.join(captureDirectory, 'della-close-390x844.png'),
  });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(externalRequests).toEqual([]);
});

declare global {
  interface Window {
    __VANTA_NORTHBAR_LAB__?: NorthbarLabApi;
  }
}
