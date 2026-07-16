import { AssetCatalog } from '../src/assets/AssetCatalog';
import type {
  CharacterAvailabilityProbe,
  CharacterAvailabilityResult,
} from '../src/characters/CharacterAvailability';
import { ManifestCharacterAvailabilityProbe } from '../src/characters/CharacterAvailability';
import type { CharacterDefinition } from '../src/characters/CharacterDefinition';
import type {
  CharacterPreviewSnapshot,
  CharacterPreviewSurface,
} from '../src/characters/CharacterPreviewSystem';
import { CharacterSelectionStore } from '../src/characters/CharacterSelection';
import { EventBus } from '../src/core/events';
import { GameStateMachine } from '../src/core/gameState';
import type { StateEvents } from '../src/core/gameState';
import type { InputReader } from '../src/input/InputSystem';
import { CharacterPickerSystem } from '../src/ui/CharacterPickerSystem';

const definitions = [
  { id: 'first', displayName: 'First Resident', fallback: 'placeholder' },
  { id: 'second', displayName: 'Second Resident', fallback: 'placeholder' },
] as const satisfies readonly CharacterDefinition[];

class FakePreview implements CharacterPreviewSurface {
  public readonly element = document.createElement('div');
  public readonly shown: string[] = [];
  private snapshot: CharacterPreviewSnapshot = {
    status: 'idle',
    requestedCharacterId: undefined,
    loadedCharacterId: undefined,
    source: 'none',
    animation: 'previewIdle',
    availableAnimations: ['previewIdle', 'wave', 'interact'],
    disposalCount: 0,
  };

  public async show(definition: CharacterDefinition): Promise<void> {
    this.shown.push(definition.id);
    this.snapshot = {
      ...this.snapshot,
      status: 'ready',
      requestedCharacterId: definition.id,
      loadedCharacterId: definition.id,
      source: 'asset',
    };
  }

  public update(): void {}

  public nextAnimation(): boolean {
    const current = this.snapshot.availableAnimations.indexOf(
      this.snapshot.animation,
    );
    const animation =
      this.snapshot.availableAnimations[
        (current + 1) % this.snapshot.availableAnimations.length
      ]!;
    this.snapshot = { ...this.snapshot, animation };
    return true;
  }

  public clear(): void {
    this.snapshot = {
      ...this.snapshot,
      status: 'idle',
      loadedCharacterId: undefined,
      source: 'none',
      disposalCount: this.snapshot.disposalCount + 1,
    };
  }

  public getSnapshot(): CharacterPreviewSnapshot {
    return this.snapshot;
  }

  public dispose(): void {
    this.clear();
    this.element.remove();
  }
}

describe('CharacterPickerSystem', () => {
  it('excludes internal load fixtures from the choice surface', async () => {
    const entries = [
      ...definitions,
      {
        id: 'internal-fixture',
        displayName: 'Internal fixture',
        pickerVisible: false,
        fallback: 'placeholder',
      },
    ] as const satisfies readonly CharacterDefinition[];
    const harness = createHarness(
      {
        first: { status: 'available' },
        second: { status: 'available' },
      },
      entries,
    );
    harness.picker.open();
    await waitForAvailability(harness.picker, 2);

    expect(harness.picker.getSnapshot().registeredCharacterIds).toEqual([
      'first',
      'second',
    ]);
    expect(
      harness.mount.querySelectorAll('[data-action="character"]'),
    ).toHaveLength(0);
    harness.dispose();
  });

  it('renders one focused preview and exposes unavailable state', async () => {
    const harness = createHarness({
      first: { status: 'available' },
      second: { status: 'unavailable', reason: 'Model missing.' },
    });
    harness.picker.open();

    await vi.waitFor(() => {
      expect(harness.picker.getSnapshot().unavailableCharacterIds).toEqual([
        'second',
      ]);
    });
    expect(harness.picker.getSnapshot()).toMatchObject({
      open: true,
      registeredCharacterIds: ['first', 'second'],
      availableCharacterIds: ['first'],
      selectedCharacterId: 'first',
      confirmedCharacterId: 'first',
      previewState: 'ready',
    });
    expect(
      harness.mount.querySelectorAll('[data-action="character"]'),
    ).toHaveLength(0);
    expect(
      harness.mount.querySelectorAll('[data-character-preview-canvas]'),
    ).toHaveLength(0);
    expect(
      harness.mount.querySelectorAll('.character-picker__preview'),
    ).toHaveLength(1);
    harness.dispose();
  });

  it('uses named keyboard actions and commits only on confirmation', async () => {
    const harness = createHarness({
      first: { status: 'available' },
      second: { status: 'available' },
    });
    harness.picker.open();
    await waitForAvailability(harness.picker, 2);

    harness.press('pickerNext');
    expect(harness.picker.getSnapshot().focusedCharacterId).toBe('second');
    expect(harness.picker.getSnapshot().selectedCharacterId).toBe('second');
    expect(harness.selection.getSelectedId()).toBe('first');
    const beforePose = harness.picker.getSnapshot().preview.animation;
    harness.press('pickerSelect');
    expect(harness.picker.getSnapshot().preview.animation).not.toBe(beforePose);
    expect(harness.selection.getSelectedId()).toBe('first');
    harness.press('pickerConfirm');

    expect(harness.selection.getSelectedId()).toBe('second');
    expect(harness.picker.getSnapshot()).toMatchObject({
      open: false,
      confirmedCharacterId: 'second',
    });
    expect(harness.state.current).toBe('playing');
    harness.dispose();
  });

  it('keeps explicit model fallbacks selectable without calling them available', async () => {
    const harness = createHarness({
      first: { status: 'available' },
      second: {
        status: 'fallback',
        reason: 'Model missing; placeholder fallback will be used.',
      },
    });
    harness.picker.open();
    await vi.waitFor(() => {
      expect(harness.picker.getSnapshot().fallbackCharacterIds).toEqual([
        'second',
      ]);
    });

    expect(harness.picker.getSnapshot().availableCharacterIds).toEqual([
      'first',
    ]);
    harness.picker.next();
    await vi.waitFor(() => {
      expect(harness.picker.getSnapshot().previewState).toBe('fallback');
    });
    expect(harness.picker.getSnapshot()).toMatchObject({
      selectedCharacterId: 'second',
      previewState: 'fallback',
    });
    expect(
      harness.mount.querySelector('[data-picker-preview-status]')?.textContent,
    ).toContain('placeholder fallback');
    harness.picker.confirm();
    expect(harness.selection.getSelectedId()).toBe('second');
    harness.dispose();
  });

  it('supports mouse arrows, cancellation, and reopening without recreating state', async () => {
    const harness = createHarness({
      first: { status: 'available' },
      second: { status: 'available' },
    });
    harness.picker.open();
    await waitForAvailability(harness.picker, 2);

    harness.mount
      .querySelector<HTMLButtonElement>('button[data-action="next"]')
      ?.click();
    expect(harness.picker.getSnapshot().selectedCharacterId).toBe('second');
    harness.picker.cancel();
    expect(harness.selection.getSelectedId()).toBe('first');

    harness.picker.open();
    expect(harness.picker.getSnapshot()).toMatchObject({
      selectedCharacterId: 'first',
      confirmedCharacterId: 'first',
    });
    harness.dispose();
  });

  it('cycles only the two visible definitions in both directions', async () => {
    const harness = createHarness({
      first: { status: 'available' },
      second: { status: 'available' },
    });
    harness.picker.open();
    await waitForAvailability(harness.picker, 2);

    harness.picker.previous();
    expect(harness.picker.getSnapshot().selectedCharacterId).toBe('second');
    harness.picker.next();
    expect(harness.picker.getSnapshot().selectedCharacterId).toBe('first');
    expect(harness.preview.shown).toEqual(
      expect.arrayContaining(['first', 'second']),
    );
    harness.dispose();
  });
});

describe('ManifestCharacterAvailabilityProbe', () => {
  const modelDefinition: CharacterDefinition = {
    id: 'model',
    displayName: 'Model',
    modelAssetId: 'character.model',
    fallback: 'placeholder',
  };

  it('uses a local HEAD request and keeps the explicit placeholder fallback selectable', async () => {
    const request = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html' }),
    }));
    const probe = new ManifestCharacterAvailabilityProbe(
      new AssetCatalog({
        'character.model': { type: 'model', url: '/model.glb' },
      }),
      request,
      'http://localhost/game',
    );

    const availability = await probe.check(modelDefinition);
    expect(availability.status).toBe('fallback');
    expect(availability.reason).toContain('placeholder fallback');
    expect(request).toHaveBeenCalledWith(
      new URL('http://localhost/model.glb'),
      { method: 'HEAD' },
    );
  });

  it('reports request failures as explicit placeholder fallback', async () => {
    const probe = new ManifestCharacterAvailabilityProbe(
      new AssetCatalog({
        'character.model': { type: 'model', url: '/model.glb' },
      }),
      vi.fn(async () => {
        throw new TypeError('network unavailable');
      }),
      'http://localhost/game',
    );

    const result = await probe.check(modelDefinition);
    expect(result.status).toBe('fallback');
    expect(result.reason).toContain('placeholder fallback');
  });

  it('never probes remote character URLs', async () => {
    const request = vi.fn();
    const probe = new ManifestCharacterAvailabilityProbe(
      new AssetCatalog({
        'character.model': {
          type: 'model',
          url: 'https://example.com/model.glb',
        },
      }),
      request,
      'http://localhost/game',
    );

    await expect(probe.check(modelDefinition)).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'Remote character models are not allowed.',
    });
    expect(request).not.toHaveBeenCalled();
  });
});

function createHarness(
  results: Readonly<Record<string, CharacterAvailabilityResult>>,
  entries: readonly CharacterDefinition[] = definitions,
  preview = new FakePreview(),
): {
  readonly mount: HTMLElement;
  readonly picker: CharacterPickerSystem;
  readonly selection: CharacterSelectionStore;
  readonly state: GameStateMachine;
  readonly preview: FakePreview;
  press(action: string): void;
  dispose(): void;
} {
  const mount = document.createElement('main');
  document.body.append(mount);
  const selection = new CharacterSelectionStore(entries, entries[0]!.id);
  const pressed = new Set<string>();
  const input: InputReader = {
    isDown: () => false,
    wasPressed: (action) => pressed.has(action),
    wasReleased: () => false,
  };
  const state = new GameStateMachine(new EventBus<StateEvents>());
  state.transition('playing');
  const probe: CharacterAvailabilityProbe = {
    check: vi.fn(
      async (definition: CharacterDefinition) => results[definition.id]!,
    ),
  };
  const picker = new CharacterPickerSystem(mount, selection, probe, preview);
  picker.init({ events: new EventBus<StateEvents>(), state, input });
  return {
    mount,
    picker,
    selection,
    state,
    preview,
    press: (action) => {
      pressed.add(action);
      picker.update({ delta: 1 / 60, elapsed: 0, frame: 1 });
      pressed.clear();
    },
    dispose: () => {
      picker.dispose();
      mount.remove();
    },
  };
}

async function waitForAvailability(
  picker: CharacterPickerSystem,
  count: number,
): Promise<void> {
  await vi.waitFor(() => {
    expect(picker.getSnapshot().availableCharacterIds).toHaveLength(count);
  });
}
