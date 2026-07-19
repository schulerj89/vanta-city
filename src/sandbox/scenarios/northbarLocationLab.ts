import {
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  PointLight,
  Vector3,
} from 'three';
import type { GameSystem } from '../../core/lifecycle';
import { EventBus } from '../../core/events';
import type { SandboxContext, SandboxScenario } from '../SandboxScenario';
import { LevelRegistry } from '../../world/LevelRegistry';
import { LevelSystem } from '../../world/LevelSystem';
import type { WorldEvents } from '../../world/WorldEvents';
import { northbarCoachDepot } from '../../world/levels/northbarCoachDepot';

export type NorthbarLabView =
  | 'establishing'
  | 'street'
  | 'overhead'
  | 'mack-close'
  | 'della-close'
  | 'departure';

export interface NorthbarLabSnapshot {
  readonly ready: boolean;
  readonly view: NorthbarLabView;
  readonly levelId: string | undefined;
  readonly activeSectors: readonly string[];
  readonly sceneObjects: number;
  readonly ownedResources: number;
  readonly colliders: number;
}

export interface NorthbarLabApi {
  snapshot(): NorthbarLabSnapshot;
  setView(view: NorthbarLabView): void;
}

declare global {
  interface Window {
    __VANTA_NORTHBAR_LAB__?: NorthbarLabApi;
  }
}

const views: Record<
  NorthbarLabView,
  {
    position: readonly [number, number, number];
    lookAt: readonly [number, number, number];
    fov: number;
  }
> = {
  establishing: { position: [-4, 3.1, -11.5], lookAt: [-8, 1.3, 2], fov: 58 },
  street: { position: [20, 3.7, -14], lookAt: [2, 1.5, 1], fov: 54 },
  overhead: { position: [0, 48, 0], lookAt: [0, 0, 0], fov: 46 },
  'mack-close': {
    position: [-3.1, 2, 0.1],
    lookAt: [-0.8, 1.45, 1.1],
    fov: 34,
  },
  'della-close': {
    position: [7.2, 2.15, 3.8],
    lookAt: [7.2, 1.35, 7.25],
    fov: 32,
  },
  departure: { position: [5.5, 2.8, -2.5], lookAt: [12, 1.1, -7.7], fov: 50 },
};

class NorthbarLocationLabSystem implements GameSystem {
  public readonly id = 'sandbox-northbar-location-lab';
  public readonly updateMode = 'always' as const;

  private readonly lights = new Group();
  private readonly events = new EventBus<WorldEvents>();
  private readonly levels: LevelSystem;
  private ready = false;
  private view: NorthbarLabView = 'establishing';

  public constructor(private readonly context: SandboxContext) {
    this.levels = new LevelSystem(
      context.scene,
      context.assets,
      new LevelRegistry([northbarCoachDepot]),
      northbarCoachDepot.definition.id,
      this.events,
      undefined,
      false,
      true,
    );
  }

  public async init(): Promise<void> {
    this.context.scene.background = new Color(0x17252d);
    const ambient = new AmbientLight(0x8aa8b8, 1.25);
    const dawn = new DirectionalLight(0xaabed0, 1.55);
    dawn.position.set(-18, 28, -22);
    const bay = new PointLight(0xe7a34f, 22, 18, 2);
    bay.position.set(-7.5, 5.1, 4.8);
    const hall = new PointLight(0xd9f0db, 16, 15, 2);
    hall.position.set(8, 4.4, 8.5);
    const departure = new PointLight(0xe7a34f, 18, 16, 2);
    departure.position.set(12.5, 5.1, -3.2);
    this.lights.add(ambient, dawn, bay, hall, departure);
    this.context.scene.add(this.lights);
    await this.levels.init();
    this.setView(this.view);
    this.installBridge();
    this.ready = true;
  }

  public dispose(): void {
    delete window.__VANTA_NORTHBAR_LAB__;
    this.levels.dispose();
    this.events.clear();
    this.lights.removeFromParent();
    this.lights.clear();
  }

  public setView(view: NorthbarLabView): void {
    const config = views[view];
    this.view = view;
    const camera = this.context.camera;
    camera.up.set(0, 1, 0);
    if (view === 'overhead') camera.up.set(0, 0, -1);
    camera.position.set(...config.position);
    camera.lookAt(new Vector3(...config.lookAt));
    camera.near = 0.1;
    camera.far = 180;
    camera.fov = config.fov;
    camera.updateProjectionMatrix();
  }

  private snapshot(): NorthbarLabSnapshot {
    const streaming = this.levels.getStreamingSnapshot();
    return {
      ready: this.ready,
      view: this.view,
      levelId: streaming.levelId,
      activeSectors: streaming.active,
      sceneObjects: streaming.sceneObjects,
      ownedResources: streaming.ownedResources,
      colliders: streaming.colliders,
    };
  }

  private installBridge(): void {
    window.__VANTA_NORTHBAR_LAB__ = {
      snapshot: () => this.snapshot(),
      setView: (view) => this.setView(view),
    };
  }
}

export const northbarLocationLab: SandboxScenario = {
  id: 'northbar-location-lab',
  title: 'Northbar Coach Depot location lab',
  create: (context) => new NorthbarLocationLabSystem(context),
};
