import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type {
  BrowserTestApi,
  BrowserTestSnapshot,
} from '../src/debug/BrowserTestBridge';

const appUrl =
  '/?e2e=1&debug=1&skipPicker=1&dialogueTypewriter=0&interactionScenario=1';

test.beforeEach(async ({ page }) => {
  await page.goto(appUrl);
  await page.waitForFunction(() => window.__VANTA_TEST__ !== undefined);
  await command(page, 'player.teleport', 'spawn.debug-interactions');
  await expect
    .poll(async () => (await snapshot(page)).interaction.activeTargetId)
    .toBe('interaction.debug.anchor');
});

test('keeps a stable candidate until a decisive challenger wins', async ({
  page,
}) => {
  const initial = (await snapshot(page)).interaction.diagnostics;
  expect(initial.selectedId).toBe('interaction.debug.anchor');
  expect(initial.candidates.map(({ target }) => target.id)).toContain(
    'interaction.debug.challenger',
  );
  expect(
    initial.targets.find(({ id }) => id === 'interaction.debug.occluded'),
  ).toMatchObject({
    lineOfSight: 'blocked',
    rejectionReason: 'occluded',
    blockerId: 'c.debug-interaction-occluded',
  });

  await command(page, 'interaction-scenario.challenge');
  await expect
    .poll(async () => (await snapshot(page)).interaction.activeTargetId)
    .toBe('interaction.debug.challenger');
  const switched = (await snapshot(page)).interaction.diagnostics;
  expect(['switched', 'selected-best']).toContain(switched.selectionDecision);
  expect(switched.candidates[0]?.target.id).toBe(
    'interaction.debug.challenger',
  );
  expect((await snapshot(page)).runtimeErrors.count).toBe(0);
});

test('removes an obstructed prompt target and keeps repeat input healthy', async ({
  page,
}) => {
  await toggle(page, 'interaction-scenario.obstruct-selected', true);
  await expect
    .poll(async () => (await snapshot(page)).interaction.activeTargetId)
    .toBe('interaction.debug.challenger');
  const blocked = (await snapshot(page)).interaction.diagnostics;
  expect(
    blocked.targets.find(({ id }) => id === 'interaction.debug.anchor'),
  ).toMatchObject({
    rejectionReason: 'occluded',
    blockerId: 'c.debug-interaction-selected',
  });
  await expect(page.locator('.interaction-prompt')).toContainText(
    'Use challenger',
  );

  await page.keyboard.press('g');
  await expect
    .poll(async () =>
      page
        .locator('[data-debug-value="interaction-scenario.activations"]')
        .textContent(),
    )
    .toContain('1');
  await page.keyboard.press('g');
  await expect
    .poll(async () =>
      page
        .locator('[data-debug-value="interaction-scenario.activations"]')
        .textContent(),
    )
    .toContain('2');
  expect((await snapshot(page)).runtimeErrors.count).toBe(0);
});

async function snapshot(page: Page): Promise<BrowserTestSnapshot> {
  return page.evaluate(() => window.__VANTA_TEST__!.snapshot());
}

async function command(
  page: Page,
  id: string,
  argument?: string,
): Promise<void> {
  await page.evaluate(
    async ({ commandId, commandArgument }) => {
      await window.__VANTA_TEST__!.executeDebugCommand(
        commandId,
        commandArgument,
      );
    },
    { commandId: id, commandArgument: argument },
  );
}

async function toggle(page: Page, id: string, enabled: boolean): Promise<void> {
  await page.evaluate(
    ({ toggleId, value }) =>
      window.__VANTA_TEST__!.setDebugToggle(toggleId, value),
    { toggleId: id, value: enabled },
  );
}

declare global {
  interface Window {
    __VANTA_TEST__?: BrowserTestApi;
  }
}
