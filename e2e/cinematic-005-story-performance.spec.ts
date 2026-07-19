import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import type { BrowserTestSnapshot } from '../src/debug/BrowserTestBridge';

const openingId = 'cinematic.ash-001.opening';
const openingUrl = '/?e2e=1&opening=1&title=1&traffic=0&dialogueTypewriter=0';

test('authored opening keeps every required subject grounded, framed, and lands once @visual', async ({
  page,
}, testInfo) => {
  test.setTimeout(45_000);
  const diagnostics = monitor(page);
  await openOpening(page);

  const durations = [5, 5.3, 4, 4.6, 4.3, 4.8, 4.5, 4.4, 5.2];
  for (let index = 0; index < durations.length; index += 1) {
    const current = (await snapshot(page)).cinematic;
    expect(current.state).toBe('playing');
    expect(current.resolvedBlocking).toHaveLength(3);
    for (const placement of current.resolvedBlocking) {
      expect(placement.grounded).toBe(true);
      expect(placement.displacementMetres).toBeLessThanOrEqual(0.2);
    }
    for (const subject of current.compositionSubjects) {
      expect(subject.occluded).toBe(false);
      expect(subject.screenY).toBeLessThanOrEqual(0.66);
      expect(subject.marginPercent).toBeGreaterThanOrEqual(8);
    }
    for (const visual of current.compositionVisuals) {
      expect(visual.screenY).toBeLessThanOrEqual(0.66);
      expect(visual.marginPercent).toBeGreaterThanOrEqual(8);
    }
    if (index === 3) {
      expect(
        current.compositionVisuals.map(({ visualId }) => visualId),
      ).toEqual([
        'prop.northbar.arrival-manifest',
        'prop.northbar.manifest-carbon',
      ]);
    }
    const preCaptureAdvance = index === 3 ? 2.5 : 0;
    if (preCaptureAdvance > 0) await advance(page, preCaptureAdvance);
    if ([0, 1, 3, 4, 5, 6, 7, 8].includes(index)) {
      await capture(
        page,
        testInfo,
        `shot-${String(index + 1).padStart(2, '0')}`,
      );
    }
    await advance(page, durations[index] + 0.05 - preCaptureAdvance);
  }

  await expect
    .poll(() => snapshot(page).then(({ cinematic }) => cinematic.shotId), {
      timeout: 15_000,
    })
    .toBe('shot.ash-001.junction-arrival');
  const landing = (await snapshot(page)).cinematic;
  expect(landing).toMatchObject({
    state: 'landing',
    landingResult: 'completed',
    destinationReadiness: 'ready',
    committedLandingTransactionId: 'transaction.ash-001.northbar-arrival',
  });
  expect(landing.compositionSubjects).toHaveLength(1);
  await expect
    .poll(() => snapshot(page).then(({ camera }) => camera.transitionProgress))
    .toBe(1);
  await capture(page, testInfo, 'shot-10-junction-arrival');
  await advance(page, 4.9);
  await expect
    .poll(() => snapshot(page).then(({ cinematic }) => cinematic.state))
    .toBe('idle');
  const final = await snapshot(page);
  expect(final.cinematic.lastResult).toBe('completed');
  expect(final.runtimeErrors.count).toBe(0);
  expectClean(diagnostics);
});

test('participant failure travels safely without landing story facts', async ({
  page,
}) => {
  test.setTimeout(30_000);
  const diagnostics = monitor(page);
  await openOpening(page);
  const factsBefore = (await snapshot(page)).missions.runtime.facts;
  await page.evaluate(() =>
    window.__VANTA_TEST__!.setCinematicParticipantAvailable('mack', false),
  );
  await advance(page, 0.1);
  await expect
    .poll(() => snapshot(page).then(({ cinematic }) => cinematic.state), {
      timeout: 15_000,
    })
    .toBe('idle');
  const final = await snapshot(page);
  expect(final.cinematic).toMatchObject({
    lastResult: 'failed',
    committedLandingTransactionId: undefined,
  });
  expect(final.missions.runtime.facts).toEqual(factsBefore);
  expect(final.runtimeErrors.count).toBe(0);
  expectClean(diagnostics);
});

test('cancel and repeat restore ownership and the original grounded pose', async ({
  page,
}) => {
  const diagnostics = monitor(page);
  await openOpening(page);
  expect(await cancel(page)).toBe(true);
  const restored = await snapshot(page);
  for (let run = 0; run < 2; run += 1) {
    expect(await start(page)).toBe(true);
    await advance(page, 1.2);
    expect(await cancel(page)).toBe(true);
    const current = await snapshot(page);
    expect(current.gameState).toBe(restored.gameState);
    expect(current.camera.owner).toBe(restored.camera.owner);
    expect(current.player.position).toEqual(restored.player.position);
  }
  expect((await snapshot(page)).cinematic.playbackSequence).toBe(3);
  expectClean(diagnostics);
});

for (const viewport of [
  { name: 'narrow', width: 390, height: 844 },
  { name: 'ultrawide', width: 2560, height: 1080 },
] as const) {
  test(`${viewport.name} framing keeps actors above the subtitle reserve @visual`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await openOpening(page);
    await advance(page, 5.1);
    const cinematic = (await snapshot(page)).cinematic;
    expect(cinematic.shotId).toBe('shot.ash-001.failed-pickup-two-shot');
    for (const subject of cinematic.compositionSubjects) {
      expect(subject.screenY).toBeLessThanOrEqual(0.66);
      expect(subject.marginPercent).toBeGreaterThanOrEqual(
        viewport.name === 'ultrawide' ? 15 : 8,
      );
    }
    await capture(page, testInfo, `responsive-${viewport.name}`);
  });
}

async function openOpening(page: Page): Promise<void> {
  await page.goto(openingUrl);
  await page.getByTestId('title-start').click();
  await expect
    .poll(() => page.evaluate(() => window.__VANTA_TEST__?.snapshot().ready))
    .toBe(true);
  await expect
    .poll(() => snapshot(page).then(({ cinematic }) => cinematic.state))
    .toBe('playing');
}

function snapshot(page: Page): Promise<BrowserTestSnapshot> {
  return page.evaluate(() => window.__VANTA_TEST__!.snapshot());
}

function advance(page: Page, seconds: number): Promise<void> {
  return page.evaluate(
    (value) => window.__VANTA_TEST__!.advanceCinematic(value),
    seconds,
  );
}

function start(page: Page): Promise<boolean> {
  return page.evaluate(
    (id) => window.__VANTA_TEST__!.startCinematic(id),
    openingId,
  );
}

function cancel(page: Page): Promise<boolean> {
  return page.evaluate(() => window.__VANTA_TEST__!.cancelCinematic());
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let count = 0;
        const next = () => {
          count += 1;
          if (count >= 20) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
  );
  await testInfo.attach(name, {
    body: await page.screenshot({
      path: `docs/screenshots/cinematic-005/${name}.png`,
    }),
    contentType: 'image/png',
  });
}

function monitor(page: Page) {
  const errors: string[] = [];
  const failed: string[] = [];
  const external: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => {
    if (request.method() !== 'HEAD')
      failed.push(`${request.method()} ${request.url()}`);
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      !['blob:', 'data:'].includes(url.protocol) &&
      !['127.0.0.1', 'localhost'].includes(url.hostname)
    )
      external.push(request.url());
  });
  return { errors, failed, external };
}

function expectClean(diagnostics: ReturnType<typeof monitor>) {
  expect(diagnostics.errors).toEqual([]);
  expect(diagnostics.failed).toEqual([]);
  expect(diagnostics.external).toEqual([]);
}
