import {
  AmbientLight,
  BoxGeometry,
  Color,
  ConeGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';
import type { BufferGeometry, Material, Object3D } from 'three';
import type { GameSystem } from '../../core/lifecycle';
import type { FrameTime } from '../../core/time';
import type { DebugUnregister } from '../../debug/DebugRegistry';
import { debugSections } from '../../debug/DebugRegistry';
import type { SandboxContext, SandboxScenario } from '../SandboxScenario';

const spawns = {
  origin: [0, 0.75, 0],
  east: [5, 0.75, 0],
  north: [0, 0.75, -5],
} as const;

function isMesh(
  object: Object3D,
): object is Mesh<BufferGeometry, Material | Material[]> {
  return 'isMesh' in object && object.isMesh === true;
}

class FoundationSandboxSystem implements GameSystem {
  public readonly id = 'sandbox-foundation';
  private readonly root = new Group();
  private readonly subject = new Mesh(
    new BoxGeometry(1.2, 1.5, 1.2),
    new MeshStandardMaterial({ color: 0xffce45 }),
  );
  private readonly spawnMarkers = new Group();
  private unregister: DebugUnregister[] = [];

  public constructor(private readonly context: SandboxContext) {}

  public init(): void {
    const floor = new Mesh(
      new PlaneGeometry(24, 24),
      new MeshStandardMaterial({ color: 0x263c35, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.root.add(
      floor,
      new AmbientLight(0xb9d5ff, 1.4),
      new DirectionalLight(0xfff0d0, 2.8),
      this.subject,
      this.spawnMarkers,
    );
    this.context.scene.background = new Color(0x92a8b8);
    this.context.scene.add(this.root);

    for (const [name, position] of Object.entries(spawns)) {
      const marker = new Mesh(
        new ConeGeometry(0.35, 0.8, 6),
        new MeshStandardMaterial({ color: 0x55d9ff }),
      );
      marker.name = `Spawn: ${name}`;
      marker.position.set(position[0], 0.4, position[2]);
      this.spawnMarkers.add(marker);
    }
    this.spawnMarkers.visible = false;
    this.teleport('origin');

    this.unregister = [
      this.context.debug.registerValue({
        id: 'sandbox.subject-position',
        label: 'Subject',
        group: debugSections.player,
        read: () =>
          this.subject.position
            .toArray()
            .map((value) => value.toFixed(1))
            .join(', '),
      }),
      this.context.debug.registerCommand({
        id: 'player.reset',
        label: 'Reset player',
        group: debugSections.actions,
        run: () => this.teleport('origin'),
      }),
      this.context.debug.registerCommand({
        id: 'player.teleport',
        label: 'Teleport to spawn',
        group: debugSections.actions,
        argumentLabel: Object.keys(spawns).join(', '),
        run: (name) => this.teleport(name),
      }),
      this.context.visualHelpers.register('spawnPoints', {
        setVisible: (visible) => {
          this.spawnMarkers.visible = visible;
        },
      }),
    ];
  }

  public update(time: FrameTime): void {
    this.subject.rotation.y += time.delta * 0.8;
  }

  public dispose(): void {
    for (const unregister of this.unregister) unregister();
    this.unregister = [];
    this.context.scene.remove(this.root);
    this.root.traverse((object) => {
      if (!isMesh(object)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) material.dispose();
    });
    this.root.clear();
  }

  private teleport(name = ''): void {
    const position = spawns[name as keyof typeof spawns];
    if (!position) {
      throw new Error(
        `Unknown spawn "${name}". Available: ${Object.keys(spawns).join(', ')}`,
      );
    }
    this.subject.position.set(position[0], position[1], position[2]);
  }
}

export const foundationSandbox: SandboxScenario = {
  id: 'foundation',
  title: 'Foundation mechanics',
  create: (context) => new FoundationSandboxSystem(context),
};
