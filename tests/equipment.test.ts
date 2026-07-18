import { Group, Mesh, MeshBasicMaterial, BoxGeometry } from 'three';
import { CharacterDeathPresentation } from '../src/characters/CharacterDeathPresentation';
import { CharacterEquipment } from '../src/equipment/CharacterEquipment';
import { EquipmentPresentation } from '../src/equipment/EquipmentPresentation';

describe('CharacterEquipment', () => {
  it('enforces explicit ownership for equip and quickbar acquisition', () => {
    const equipment = new CharacterEquipment('player', ['knife']);
    const ownership = vi.fn();
    equipment.events.on('ownershipChanged', ownership);
    expect(equipment.equip('handgun')).toBe(false);
    expect(equipment.toggleQuickbarSlot(1)).toBe(false);
    expect(equipment.getSnapshot().ownedIds).toEqual(['knife']);
    expect(equipment.acquire('handgun')).toBe(true);
    expect(equipment.acquire('handgun')).toBe(false);
    expect(equipment.equip('handgun')).toBe(true);
    expect(ownership).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'handgun', owned: true }),
    );
    equipment.dispose();
  });

  it('shares deterministic quickbar toggle and typed use semantics for any owner', () => {
    const equipment = new CharacterEquipment('npc.mack');
    const changes = vi.fn();
    const uses = vi.fn();
    equipment.events.on('changed', changes);
    equipment.events.on('used', uses);

    expect(equipment.toggleQuickbarSlot(1)).toBe(true);
    expect(equipment.getSnapshot()).toMatchObject({
      ownerId: 'npc.mack',
      equippedId: 'handgun',
      equippedSlot: 1,
      changeSequence: 1,
    });
    expect(
      equipment.useWithTrigger((action) => action === 'gunFire', 'unit-test'),
    ).toBe(true);
    expect(equipment.getSnapshot()).toMatchObject({
      useSequence: 1,
      lastUseAccepted: true,
      lastUseSource: 'unit-test',
    });
    expect(uses).toHaveBeenCalledOnce();

    expect(equipment.toggleQuickbarSlot(1)).toBe(true);
    expect(equipment.getSnapshot().equippedId).toBeUndefined();
    expect(equipment.toggleQuickbarSlot(2)).toBe(true);
    expect(equipment.getSnapshot().equippedId).toBe('knife');
    expect(changes).toHaveBeenCalledTimes(3);
  });

  it('reports incompatible rigs and disposes every generated prop on change', () => {
    const equipment = new CharacterEquipment('owner');
    const presentation = new EquipmentPresentation(equipment);
    const root = new Group();
    const wrist = new Group();
    wrist.name = 'WristR';
    root.add(wrist);
    presentation.bind(root, 'ultimate-men');

    equipment.equip('handgun');
    expect(presentation.getSnapshot()).toMatchObject({
      itemId: 'handgun',
      socketName: 'WristR',
      attached: true,
      compatible: true,
      createdCount: 1,
    });
    equipment.equip('knife');
    expect(presentation.getSnapshot()).toMatchObject({
      itemId: 'knife',
      attached: true,
      createdCount: 2,
      disposedCount: 1,
    });
    presentation.bind(new Group(), 'animated-men');
    expect(presentation.getSnapshot()).toMatchObject({
      attached: false,
      compatible: false,
      disposedCount: 2,
    });
    presentation.dispose();
    equipment.dispose();
  });

  it('replaces the immediate procedural fallback with a cached model instance', async () => {
    const equipment = new CharacterEquipment('owner');
    const scene = new Group();
    const dispose = vi.fn(() => scene.removeFromParent());
    const instantiateModel = vi.fn(async () => ({
      assetId: 'equipment.handgun.model',
      scene,
      animations: [],
      dispose,
    }));
    const presentation = new EquipmentPresentation(equipment, {
      instantiateModel,
    });
    const root = new Group();
    const wrist = new Group();
    wrist.name = 'WristR';
    root.add(wrist);
    presentation.bind(root, 'ultimate-men');
    equipment.equip('handgun');

    expect(presentation.getSnapshot()).toMatchObject({
      source: 'procedural',
      assetId: 'equipment.handgun.model',
      loadError: undefined,
    });
    await vi.waitFor(() =>
      expect(presentation.getSnapshot().source).toBe('asset'),
    );
    expect(instantiateModel).toHaveBeenCalledWith('equipment.handgun.model');
    expect(scene.name).toBe('Handgun asset model');
    expect(scene.position.toArray()).toEqual([0.04, -0.04, -0.215]);
    expect([scene.rotation.x, scene.rotation.y, scene.rotation.z]).toEqual([
      0, 3.15, 1.5,
    ]);
    expect(scene.scale.toArray()).toEqual([5, 5, 5]);
    const muzzle = presentation.getAttachmentDebugObjects()?.muzzle;
    expect(muzzle?.parent).toBe(scene);
    expect(muzzle?.position.toArray()).toEqual([0, 0.014, 0.0231]);
    expect(muzzle?.scale.toArray()).toEqual([0.08, 0.08, 0.08]);
    expect(presentation.getSnapshot().muzzleAttached).toBe(true);

    equipment.equip('knife');
    expect(dispose).toHaveBeenCalledOnce();
    presentation.dispose();
    equipment.dispose();
  });

  it('keeps the procedural weapon visible when the model load fails', async () => {
    const equipment = new CharacterEquipment('owner');
    const presentation = new EquipmentPresentation(equipment, {
      instantiateModel: vi.fn(async () => {
        throw new Error('fixture unavailable');
      }),
    });
    const root = new Group();
    const wrist = new Group();
    wrist.name = 'WristR';
    root.add(wrist);
    presentation.bind(root, 'ultimate-men');
    equipment.equip('handgun');

    await vi.waitFor(() =>
      expect(presentation.getSnapshot().loadError).toContain(
        'fixture unavailable',
      ),
    );
    expect(presentation.getSnapshot()).toMatchObject({
      attached: true,
      compatible: true,
      source: 'procedural',
    });
    presentation.dispose();
    equipment.dispose();
  });

  it('owns persistent clamped ammunition, typed dry-fire, reload, and reset state', () => {
    const equipment = new CharacterEquipment('owner');
    const ammoChanges = vi.fn();
    const dryFire = vi.fn();
    const reloads = vi.fn();
    equipment.events.on('ammunitionChanged', ammoChanges);
    equipment.events.on('dryFire', dryFire);
    equipment.events.on('reloaded', reloads);
    equipment.equip('handgun');

    for (let index = 0; index < 8; index += 1) {
      expect(equipment.useWithTrigger(() => true, 'unit-test')).toBe(true);
    }
    expect(equipment.getAmmunition('handgun')).toEqual({
      current: 0,
      max: 8,
      empty: true,
    });
    expect(equipment.useWithTrigger(() => true, 'unit-test')).toBe(false);
    expect(dryFire).toHaveBeenCalledOnce();
    expect(equipment.consume('handgun')).toBe(false);
    expect(equipment.getAmmunition('handgun')?.current).toBe(0);

    equipment.unequip();
    equipment.equip('handgun');
    expect(equipment.getAmmunition('handgun')?.current).toBe(0);
    expect(equipment.reload('handgun')).toBe(true);
    expect(equipment.getAmmunition('handgun')?.current).toBe(8);
    expect(reloads).toHaveBeenCalledOnce();
    expect(equipment.reload('handgun')).toBe(false);
    expect(equipment.getSnapshot().lastRejection).toBe('already-full');
    expect(ammoChanges).toHaveBeenCalledTimes(9);
    equipment.resetAmmunition();
    expect(equipment.getAmmunition('handgun')?.current).toBe(8);
    equipment.dispose();
  });
});

describe('CharacterDeathPresentation', () => {
  it('blinks cloned materials and restores originals without leaks', () => {
    const root = new Group();
    const original = new MeshBasicMaterial({ color: 0xffffff });
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), original);
    root.add(mesh);
    const death = new CharacterDeathPresentation();
    death.bind(root);
    death.setDepleted(true, false);
    death.update(0.4);

    expect(mesh.material).not.toBe(original);
    expect(death.getSnapshot()).toMatchObject({
      depleted: true,
      nativeClip: false,
      fadeFallback: true,
      clonedMaterialCount: 1,
    });
    expect(death.getSnapshot().opacity).toBeLessThan(1);

    death.setDepleted(false, false);
    expect(mesh.material).toBe(original);
    expect(death.getSnapshot()).toMatchObject({
      depleted: false,
      clonedMaterialCount: 0,
      disposedMaterialCount: 1,
    });
    death.setDepleted(true, true);
    expect(mesh.material).toBe(original);
    expect(death.getSnapshot()).toMatchObject({
      nativeClip: true,
      fadeFallback: false,
    });
    death.dispose();
    mesh.geometry.dispose();
    original.dispose();
  });
});
