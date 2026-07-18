import {
  AnimationClip,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
} from 'three';
import type { LoadedCharacter } from '../src/characters/CharacterLoader';
import { CharacterSelectionStore } from '../src/characters/CharacterSelection';
import type { CharacterDefinition } from '../src/characters/CharacterDefinition';
import type { PlayerMovementSimulation } from '../src/player/PlayerMovement';
import {
  CharacterPlayerVisual,
  type CharacterInstanceLoader,
} from '../src/player/CharacterPlayerVisual';
import { CharacterEquipment } from '../src/equipment/CharacterEquipment';
import { flushPromises } from './helpers/flushPromises';

const definitions = [
  {
    id: 'first',
    displayName: 'First',
    equipmentRigId: 'ultimate-men',
    fallback: 'placeholder',
  },
  {
    id: 'second',
    displayName: 'Second',
    equipmentRigId: 'ultimate-men',
    fallback: 'placeholder',
  },
  { id: 'third', displayName: 'Third', fallback: 'placeholder' },
] as const satisfies readonly CharacterDefinition[];

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => resolvePromise?.(value),
  };
}

function loadedCharacter(
  definition: CharacterDefinition,
  source: LoadedCharacter['source'] = 'asset',
  clips: ReadonlyMap<string, AnimationClip> = new Map(),
): LoadedCharacter & { readonly dispose: ReturnType<typeof vi.fn> } {
  const root = new Group();
  const dispose = vi.fn(() => root.removeFromParent());
  return {
    definition,
    root,
    animationClips: clips,
    discoveredClipNames: [...clips.values()].map(({ name }) => name),
    source,
    warnings: [],
    dispose,
  };
}

function movement(
  state: PlayerMovementSimulation['state'],
  facingYaw = 1.25,
): PlayerMovementSimulation {
  return {
    position: new Vector3(4, 0, 7),
    facingYaw,
    state,
  } as PlayerMovementSimulation;
}

describe('CharacterPlayerVisual', () => {
  it('prevents stale asynchronous loads from replacing a newer selection', async () => {
    const selection = new CharacterSelectionStore(definitions, 'first');
    const loads = new Map<string, Deferred<LoadedCharacter>>(
      definitions.map(({ id }) => [id, deferred<LoadedCharacter>()]),
    );
    const loader: CharacterInstanceLoader = {
      instantiate: (definition) => loads.get(definition.id)!.promise,
    };
    const visual = new CharacterPlayerVisual(selection, loader);

    const initializing = visual.init();
    selection.select('second');
    selection.select('third');
    const first = loadedCharacter(definitions[0]);
    const second = loadedCharacter(definitions[1]);
    const third = loadedCharacter(definitions[2]);
    loads.get('third')!.resolve(third);
    await Promise.resolve();
    expect(visual.getDebugSnapshot().loadedVisualId).toBe('third');

    loads.get('second')!.resolve(second);
    loads.get('first')!.resolve(first);
    await initializing;
    await Promise.resolve();

    expect(visual.getDebugSnapshot().loadedVisualId).toBe('third');
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.dispose).toHaveBeenCalledOnce();
    expect(third.dispose).not.toHaveBeenCalled();
    visual.dispose();
  });

  it('disposes the old instance and reloads only the visual', async () => {
    const selection = new CharacterSelectionStore(definitions, 'first');
    const instances = [
      loadedCharacter(definitions[0]),
      loadedCharacter(definitions[1]),
      loadedCharacter(definitions[1]),
    ];
    const loader: CharacterInstanceLoader = {
      instantiate: vi.fn(async () => instances.shift()!),
    };
    const visual = new CharacterPlayerVisual(selection, loader);
    await visual.init();
    const first = visual.loadedModelRoot.children[0];

    selection.select('second');
    await Promise.resolve();
    expect(first?.parent).toBeNull();
    expect(visual.getDebugSnapshot()).toMatchObject({
      selectedCharacterId: 'second',
      loadedVisualId: 'second',
      fallbackActive: false,
      loadStatus: 'loaded',
    });

    const beforeReload = visual.loadedModelRoot.children[0];
    await visual.reload();
    expect(beforeReload?.parent).toBeNull();
    expect(loader.instantiate).toHaveBeenCalledTimes(3);
    visual.dispose();
  });

  it('reports fallback status for a placeholder result', async () => {
    const selection = new CharacterSelectionStore(definitions, 'first');
    const fallback = loadedCharacter(definitions[0], 'placeholder');
    const visual = new CharacterPlayerVisual(selection, {
      instantiate: vi.fn(async () => fallback),
    });

    await visual.init();

    expect(visual.getDebugSnapshot()).toMatchObject({
      loadedVisualId: 'placeholder',
      fallbackActive: true,
      loadStatus: 'fallback',
      animationState: 'static',
    });
    const fallbackOffset = visual.loadedModelRoot.position.clone();
    for (const heading of [0.4, 1.2, -2.4, Math.PI]) {
      visual.sync(movement('running', heading), 0.1);
    }
    expect(visual.loadedModelRoot.position.toArray()).toEqual(
      fallbackOffset.toArray(),
    );
    expect(visual.visualRoot.rotation.y).toBeCloseTo(Math.PI);
    visual.dispose();
  });

  it('plays mapped clips without allowing root motion to offset the player', async () => {
    const selection = new CharacterSelectionStore(definitions, 'first');
    const rootMotion = new AnimationClip('Walk', 1, [
      new VectorKeyframeTrack('.position', [0, 1], [0, 2, 0, 20, 2, 0]),
    ]);
    const instance = loadedCharacter(
      definitions[0],
      'asset',
      new Map([['walk', rootMotion]]),
    );
    instance.root.position.set(0, 0.35, 0);
    const visual = new CharacterPlayerVisual(selection, {
      instantiate: vi.fn(async () => instance),
    });
    await visual.init();

    visual.sync(movement('walking'), 0.5);

    expect(visual.object3d.position.toArray()).toEqual([4, 0, 7]);
    expect(instance.root.position.toArray()).toEqual([0, 0.35, 0]);
    expect(visual.getDebugSnapshot()).toMatchObject({
      animationState: 'walk',
      verticalOffset: 0.35,
    });
    visual.dispose();
  });

  it('runs authoritative one-shot actions and returns to locomotion', async () => {
    const selection = new CharacterSelectionStore(definitions, 'first');
    const wave = new AnimationClip('Wave', 0.8, [
      new VectorKeyframeTrack('.position', [0, 0.8], [0, 0.2, 0, 8, 0.2, 0]),
    ]);
    const idle = new AnimationClip('Idle', 1, []);
    const instance = loadedCharacter(
      definitions[0],
      'asset',
      new Map([
        ['wave', wave],
        ['idle', idle],
      ]),
    );
    instance.root.position.set(0, 0.2, 0);
    const visual = new CharacterPlayerVisual(selection, {
      instantiate: vi.fn(async () => instance),
    });
    await visual.init();

    expect(visual.triggerCharacterAction('wave', 'unit-test')).toBe(true);
    visual.sync(movement('idle'), 0.4);
    expect(instance.root.position.toArray()).toEqual([0, 0.2, 0]);
    expect(visual.getDebugSnapshot()).toMatchObject({
      animationState: 'action:wave',
      characterAction: {
        active: 'wave',
        lastRequested: 'wave',
        lastSource: 'unit-test',
        lastAccepted: true,
        sequence: 1,
      },
    });

    visual.sync(movement('idle'), 0.5);
    expect(visual.getDebugSnapshot()).toMatchObject({
      animationState: 'idle',
      characterAction: { active: undefined, sequence: 1 },
    });
    visual.dispose();
  });

  it('keeps one Run action through heading changes and restores it after a kick', async () => {
    const selection = new CharacterSelectionStore(definitions, 'first');
    const instance = loadedCharacter(
      definitions[0],
      'asset',
      new Map([
        ['run', new AnimationClip('Run', 1, [])],
        ['kickLeft', new AnimationClip('Kick left', 0.2, [])],
      ]),
    );
    instance.root.position.set(0, 0.2, 0);
    const visual = new CharacterPlayerVisual(selection, {
      instantiate: vi.fn(async () => instance),
    });
    await visual.init();

    visual.sync(movement('running', 0), 0.05);
    const runSequence =
      visual.getDebugSnapshot().animationGraph.transitionSequence;
    for (const heading of [0.2, 0.6, 1.1, 1.8]) {
      visual.sync(movement('running', heading), 0.05);
      expect(visual.getDebugSnapshot()).toMatchObject({
        animationState: 'run',
        animationGraph: { transitionSequence: runSequence },
      });
      expect(instance.root.position.toArray()).toEqual([0, 0.2, 0]);
    }

    expect(visual.triggerCharacterAction('kickLeft', 'unit-test')).toBe(true);
    visual.sync(movement('running', 2.2), 0.1);
    expect(visual.getDebugSnapshot().animationState).toBe('action:kickLeft');
    visual.sync(movement('running', 2.6), 0.2);
    expect(visual.getDebugSnapshot()).toMatchObject({
      animationState: 'run',
      animationGraph: { transitionReason: 'restoration' },
    });
    expect(visual.visualRoot.rotation.y).toBeCloseTo(2.6);
    expect(instance.root.position.toArray()).toEqual([0, 0.2, 0]);
    visual.dispose();
  });

  it('preserves alignment while switching characters during a smoothed turn', async () => {
    const selection = new CharacterSelectionStore(definitions, 'first');
    const first = loadedCharacter(
      definitions[0],
      'asset',
      new Map([['run', new AnimationClip('Run first', 1, [])]]),
    );
    const second = loadedCharacter(
      definitions[1],
      'asset',
      new Map([['run', new AnimationClip('Run second', 1, [])]]),
    );
    first.root.position.y = 0.15;
    second.root.position.y = 0.3;
    const visual = new CharacterPlayerVisual(selection, {
      instantiate: vi
        .fn()
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(second),
    });
    await visual.init();
    visual.sync(movement('running', 0.8), 0.1);
    const firstAlignmentY = visual.loadedModelRoot.position.y;
    visual.sync(movement('running', 1.1), 0.1);
    expect(visual.loadedModelRoot.position.y).toBe(firstAlignmentY);

    selection.select('second');
    await flushPromises();
    expect(visual.getDebugSnapshot().loadedDefinitionId).toBe('second');
    visual.sync(movement('running', 1.6), 0.1);
    const secondAlignmentY = visual.loadedModelRoot.position.y;
    visual.sync(movement('running', 2.1), 0.1);

    expect(first.dispose).toHaveBeenCalledOnce();
    expect(visual.loadedModelRoot.position.y).toBe(secondAlignmentY);
    expect(second.root.position.y).toBe(0.3);
    expect(visual.visualRoot.rotation.y).toBeCloseTo(2.1);
    expect(visual.getDebugSnapshot().animationState).toBe('run');
    visual.dispose();
  });

  it('locks one-shots until mixer completion and rejects rapid cross-action spam', async () => {
    const selection = new CharacterSelectionStore(definitions, 'first');
    const punchLeft = new AnimationClip('Punch left', 0.8, []);
    const punchRight = new AnimationClip('Punch right', 0.8, []);
    const walk = new AnimationClip('Walk', 1, []);
    const instance = loadedCharacter(
      definitions[0],
      'asset',
      new Map([
        ['punchLeft', punchLeft],
        ['punchRight', punchRight],
        ['walk', walk],
      ]),
    );
    const visual = new CharacterPlayerVisual(selection, {
      instantiate: vi.fn(async () => instance),
    });
    await visual.init();

    expect(visual.triggerCharacterAction('punchLeft', 'keyboard:punch')).toBe(
      true,
    );
    expect(visual.triggerCharacterAction('punchRight', 'keyboard:punch')).toBe(
      false,
    );
    expect(visual.triggerCharacterAction('kickLeft', 'keyboard:kick')).toBe(
      false,
    );
    expect(visual.getCharacterActionState()).toMatchObject({
      active: 'punchLeft',
      busy: true,
      lastRequested: 'kickLeft',
      lastAccepted: false,
      lastRejection: 'busy',
      busyRejectionCount: 2,
      sequence: 1,
      completedSequence: 0,
    });

    visual.sync(movement('walking'), 0.43);
    expect(visual.getDebugSnapshot()).toMatchObject({
      animationState: 'action:punchLeft',
      animationGraph: { phase: 'action', transitionReason: 'action' },
      characterAction: {
        busy: true,
        impactSequence: 0,
        completedSequence: 0,
      },
    });
    visual.sync(movement('walking'), 0.02);
    expect(visual.getDebugSnapshot()).toMatchObject({
      animationState: 'action:punchLeft',
      characterAction: {
        busy: true,
        lastImpact: 'punchLeft',
        impactSequence: 1,
        impactNormalizedTime: 0.55,
        completedSequenceAtImpact: 0,
        completedSequence: 0,
      },
    });
    visual.sync(movement('walking'), 0.36);
    expect(visual.getDebugSnapshot()).toMatchObject({
      animationState: 'walk',
      animationGraph: {
        phase: 'locomotion',
        transitionReason: 'restoration',
      },
      characterAction: {
        active: undefined,
        busy: false,
        lastCompleted: 'punchLeft',
        completedSequence: 1,
        completionRelease: 'mixer-finished',
      },
    });
    expect(visual.triggerCharacterAction('punchRight', 'keyboard:punch')).toBe(
      true,
    );
    visual.dispose();
  });

  it('rejects actions that are unavailable on a fallback visual', async () => {
    const selection = new CharacterSelectionStore(definitions, 'first');
    const fallback = loadedCharacter(definitions[0], 'placeholder');
    const visual = new CharacterPlayerVisual(selection, {
      instantiate: vi.fn(async () => fallback),
    });
    await visual.init();

    expect(visual.triggerCharacterAction('interact', 'unit-test')).toBe(false);
    expect(visual.getCharacterActionState()).toMatchObject({
      active: undefined,
      lastRequested: 'interact',
      lastAccepted: false,
      sequence: 0,
    });
    visual.dispose();
  });

  it('locks a native roll, strips its root motion, and restores equipped idle', async () => {
    const selection = new CharacterSelectionStore(definitions, 'first');
    const equipment = new CharacterEquipment('player');
    equipment.equip('handgun');
    const roll = new AnimationClip('Roll', 0.3, [
      new VectorKeyframeTrack('.position', [0, 0.3], [0, 0, 0, 5, 0, 5]),
    ]);
    const instance = loadedCharacter(
      definitions[0],
      'asset',
      new Map([
        ['roll', roll],
        ['gunIdle', new AnimationClip('Gun idle', 1, [])],
      ]),
    );
    instance.root.position.set(0, 0.2, 0);
    const wrist = new Group();
    wrist.name = 'WristR';
    instance.root.add(wrist);
    const visual = new CharacterPlayerVisual(
      selection,
      { instantiate: vi.fn(async () => instance) },
      equipment,
    );
    await visual.init();
    visual.sync(movement('idle'), 0.01);
    expect(visual.getDebugSnapshot()).toMatchObject({
      animationState: 'gunIdle',
      equipmentPresentation: { attached: true, socketName: 'WristR' },
    });

    expect(visual.triggerCharacterAction('roll', 'unit-test')).toBe(true);
    visual.sync(movement('idle'), 0.15);
    expect(instance.root.position.toArray()).toEqual([0, 0.2, 0]);
    expect(visual.getDebugSnapshot().animationState).toBe('action:roll');
    visual.sync(movement('idle'), 0.2);
    expect(visual.getDebugSnapshot()).toMatchObject({
      animationState: 'gunIdle',
      characterAction: { active: undefined, lastCompleted: 'roll' },
    });
    visual.dispose();
    equipment.dispose();
  });

  it('keeps firearm locomotion running while gun fire uses an upper-body layer', async () => {
    const selection = new CharacterSelectionStore(definitions, 'first');
    const equipment = new CharacterEquipment('player');
    equipment.equip('handgun');
    const instance = loadedCharacter(
      definitions[0],
      'asset',
      new Map([
        ['gunRun', new AnimationClip('Gun run', 0.8, [])],
        [
          'gunFire',
          new AnimationClip('Gun fire', 0.6, [
            new QuaternionKeyframeTrack(
              'UpperArmR.quaternion',
              [0, 0.6],
              [0, 0, 0, 1, 0, 0, 0, 1],
            ),
            new QuaternionKeyframeTrack(
              'UpperLegR.quaternion',
              [0, 0.6],
              [0, 0, 0, 1, 0, 0, 0, 1],
            ),
          ]),
        ],
      ]),
    );
    const visual = new CharacterPlayerVisual(
      selection,
      { instantiate: vi.fn(async () => instance) },
      equipment,
    );
    await visual.init();
    visual.sync(movement('running'), 0.2);
    const before = visual.getLocomotionSnapshot();

    expect(visual.triggerCharacterAction('gunFire', 'unit-test')).toBe(true);
    visual.sync(movement('running', 0.8), 0.2);
    expect(visual.getLocomotionSnapshot()).toMatchObject({
      baseClip: 'gunRun',
      actionClip: 'gunFire',
      actionLayer: 'upper-body',
      transitionSequence: before.transitionSequence,
    });
    visual.sync(movement('running', 1.6), 0.5);
    expect(visual.getLocomotionSnapshot()).toMatchObject({
      baseClip: 'gunRun',
      actionClip: undefined,
      actionLayer: 'none',
      transitionSequence: before.transitionSequence,
    });
    visual.dispose();
    equipment.dispose();
  });

  it('uses native death when mapped and rejects actions until revived', async () => {
    const selection = new CharacterSelectionStore(definitions, 'first');
    const instance = loadedCharacter(
      definitions[0],
      'asset',
      new Map([
        ['idle', new AnimationClip('Idle', 1, [])],
        ['death', new AnimationClip('Death', 0.5, [])],
        ['roll', new AnimationClip('Roll', 0.3, [])],
      ]),
    );
    const visual = new CharacterPlayerVisual(selection, {
      instantiate: vi.fn(async () => instance),
    });
    await visual.init();

    visual.setDepleted(true);
    visual.sync(movement('idle'), 0.1);
    expect(visual.triggerCharacterAction('roll', 'unit-test')).toBe(false);
    expect(visual.getDebugSnapshot()).toMatchObject({
      animationState: 'death:death',
      death: { depleted: true, nativeClip: true, fadeFallback: false },
      characterAction: { lastRejection: 'depleted' },
    });
    visual.setDepleted(false);
    visual.sync(movement('idle'), 0.1);
    expect(visual.triggerCharacterAction('roll', 'unit-test')).toBe(true);
    visual.dispose();
  });

  it('restores fade materials and replaces equipped props on character switch', async () => {
    const selection = new CharacterSelectionStore(definitions, 'first');
    const equipment = new CharacterEquipment('player');
    equipment.equip('knife');
    const first = loadedCharacter(definitions[0], 'placeholder');
    const second = loadedCharacter(definitions[1], 'placeholder');
    for (const instance of [first, second]) {
      const wrist = new Group();
      wrist.name = 'WristR';
      const material = new MeshBasicMaterial({ color: 0xffffff });
      const mesh = new Mesh(new BoxGeometry(1, 1, 1), material);
      instance.root.add(wrist, mesh);
    }
    const visual = new CharacterPlayerVisual(
      selection,
      {
        instantiate: vi
          .fn()
          .mockResolvedValueOnce(first)
          .mockResolvedValueOnce(second),
      },
      equipment,
    );
    await visual.init();
    visual.setDepleted(true);
    visual.sync(movement('idle'), 0.4);
    expect(visual.getDebugSnapshot()).toMatchObject({
      death: { fadeFallback: true },
      equipmentPresentation: { attached: true, createdCount: 1 },
    });
    expect(visual.getDebugSnapshot().death.clonedMaterialCount).toBeGreaterThan(
      0,
    );

    selection.select('second');
    await flushPromises();
    expect(visual.getDebugSnapshot().loadedDefinitionId).toBe('second');
    expect(visual.getDebugSnapshot()).toMatchObject({
      death: { fadeFallback: true },
      equipmentPresentation: {
        attached: true,
        createdCount: 2,
        disposedCount: 1,
      },
    });
    expect(visual.getDebugSnapshot().death.clonedMaterialCount).toBeGreaterThan(
      0,
    );
    visual.setDepleted(false);
    expect(visual.getDebugSnapshot().death.clonedMaterialCount).toBe(0);
    visual.dispose();
    expect(visual.getDebugSnapshot().equipmentPresentation.disposedCount).toBe(
      2,
    );
    equipment.dispose();
  });
});
