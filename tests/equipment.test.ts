import { Group, Mesh, MeshBasicMaterial, BoxGeometry } from 'three';
import { CharacterDeathPresentation } from '../src/characters/CharacterDeathPresentation';
import { CharacterEquipment } from '../src/equipment/CharacterEquipment';
import { EquipmentPresentation } from '../src/equipment/EquipmentPresentation';

describe('CharacterEquipment', () => {
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
