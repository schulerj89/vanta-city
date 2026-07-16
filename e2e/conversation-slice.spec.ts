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
  expect(picker.picker.registeredCharacterIds).toEqual(['casual', 'punk']);
  expect(picker.picker.preview.requestedCharacterId).toBe('casual');

  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => (await snapshot(page)).picker.focusedCharacterId)
    .toBe('punk');
  await expect
    .poll(async () => (await snapshot(page)).picker.preview.loadedCharacterId)
    .toBe('punk');
  const playerBeforePose = (await snapshot(page)).player.position;
  await page.keyboard.press('Space');
  await expect
    .poll(async () => (await snapshot(page)).picker.preview.animation)
    .not.toBe('previewIdle');
  expect((await snapshot(page)).player.position).toEqual(playerBeforePose);
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('playing');
  await expect
    .poll(async () => {
      const character = (await snapshot(page)).character;
      return character.loadStatus === 'loading'
        ? 'loading'
        : character.loadedDefinitionId;
    })
    .toBe('punk');
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
  expect(
    entered.npcs.snapshots.map(
      ({ definitionId, modelSource, currentAnimation }) => ({
        definitionId,
        modelSource,
        currentAnimation,
      }),
    ),
  ).toEqual([
    { definitionId: 'mack', modelSource: 'asset', currentAnimation: 'idle' },
    { definitionId: 'nox', modelSource: 'asset', currentAnimation: 'idle' },
    { definitionId: 'raze', modelSource: 'asset', currentAnimation: 'idle' },
  ]);

  await command(page, 'player.teleport', 'spawn.npc-mechanic');
  await expect
    .poll(async () => (await snapshot(page)).interaction.activeTargetId)
    .toBe('interaction.npc.mack');
  await expect(page.locator('.interaction-prompt')).toContainText('Talk');
  await page.keyboard.press('g');

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
  expect(
    first.npcs.snapshots.find(({ definitionId }) => definitionId === 'mack'),
  ).toMatchObject({
    lastGestureSource: 'conversation:conversation.mack.introduction',
    lastGestureAccepted: true,
    gestureSequence: 1,
  });
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
      const actions = page.locator('[data-debug-section="Commands / Actions"]');
      await actions.locator('summary').click();
      await actions.getByRole('button', { name: 'Advance dialogue' }).click();
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

test('cancels and repeats Mack dialogue without leaking controls', async ({
  page,
}) => {
  const uncaught: string[] = [];
  const consoleIssues = monitorConsoleIssues(page);
  page.on('pageerror', (error) => uncaught.push(error.message));
  await page.goto('/?e2e=1&debug=1&skipPicker=1');
  await page.waitForFunction(() => window.__VANTA_TEST__ !== undefined);

  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('playing');
  await command(page, 'player.teleport', 'spawn.npc-mechanic');
  await expect
    .poll(async () => (await snapshot(page)).interaction.activeTargetId)
    .toBe('interaction.npc.mack');

  await page.keyboard.press('g');
  await expect
    .poll(async () => (await snapshot(page)).dialogue.session.lineIndex)
    .toBe(0);
  const initial = await snapshot(page);
  expect(['typing', 'ready']).toContain(initial.dialogue.session.state);
  if (initial.dialogue.session.state === 'typing') {
    const revealButton = page.getByRole('button', {
      name: 'Reveal full dialogue line',
    });
    await expect(revealButton).toBeVisible();
    // The first line is intentionally short. Activate the observed reveal
    // control in the same browser task so natural completion cannot turn this
    // synchronization assertion into an unintended advance.
    await revealButton.evaluate((button: HTMLButtonElement) => button.click());
  }
  await expect
    .poll(async () => (await snapshot(page)).dialogue.session.state)
    .toBe('ready');
  expect((await snapshot(page)).dialogue.session.lineIndex).toBe(0);
  await expect(
    page.getByRole('button', { name: 'Cancel dialogue' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Continue dialogue' }).click();
  await expect
    .poll(async () => (await snapshot(page)).dialogue.session.lineIndex)
    .toBe(1);
  // The control activation must not also enter the global Mouse0 binding and
  // advance past the newly entered line on the next frame.
  expect(['typing', 'ready']).toContain(
    (await snapshot(page)).dialogue.session.state,
  );

  await page.getByRole('button', { name: 'Cancel dialogue' }).click();
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
  const cancelled = await snapshot(page);
  expect(cancelled.dialogue.cancelledConversationIds).toContain(
    'conversation.mack.introduction',
  );

  await page.keyboard.press('g');
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('dialogue');
  const repeated = await snapshot(page);
  expect(repeated.dialogue.session).toMatchObject({
    lineIndex: 0,
    speakerId: 'mack',
  });
  expect(['typing', 'ready']).toContain(repeated.dialogue.session.state);
  expect(repeated.camera.owner).toBe('dialogue:conversation.mack.introduction');

  await page.keyboard.press('Escape');
  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('playing');
  const before = (await snapshot(page)).player.position;
  await page.keyboard.down('w');
  await expect
    .poll(async () =>
      horizontalDistance((await snapshot(page)).player.position, before),
    )
    .toBeGreaterThan(0.2);
  await page.keyboard.up('w');

  const restored = await snapshot(page);
  expect(restored.runtimeErrors.count, restored.runtimeErrors.last).toBe(0);
  expect(uncaught).toEqual([]);
  expect(
    consoleIssues.filter(({ text }) => !isKnownBrowserDiagnostic(text)),
    formatConsoleIssues(consoleIssues),
  ).toEqual([]);
});

test('no-dialogue NPCs never acquire dialogue, camera, or input ownership', async ({
  page,
}) => {
  const uncaught: string[] = [];
  const consoleIssues = monitorConsoleIssues(page);
  page.on('pageerror', (error) => uncaught.push(error.message));
  await page.goto('/?e2e=1&debug=1&skipPicker=1');
  await page.waitForFunction(() => window.__VANTA_TEST__ !== undefined);

  for (const npc of [
    { id: 'nox', spawnId: 'spawn.npc-alley' },
    { id: 'raze', spawnId: 'spawn.npc-deck' },
  ]) {
    await command(page, 'player.teleport', npc.spawnId);
    await expect
      .poll(async () => (await snapshot(page)).interaction.activeTargetId)
      .toBe(`interaction.npc.${npc.id}`);
    await page.keyboard.press('g');
    await page.waitForTimeout(100);

    const state = await snapshot(page);
    expect(state.gameState).toBe('playing');
    expect(state.conversation).toEqual({
      npcId: undefined,
      conversationId: undefined,
    });
    expect(state.dialogue.session.state).toBe('idle');
    expect(state.dialogue.ui.visible).toBe(false);
    expect(state.camera).toMatchObject({
      mode: 'gameplay',
      owner: 'gameplay',
    });
    expect(state.interaction.activeTargetId).toBe(`interaction.npc.${npc.id}`);
  }

  await command(page, 'player.teleport', 'spawn.player-default');
  const before = (await snapshot(page)).player.position;
  await page.keyboard.down('w');
  await expect
    .poll(async () =>
      horizontalDistance((await snapshot(page)).player.position, before),
    )
    .toBeGreaterThan(0.2);
  await page.keyboard.up('w');

  const restored = await snapshot(page);
  expect(restored.runtimeErrors.count, restored.runtimeErrors.last).toBe(0);
  expect(uncaught).toEqual([]);
  expect(
    consoleIssues.filter(({ text }) => !isKnownBrowserDiagnostic(text)),
    formatConsoleIssues(consoleIssues),
  ).toEqual([]);
});

test('dialogue panel remains stable while text and speakers change responsively', async ({
  page,
}) => {
  const consoleIssues = monitorConsoleIssues(page);
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
    { width: 568, height: 320 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/?e2e=1&skipPicker=1');
    await page.waitForFunction(() => window.__VANTA_TEST__ !== undefined);
    await command(page, 'dialogue.set-typewriter', 'on');
    await command(page, 'dialogue.start-mack');
    await expect
      .poll(async () => (await snapshot(page)).dialogue.session.lineIndex)
      .toBe(0);
    await expect(page.getByTestId('dialogue-box')).toBeVisible();

    const layouts = [await dialogueLayout(page)];
    await command(page, 'dialogue.set-typewriter', 'off');
    await expect
      .poll(async () => (await snapshot(page)).dialogue.session.state)
      .toBe('ready');
    layouts.push(await dialogueLayout(page));

    for (let lineIndex = 1; lineIndex < 4; lineIndex += 1) {
      await command(page, 'dialogue.advance');
      await expect
        .poll(async () => (await snapshot(page)).dialogue.session.lineIndex)
        .toBe(lineIndex);
      layouts.push(await dialogueLayout(page));
    }

    const baseline = layouts[0];
    for (const layout of layouts) {
      expect(layout.top).toBeCloseTo(baseline.top, 0);
      expect(layout.height).toBeCloseTo(baseline.height, 0);
      expect(layout.top).toBeGreaterThanOrEqual(0);
      expect(layout.bottom).toBeLessThanOrEqual(viewport.height);
      expect(layout.textScrollHeight).toBeLessThanOrEqual(
        layout.textClientHeight + 1,
      );
    }
  }
  expect(
    consoleIssues.filter(({ text }) => !isKnownBrowserDiagnostic(text)),
    formatConsoleIssues(consoleIssues),
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

async function dialogueLayout(page: Page): Promise<{
  readonly top: number;
  readonly bottom: number;
  readonly height: number;
  readonly textClientHeight: number;
  readonly textScrollHeight: number;
}> {
  return page.getByTestId('dialogue-box').evaluate((panel) => {
    const text = panel.querySelector<HTMLElement>(
      '[data-testid="dialogue-text"]',
    );
    if (!text) throw new Error('Dialogue text element unavailable');
    const bounds = panel.getBoundingClientRect();
    return {
      top: bounds.top,
      bottom: bounds.bottom,
      height: bounds.height,
      textClientHeight: text.clientHeight,
      textScrollHeight: text.scrollHeight,
    };
  });
}
