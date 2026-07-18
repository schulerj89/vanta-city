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
  await page.goto('/?e2e=1&debug=1&dialogueTypewriter=0&npcFixtures=1');
  await page.waitForFunction(() => window.__VANTA_TEST__ !== undefined);

  await command(page, 'ui.open-character-picker');
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

  await command(page, 'player.teleport', 'spawn.player-talk-mack');
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
      const dialogue = page.locator(
        '[data-debug-section="Dialogue / Conversation"]',
      );
      await dialogue.locator('summary').click();
      await dialogue.getByRole('button', { name: 'Advance dialogue' }).click();
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
  await page.goto('/?e2e=1&debug=1&skipPicker=1&npcFixtures=1');
  await page.waitForFunction(() => window.__VANTA_TEST__ !== undefined);

  await expect
    .poll(async () => (await snapshot(page)).gameState)
    .toBe('playing');
  await command(page, 'player.teleport', 'spawn.player-talk-mack');
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
    // The first line is intentionally short. Activate the observed reveal
    // control when it still exists. Natural completion may remove it between
    // the state snapshot and this DOM task, which is already the desired state.
    await page.evaluate(() =>
      document
        .querySelector<HTMLButtonElement>(
          '[data-testid="dialogue-continue"][aria-label="Reveal full dialogue line"]',
        )
        ?.click(),
    );
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

test('Nox and Raze complete and repeat their registered Talk conversations', async ({
  page,
}) => {
  const uncaught: string[] = [];
  const consoleIssues = monitorConsoleIssues(page);
  page.on('pageerror', (error) => uncaught.push(error.message));
  await page.goto(
    '/?e2e=1&debug=1&skipPicker=1&dialogueTypewriter=0&npcFixtures=1',
  );
  await page.waitForFunction(() => window.__VANTA_TEST__ !== undefined);

  for (const npc of [
    {
      id: 'nox',
      displayName: 'Nox',
      spawnId: 'spawn.player-talk-nox',
      conversationId: 'conversation.nox.check-in',
      text: 'Alley’s clear. Keep moving.',
    },
    {
      id: 'raze',
      displayName: 'Raze',
      spawnId: 'spawn.player-talk-raze',
      conversationId: 'conversation.raze.check-in',
      text: 'Deck’s quiet. Don’t make it loud.',
    },
  ]) {
    await command(page, 'player.teleport', npc.spawnId);
    await expect
      .poll(async () => (await snapshot(page)).interaction.activeTargetId)
      .toBe(`interaction.npc.${npc.id}`);
    await expect(page.locator('.interaction-prompt')).toContainText('Talk');
    await page.keyboard.press('g');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('dialogue');

    const talking = await snapshot(page);
    expect(talking.conversation).toEqual({
      npcId: npc.id,
      conversationId: npc.conversationId,
    });
    expect(talking.dialogue.session).toMatchObject({
      state: 'ready',
      conversationId: npc.conversationId,
      lineIndex: 0,
      speakerId: npc.id,
      fullText: npc.text,
    });
    expect(talking.dialogue.ui).toMatchObject({
      visible: true,
      speakerName: npc.displayName,
      renderedText: npc.text,
    });
    expect([
      'image:speaker',
      'fallback:speaker-fallback',
      'fallback:image-error',
    ]).toContain(talking.dialogue.ui.portraitResolution);
    expect(talking.camera).toMatchObject({
      mode: 'conversation',
      owner: `dialogue:${npc.conversationId}`,
    });

    await page.getByRole('button', { name: 'Continue dialogue' }).click();
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
      .toBe(`interaction.npc.${npc.id}`);

    // The generic NPC Talk registration remains repeatable after completion.
    await page.keyboard.press('g');
    await expect
      .poll(async () => (await snapshot(page)).conversation.conversationId)
      .toBe(npc.conversationId);
    await page.keyboard.press('Escape');
    await expect
      .poll(async () => (await snapshot(page)).gameState)
      .toBe('playing');
    await expect
      .poll(async () => (await snapshot(page)).interaction.activeTargetId)
      .toBe(`interaction.npc.${npc.id}`);
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
  expect(restored.dialogue.completedConversationIds).toEqual(
    expect.arrayContaining([
      'conversation.nox.check-in',
      'conversation.raze.check-in',
    ]),
  );
  expect(restored.runtimeErrors.count, restored.runtimeErrors.last).toBe(0);
  expect(uncaught).toEqual([]);
  expect(
    consoleIssues.filter(({ text }) => !isKnownBrowserDiagnostic(text)),
    formatConsoleIssues(consoleIssues),
  ).toEqual([]);
});

test('dialogue panel remains stable and portraits stay clear responsively', async ({
  page,
}, testInfo) => {
  const consoleIssues = monitorConsoleIssues(page);
  for (const presentation of [
    { name: 'desktop-casual', width: 1280, height: 720, character: 'casual' },
    { name: 'mobile-punk', width: 390, height: 844, character: 'punk' },
    {
      name: 'short-landscape-casual',
      width: 568,
      height: 320,
      character: 'casual',
    },
  ]) {
    await page.setViewportSize({
      width: presentation.width,
      height: presentation.height,
    });
    await page.goto('/?e2e=1&skipPicker=1&npcFixtures=1');
    await page.waitForFunction(() => window.__VANTA_TEST__ !== undefined);
    await command(page, 'player.select-character', presentation.character);
    await command(page, 'player.teleport-position', '-11.5,0.2,5.5,0.785');
    await command(page, 'dialogue.set-typewriter', 'on');
    await command(page, 'dialogue.start-mack');
    await expect
      .poll(async () => (await snapshot(page)).dialogue.session.lineIndex)
      .toBe(0);
    await expect
      .poll(async () => (await snapshot(page)).camera.transitionProgress)
      .toBe(1);
    await expect(page.getByTestId('dialogue-box')).toBeVisible();
    await expect(
      page.getByRole('img', { name: 'Mack portrait fallback' }),
    ).toBeVisible();

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
      if (lineIndex === 1) {
        await expect(
          page.getByRole('img', { name: 'Rook portrait fallback' }),
        ).toBeVisible();
        await expect(
          page.locator('.dialogue-box__portrait-fallback'),
        ).toHaveText(presentation.character === 'punk' ? 'P' : 'C');
      }
      layouts.push(await dialogueLayout(page));
    }

    const baseline = layouts[0];
    for (const layout of layouts) {
      expect(layout.top).toBeCloseTo(baseline.top, 0);
      expect(layout.height).toBeCloseTo(baseline.height, 0);
      expect(layout.top).toBeGreaterThanOrEqual(0);
      expect(layout.bottom).toBeLessThanOrEqual(presentation.height);
      expect(layout.textScrollHeight).toBeLessThanOrEqual(
        layout.textClientHeight + 1,
      );
    }
    if (presentation.name === 'short-landscape-casual') {
      expect(baseline.height).toBeLessThanOrEqual(144);
      expect(baseline.top).toBeGreaterThanOrEqual(168);
    }
    await page.screenshot({
      path: testInfo.outputPath(`${presentation.name}.png`),
      fullPage: true,
    });
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
