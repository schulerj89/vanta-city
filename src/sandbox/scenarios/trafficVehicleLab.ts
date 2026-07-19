import './trafficVehicleLab.css';
import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
} from 'three';
import type { BufferGeometry, Material } from 'three';
import type { ModelInstance } from '../../assets/AssetLoader';
import type { GameSystem } from '../../core/lifecycle';
import { normalizeVehicleModel } from '../../traffic/TrafficSystem';
import { trafficVehicleCatalog } from '../../traffic/TrafficVehicleCatalog';
import type { SandboxContext, SandboxScenario } from '../SandboxScenario';

export type TrafficVehicleLabView = 'overview' | 'front' | 'side';

export interface TrafficVehicleLabSnapshot {
  readonly ready: boolean;
  readonly view: TrafficVehicleLabView;
  readonly modelCount: number;
  readonly models: readonly {
    readonly id: string;
    readonly label: string;
    readonly assetId: string;
    readonly length: number;
    readonly maximumWidth: number;
    readonly maximumHeight: number;
    readonly forwardAxis: string;
  }[];
}

export interface TrafficVehicleLabApi {
  snapshot(): TrafficVehicleLabSnapshot;
  setView(view: TrafficVehicleLabView): void;
}

declare global {
  interface Window {
    __VANTA_TRAFFIC_VEHICLE_LAB__?: TrafficVehicleLabApi;
  }
}

const views: readonly TrafficVehicleLabView[] = ['overview', 'front', 'side'];

class TrafficVehicleLabSystem implements GameSystem {
  public readonly id = 'sandbox-traffic-vehicle-lab';
  public readonly updateMode = 'always' as const;

  private readonly stage = new Group();
  private readonly resources = new Set<BufferGeometry | Material>();
  private readonly instances: ModelInstance[] = [];
  private readonly frontMarkers: Mesh[] = [];
  private readonly panel = document.createElement('aside');
  private ready = false;
  private view: TrafficVehicleLabView = 'overview';

  public constructor(private readonly context: SandboxContext) {
    this.stage.name = 'Traffic vehicle visual lab';
  }

  public async init(): Promise<void> {
    this.context.scene.background = new Color(0x121b22);
    this.buildStage();
    this.context.scene.add(this.stage);
    for (const definition of trafficVehicleCatalog) {
      const instance = await this.context.assets.instantiateModel(
        definition.assetId,
      );
      this.instances.push(instance);
      normalizeVehicleModel(instance.scene, definition);
      instance.scene.traverse((child) => {
        if ('isMesh' in child) {
          const mesh = child as Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      this.stage.add(instance.scene);
    }
    this.buildPanel();
    this.setView('overview');
    this.ready = true;
    window.__VANTA_TRAFFIC_VEHICLE_LAB__ = {
      snapshot: () => this.snapshot(),
      setView: (view) => this.setView(view),
    };
  }

  public dispose(): void {
    delete window.__VANTA_TRAFFIC_VEHICLE_LAB__;
    this.panel.remove();
    for (const instance of this.instances.splice(0)) instance.dispose();
    this.stage.removeFromParent();
    this.stage.clear();
    this.frontMarkers.length = 0;
    for (const resource of this.resources) resource.dispose();
    this.resources.clear();
    this.ready = false;
  }

  private snapshot(): TrafficVehicleLabSnapshot {
    return {
      ready: this.ready,
      view: this.view,
      modelCount: trafficVehicleCatalog.length,
      models: trafficVehicleCatalog.map(
        ({ id, label, assetId, presentation }) => ({
          id,
          label,
          assetId,
          length: presentation.length,
          maximumWidth: presentation.maximumWidth,
          maximumHeight: presentation.maximumHeight,
          forwardAxis: presentation.forwardAxis,
        }),
      ),
    };
  }

  private setView(view: TrafficVehicleLabView): void {
    if (!views.includes(view))
      throw new Error(`Unknown vehicle lab view: ${view}`);
    this.view = view;
    const camera = this.context.camera;
    this.instances.forEach((instance, index) => {
      const [x, z] = this.layoutPosition(view, index);
      instance.scene.position.set(x, 0, z);
      this.frontMarkers[index]?.position.set(x, 0.035, z + 2.65);
    });
    const target = {
      overview: new Vector3(-1, 0.7, -1),
      front: new Vector3(0, 0.7, 0),
      side: new Vector3(0, 0.7, -4),
    }[view];
    const position = {
      overview: new Vector3(14, 16, 25),
      front: new Vector3(0, 6.5, 40),
      side: new Vector3(55, 6.5, -4),
    }[view];
    camera.position.copy(position);
    camera.lookAt(target);
    camera.fov = view === 'overview' ? 48 : 43;
    camera.near = 0.1;
    camera.far = 100;
    camera.updateProjectionMatrix();
    this.panel
      .querySelectorAll<HTMLButtonElement>('button')
      .forEach((button) => {
        button.setAttribute(
          'aria-pressed',
          String(button.dataset.view === view),
        );
      });
  }

  private layoutPosition(
    view: TrafficVehicleLabView,
    index: number,
  ): readonly [number, number] {
    if (view === 'front') return [index * 3 - 14, 0];
    if (view === 'side') return [0, index * 5 - 15];
    return [(index % 3) * 5.2 - 6.2, Math.floor(index / 3) * -6 + 5];
  }

  private buildStage(): void {
    const groundMaterial = this.own(
      new MeshStandardMaterial({ color: 0x263238, roughness: 0.92 }),
    );
    const ground = new Mesh(
      this.own(new PlaneGeometry(40, 32)),
      groundMaterial,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -0.3;
    ground.receiveShadow = true;
    this.stage.add(ground);
    const grid = new GridHelper(40, 40, 0x5a7780, 0x354951);
    grid.position.set(0, 0.015, -0.3);
    this.stage.add(grid);

    const frontMaterial = this.own(
      new MeshStandardMaterial({ color: 0xe6a73d, roughness: 0.75 }),
    );
    const frontGeometry = this.own(new BoxGeometry(1.5, 0.025, 0.12));
    for (let index = 0; index < trafficVehicleCatalog.length; index += 1) {
      const marker = new Mesh(frontGeometry, frontMaterial);
      marker.name = `vehicle-lab-front:${trafficVehicleCatalog[index]!.id}`;
      this.frontMarkers.push(marker);
      this.stage.add(marker);
    }

    const ambient = new AmbientLight(0xd7e4e5, 1.9);
    const key = new DirectionalLight(0xffe3bd, 3.2);
    key.position.set(8, 13, 10);
    key.castShadow = true;
    const fill = new DirectionalLight(0x76aeca, 1.3);
    fill.position.set(-10, 7, -8);
    this.stage.add(ambient, key, fill);
  }

  private buildPanel(): void {
    this.panel.className = 'traffic-vehicle-lab-panel';
    this.panel.dataset.testid = 'traffic-vehicle-lab-panel';
    this.panel.innerHTML = `
      <header><div><strong>Traffic Vehicle Lab</strong><span>production catalog · CC0</span></div></header>
      <nav aria-label="Vehicle lab camera">
        ${views.map((view) => `<button type="button" data-view="${view}" aria-pressed="false">${view}</button>`).join('')}
      </nav>
      <p class="traffic-vehicle-lab-note"><i></i>Amber bars mark each front bumper (+Z after normalization).</p>
      <ol>
        ${trafficVehicleCatalog
          .map(
            ({ id, label, presentation }) => `
              <li><b>${label}</b><code>${id}</code><span>${presentation.length.toFixed(2)}m L · ≤${presentation.maximumWidth.toFixed(2)}m W · ≤${presentation.maximumHeight.toFixed(2)}m H</span></li>`,
          )
          .join('')}
      </ol>`;
    this.panel
      .querySelectorAll<HTMLButtonElement>('button')
      .forEach((button) => {
        button.addEventListener('click', () =>
          this.setView(button.dataset.view as TrafficVehicleLabView),
        );
      });
    this.context.mount.append(this.panel);
  }

  private own<Resource extends BufferGeometry | Material>(
    resource: Resource,
  ): Resource {
    this.resources.add(resource);
    return resource;
  }
}

export const trafficVehicleLab: SandboxScenario = {
  id: 'traffic-vehicle-lab',
  title: 'Traffic Vehicle Lab',
  create: (context) => new TrafficVehicleLabSystem(context),
};
