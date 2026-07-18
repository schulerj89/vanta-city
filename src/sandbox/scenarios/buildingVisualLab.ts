import './buildingVisualLab.css';
import {
  AmbientLight,
  Box3,
  Box3Helper,
  BoxGeometry,
  DirectionalLight,
  EdgesGeometry,
  GridHelper,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  Vector3,
} from 'three';
import type { BufferGeometry, Material, Object3D } from 'three';
import type { GameSystem } from '../../core/lifecycle';
import type { SandboxContext, SandboxScenario } from '../SandboxScenario';
import {
  AshfallBuildingRenderer,
  ashfallBuildingVariants,
} from '../../world/buildings/AshfallBuildingKit';

export type BuildingLabView = 'overview' | 'street' | 'overhead';

export interface BuildingLabSnapshot {
  readonly ready: boolean;
  readonly view: BuildingLabView;
  readonly variantCount: number;
  readonly textureCount: number;
  readonly meshCount: number;
  readonly variants: readonly {
    readonly id: string;
    readonly footprint: readonly [number, number];
    readonly height: number;
    readonly material: string;
    readonly profile: string;
    readonly uvMetersPerRepeat: number;
    readonly bounds: {
      readonly min: readonly number[];
      readonly max: readonly number[];
    };
  }[];
}

export interface BuildingLabApi {
  snapshot(): BuildingLabSnapshot;
  setView(view: BuildingLabView): void;
}

declare global {
  interface Window {
    __VANTA_BUILDING_LAB__?: BuildingLabApi;
  }
}

class BuildingVisualLabSystem implements GameSystem {
  public readonly id = 'sandbox-building-visual-lab';
  public readonly updateMode = 'always' as const;

  private readonly stage = new Group();
  private readonly resources = new Set<BufferGeometry | Material>();
  private readonly renderer: AshfallBuildingRenderer;
  private readonly panel = document.createElement('aside');
  private readonly records: BuildingLabSnapshot['variants'][number][] = [];
  private ready = false;
  private cameraConfigured = false;
  private view: BuildingLabView = 'overview';

  public constructor(private readonly context: SandboxContext) {
    this.renderer = new AshfallBuildingRenderer(context.assets, this.resources);
    this.stage.name = 'Ashfall building visual lab';
  }

  public async init(): Promise<void> {
    this.context.mount.classList.add('building-lab-active');
    this.configureScene();
    this.buildPanel();
    this.context.mount.append(this.panel);
    this.context.scene.add(this.stage);
    await Promise.all(
      ashfallBuildingVariants.map(async (definition, index) => {
        const column = index % 5;
        const row = Math.floor(index / 5);
        const position = [column * 20 - 44, 0.02, row * 20 - 30] as const;
        const building = await this.renderer.create({
          id: `lab.${definition.id}`,
          kind: 'building',
          variantId: definition.id,
          position,
        });
        this.stage.add(building);
        this.addDiagnostics(building, definition.footprint, definition.height);
        const bounds = new Box3().setFromObject(building);
        this.records[index] = {
          id: definition.id,
          footprint: [...definition.footprint],
          height: definition.height,
          material: definition.wallMaterial,
          profile: definition.profile,
          uvMetersPerRepeat: definition.uvMetersPerRepeat,
          bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
        };
      }),
    );
    this.ready = true;
    this.installBridge();
    this.refreshPanel();
  }

  public update(): void {
    if (!this.cameraConfigured) this.setView(this.view);
  }

  public dispose(): void {
    delete window.__VANTA_BUILDING_LAB__;
    this.context.mount.classList.remove('building-lab-active');
    this.panel.remove();
    this.stage.removeFromParent();
    this.stage.traverse((object) => {
      if (object instanceof Box3Helper) object.dispose();
    });
    for (const resource of this.resources) resource.dispose();
    this.resources.clear();
    this.stage.clear();
  }

  public getSnapshot(): BuildingLabSnapshot {
    let meshCount = 0;
    this.stage.traverse((object) => {
      if (object instanceof Mesh) meshCount += 1;
    });
    return {
      ready: this.ready,
      view: this.view,
      variantCount: ashfallBuildingVariants.length,
      textureCount: 5,
      meshCount,
      variants: this.records.filter(Boolean),
    };
  }

  public setView(view: BuildingLabView): void {
    const camera = this.context.camera;
    this.view = view;
    camera.up.set(0, 1, 0);
    if (view === 'overview') {
      camera.position.set(92, 72, 118);
      camera.lookAt(18, 5, 0);
      camera.fov = 48;
    } else if (view === 'street') {
      camera.position.set(-18, 5.8, 61);
      camera.lookAt(-8, 5.5, 0);
      camera.fov = 54;
    } else {
      camera.position.set(30, 138, 0);
      camera.up.set(0, 0, -1);
      camera.lookAt(30, 0, 0);
      camera.fov = 43;
    }
    camera.near = 0.1;
    camera.far = 240;
    camera.updateProjectionMatrix();
    this.cameraConfigured = true;
    this.refreshPanel();
  }

  private configureScene(): void {
    const ambient = new AmbientLight(0xaec8d0, 1.45);
    ambient.name = 'building-lab:ambient';
    const sun = new DirectionalLight(0xffdfb4, 2.4);
    sun.name = 'building-lab:sun';
    sun.position.set(35, 48, 28);
    const grid = new GridHelper(140, 28, 0x58777b, 0x2f4549);
    grid.name = 'building-lab:grid';
    this.stage.add(ambient, sun, grid);
  }

  private addDiagnostics(
    building: Object3D,
    footprint: readonly [number, number],
    height: number,
  ): void {
    const bounds = new Box3().setFromObject(building);
    const helper = new Box3Helper(bounds, 0x73f3d1);
    helper.name = `${building.name}:bounds`;
    const footprintBox = new BoxGeometry(footprint[0], 0.08, footprint[1]);
    const footprintGeometry = this.own(new EdgesGeometry(footprintBox));
    footprintBox.dispose();
    const footprintMaterial = this.own(
      new LineBasicMaterial({ color: 0xffb347, depthTest: false }),
    );
    const collision = new LineSegments(footprintGeometry, footprintMaterial);
    collision.name = `${building.name}:collision-footprint`;
    collision.position.copy(building.position).add(new Vector3(0, 0.1, 0));
    collision.userData.height = height;
    this.stage.add(helper, collision);
  }

  private buildPanel(): void {
    this.panel.className = 'building-lab-panel';
    this.panel.dataset.testid = 'building-lab-panel';
    this.panel.setAttribute('aria-label', 'Ashfall building visual lab');
  }

  private refreshPanel(): void {
    const rows = ashfallBuildingVariants
      .map(
        (definition) => `<tr data-variant-id="${definition.id}">
          <th>${definition.displayName}</th>
          <td>${definition.footprint[0]}×${definition.footprint[1]}×${definition.height}m</td>
          <td>${definition.wallMaterial}</td>
          <td>${definition.profile}</td>
          <td>${definition.uvMetersPerRepeat}m</td>
        </tr>`,
      )
      .join('');
    this.panel.innerHTML = `<header>
      <p>Ashfall Junction</p><h1>Building kit lab</h1>
      <output>${this.ready ? '18 variants · 5 local textures · bounds + collision shown' : 'Loading local textures…'}</output>
      <nav aria-label="Lab views">
        ${(['overview', 'street', 'overhead'] as const)
          .map(
            (id) =>
              `<button type="button" data-view="${id}" aria-pressed="${this.view === id}">${id}</button>`,
          )
          .join('')}
      </nav>
    </header>
    <table><thead><tr><th>Variant</th><th>W×D×H</th><th>Texture</th><th>Massing</th><th>UV repeat</th></tr></thead><tbody>${rows}</tbody></table>`;
    for (const button of Array.from(
      this.panel.querySelectorAll<HTMLButtonElement>('[data-view]'),
    )) {
      button.onclick = () =>
        this.setView(button.dataset.view as BuildingLabView);
    }
  }

  private installBridge(): void {
    window.__VANTA_BUILDING_LAB__ = {
      snapshot: () => this.getSnapshot(),
      setView: (view) => this.setView(view),
    };
  }

  private own<Resource extends BufferGeometry | Material>(
    resource: Resource,
  ): Resource {
    this.resources.add(resource);
    return resource;
  }
}

export const buildingVisualLab: SandboxScenario = {
  id: 'building-visual-lab',
  title: 'Ashfall Building Visual Lab',
  create: (context) => new BuildingVisualLabSystem(context),
};
