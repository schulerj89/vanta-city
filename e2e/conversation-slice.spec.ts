import { expect, test } from '@playwright/test';
import type { ConsoleMessage, Page } from '@playwright/test';
import type {
  BrowserTestApi,
  BrowserTestSnapshot,
} from '../src/debug/BrowserTestBridge';

test('character picker through repeatable Mack conversation', async ({
  page,
}) => {
  const uncaught: string[] = [];
  const consoleIssues = monitorConsoleIssues(page);
  page.on('pageerror', (error) => uncaught.push(error.message));
  await page.goto('/?e2e=1&debug=1&dialogueTypewriter=0');
  await page.waitForFunction(() => window.__VANTA_TEST__ !== undefined);

  await expect.poll(async () => (await snapshot(page)).picker.open).toBe(true);
  await expect
    .poll(async () => {
      const pickerState = (await snapshot(page)).picker;
      return (
        pickerState.availableCharacterIds.length +
        pickerState.fallbackCharacterIds.length
      );
    })
    .toBeGreaterThanOrEqual(2);
  const picker = await snapshot(page);
  expect(picker.gameState).toBe('character-select');
  expect(picker.picker.registeredCharacterIds.length).toBeGreaterThan(0);

  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => (await snapshot(page)).picker.focusedCharacterId)
    .toBe('punk');
  await page.keyboard.press('Space');
  await expect
    .poll(async () => (await snapshot(page)).picker.selectedCharacterId)
    .toBe('punk');
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('playing');
  await expect
    .poll(async () => (await snapshot(page)).character.source)
    .not.toBe('loading');
  const entered = await snapshot(page);
  expect(entered.selectedCharacterId).toBe('punk');
  expect(entered.character.loadedDefinitionId).toBe('punk');
  expect(entered.character.source).toBe('asset');
  expect(entered.character.bounds).toBeDefined();
  expect(
    entered.character.bounds!.max.y - entered.character.bounds!.min.y,
  ).toBeLessThanOrEqual(1.82);
  expect(
    Math.abs(entered.character.bounds!.min.y - entered.player.position.y),
  ).toBeLessThanOrEqual(0.2);
  expect(picker.picker.availableCharacterIds).toEqual(
    expect.arrayContaining(['casual', 'punk']),
  );
  expect(entered.player.grounded).toBe(true);
  expect(entered.world.levelId).toBe('test-district');
  expect(
    entered.npcs.snapshots.some(({ definitionId }) => definitionId === 'mack'),
  ).toBe(true);

  await command(page, 'player.teleport', 'spawn.npc-mechanic');
  await expect
    .poll(async () => (await snapshot(page)).interaction.activeTargetId)
    .toBe('interaction.npc.mack');
  await expect(page.locator('.interaction-prompt')).toContainText('Talk');
  await page.keyboard.press('e');

  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('dialogue');
  await expect
    .poll(async () => (await snapshot(page)).camera.mode)
    .toBe('conversation');
  const first = await snapshot(page);
  expect(first.conversation).toEqual({
    npcId: 'mack',
    conversationId: 'conversation.mack.introduction',
  });
  expect(first.camera.owner).toBe('dialogue:conversation.mack.introduction');
  expect(first.dialogue.ui).toMatchObject({
    visible: true,
    speakerName: 'Mack',
    renderedText: 'You’re late.',
  });
  await expect(page.getByTestId('dialogue-box')).toBeVisible();
  await expect(page.locator('.dialogue-box__portrait')).toBeVisible();

  const expected = [
    ['mack', 'You’re late.'],
    ['rook', 'Your nephew was supposed to meet me.'],
    ['mack', 'Then he’s later.'],
    [
      'mack',
      'Walk around the block. If anyone follows you, don’t bring them back here.',
    ],
  ] as const;
  for (let index = 0; index < expected.length; index += 1) {
    const [speakerId, text] = expected[index];
    await expect
      .poll(async () => (await snapshot(page)).dialogue.session.lineIndex)
      .toBe(index);
    const state = await snapshot(page);
    expect(state.dialogue.session.speakerId).toBe(speakerId);
    expect(state.dialogue.ui.renderedText).toBe(text);
    if (speakerId === 'rook') {
      expect(state.dialogue.ui.speakerName).toBe('Rook');
      expect(state.dialogue.ui.portraitResolution).toMatch(
        /player-identity|image-error/,
      );
    }
    if (index === expected.length - 1) {
      await page.getByRole('button', { name: 'Advance dialogue' }).click();
    } else {
      await page.keyboard.press('Enter');
    }
  }

  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('playing');
  await expect
    .poll(async () => (await snapshot(page)).camera.owner)
    .toBe('gameplay');
  await expect
    .poll(async () => (await snapshot(page)).camera.transitionProgress)
    .toBe(1);
  await expect
    .poll(async () => (await snapshot(page)).interaction.activeTargetId)
    .toBe('interaction.npc.mack');

  await command(page, 'player.teleport', 'spawn.player-default');
  const before = (await snapshot(page)).player.position;
  await page.keyboard.down('w');
  await expect
    .poll(async () =>
      horizontalDistance((await snapshot(page)).player.position, before),
    )
    .toBeGreaterThan(0.25);
  await page.keyboard.up('w');
  const completed = await snapshot(page);
  expect(completed.dialogue.completedConversationIds).toContain(
    'conversation.mack.introduction',
  );
  expect(completed.runtimeErrors.count, completed.runtimeErrors.last).toBe(0);
  expect(uncaught).toEqual([]);
  expect(
    consoleIssues.filter(({ text }) =>
      /unexpected token ['"]?<['"]?|gltfloader|not valid json|<!doctype/i.test(
        text,
      ),
    ),
    `asset URLs must never send HTML into the model loader:\n${formatConsoleIssues(consoleIssues)}`,
  ).toEqual([]);
  expect(
    consoleIssues.filter(({ text }) => !isKnownBrowserDiagnostic(text)),
    `fallbacks must be represented by test state instead of console warnings:\n${formatConsoleIssues(consoleIssues)}`,
  ).toEqual([]);
});

interface BrowserConsoleIssue {
  readonly type: 'warning' | 'error';
  readonly text: string;
}

function monitorConsoleIssues(page: Page): BrowserConsoleIssue[] {
  const issues: BrowserConsoleIssue[] = [];
  page.on('console', (message: ConsoleMessage) => {
    const type = message.type();
    if (type !== 'warning' && type !== 'error') return;
    issues.push({ type, text: message.text() });
  });
  return issues;
}

function formatConsoleIssues(issues: readonly BrowserConsoleIssue[]): string {
  return issues.length === 0
    ? 'no console warnings or errors'
    : issues.map(({ type, text }) => `${type}: ${text}`).join('\n');
}

function isKnownBrowserDiagnostic(text: string): boolean {
  // Chromium's software WebGL backend reports this performance diagnostic
  // when Playwright records screenshots/video. It is not emitted by the app.
  return /^\[\.WebGL-[^\]]+\]GL Driver Message .*GPU stall due to ReadPixels/.test(
    text,
  );
}

async function snapshot(page: Page): Promise<BrowserTestSnapshot> {
  return page.evaluate(() => {
    if (!window.__VANTA_TEST__)
      throw new Error('Browser test bridge unavailable');
    return window.__VANTA_TEST__.snapshot();
  });
}

async function command(
  page: Page,
  id: string,
  argument?: string,
): Promise<void> {
  await page.evaluate(
    async ({ id, argument }) => {
      const api: BrowserTestApi | undefined = window.__VANTA_TEST__;
      if (!api) throw new Error('Browser test bridge unavailable');
      await api.executeDebugCommand(id, argument);
    },
    { id, argument },
  );
}

function horizontalDistance(
  a: { readonly x: number; readonly z: number },
  b: { readonly x: number; readonly z: number },
): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
