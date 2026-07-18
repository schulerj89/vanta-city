import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type {
  UiCompositionLabApi,
  UiLabBackground,
  UiLabState,
} from '../src/sandbox/scenarios/uiCompositionLab';
import { uiCompositionPresentationFixtures } from '../src/sandbox/scenarios/uiCompositionFixtures';

async function openLab(
  page: Page,
  options: {
    state: UiLabState;
    background: UiLabBackground;
    extra?: string;
  },
): Promise<void> {
  await page.goto(
    `/?sandbox=ui-composition-lab&uiState=${options.state}&uiBackground=${options.background}&labPanel=0${options.extra ?? ''}`,
  );
  await expect
    .poll(() => page.evaluate(() => window.__VANTA_UI_LAB__?.snapshot().state))
    .toBe(options.state);
}

test.describe('Ashfall UI composition lab', () => {
  test('exposes deterministic supported and unavailable fixtures', async ({
    page,
  }) => {
    expect(uiCompositionPresentationFixtures.exploration.supported).toBe(true);
    expect(uiCompositionPresentationFixtures['mission-update']).toMatchObject({
      supported: true,
    });
    await openLab(page, { state: 'exploration', background: 'bright' });
    await expect(page.locator('[data-ui-zone]')).toHaveCount(10);
    await expect(page.getByLabel('Player status')).toBeVisible();
    await expect(page.getByLabel('Current location')).toBeVisible();
    const prompt = page.locator('.interaction-prompt');
    await expect(prompt).toHaveAttribute('role', 'status');
    await expect(prompt).toContainText('Inspect signal controller');

    await page.evaluate(() =>
      window.__VANTA_UI_LAB__?.apply({ state: 'mission-update' }),
    );
    await expect(page.getByLabel('Current mission objective')).toBeVisible();
    await expect(page.getByText('Walk the Block')).toBeVisible();
    await expect(page.getByText('OBJECTIVE UPDATED')).toBeVisible();
    const snapshot = await page.evaluate(() =>
      window.__VANTA_UI_LAB__?.snapshot(),
    );
    expect(snapshot?.unavailableReason).toBeUndefined();
  });

  for (const sample of [
    {
      name: 'exploration-bright-desktop',
      state: 'exploration',
      background: 'bright',
    },
    { name: 'combat-noisy-desktop', state: 'combat', background: 'noisy' },
    { name: 'dialogue-dark-desktop', state: 'dialogue', background: 'dark' },
    {
      name: 'restoration-ultrawide',
      state: 'restoration',
      background: 'noisy',
      viewport: { width: 1920, height: 800 },
    },
    {
      name: 'exploration-narrow-large-safe',
      state: 'exploration',
      background: 'bright',
      viewport: { width: 390, height: 844 },
      extra: '&uiText=large&uiSafeArea=1&uiMotion=reduced',
    },
    {
      name: 'mission-update-dark-desktop',
      state: 'mission-update',
      background: 'dark',
    },
    {
      name: 'mission-update-narrow-large-safe',
      state: 'mission-update',
      background: 'noisy',
      viewport: { width: 390, height: 844 },
      extra: '&uiText=large&uiSafeArea=1&uiMotion=reduced',
    },
    {
      name: 'mission-update-ultrawide',
      state: 'mission-update',
      background: 'bright',
      viewport: { width: 1920, height: 800 },
    },
  ] as const) {
    test(`${sample.name} @visual`, async ({ page }) => {
      if ('viewport' in sample && sample.viewport)
        await page.setViewportSize(sample.viewport);
      await openLab(page, {
        state: sample.state,
        background: sample.background,
        extra: 'extra' in sample ? sample.extra : undefined,
      });
      await expect(page).toHaveScreenshot(`${sample.name}.png`, {
        animations: 'disabled',
        maxDiffPixelRatio: 0.012,
      });
    });
  }

  test('keeps keyboard focus visible and console clean', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(
      '/?sandbox=ui-composition-lab&uiState=dialogue&uiBackground=noisy',
    );
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus-visible');
    await expect(focused).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('keeps visible fixtures inside simulated safe area without collisions', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openLab(page, {
      state: 'exploration',
      background: 'bright',
      extra: '&uiText=large&uiSafeArea=1&uiMotion=reduced&labPanel=0',
    });
    const geometry = await page.evaluate(() => {
      const visible = Array.from(
        document.querySelectorAll<HTMLElement>('.ui-zone > *'),
      )
        .filter((element) => {
          const style = getComputedStyle(element);
          return (
            style.display !== 'none' && element.getClientRects().length > 0
          );
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            name: element.className,
            rect: {
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              left: rect.left,
            },
          };
        });
      const overlaps: string[] = [];
      for (let left = 0; left < visible.length; left += 1) {
        for (let right = left + 1; right < visible.length; right += 1) {
          const a = visible[left];
          const b = visible[right];
          if (
            Math.min(a.rect.right, b.rect.right) >
              Math.max(a.rect.left, b.rect.left) &&
            Math.min(a.rect.bottom, b.rect.bottom) >
              Math.max(a.rect.top, b.rect.top)
          ) {
            overlaps.push(`${a.name} / ${b.name}`);
          }
        }
      }
      return { visible, overlaps };
    });
    expect(geometry.overlaps).toEqual([]);
    for (const { rect } of geometry.visible) {
      expect(rect.left).toBeGreaterThanOrEqual(47);
      expect(rect.right).toBeLessThanOrEqual(343);
      expect(rect.top).toBeGreaterThanOrEqual(47);
      expect(rect.bottom).toBeLessThanOrEqual(797);
    }
    await expect(page.getByLabel('Current location')).toBeVisible();
    await expect(page.locator('.interaction-prompt')).toHaveCSS(
      'transition-duration',
      '0s',
    );
  });
});

declare global {
  interface Window {
    __VANTA_UI_LAB__?: UiCompositionLabApi;
  }
}
