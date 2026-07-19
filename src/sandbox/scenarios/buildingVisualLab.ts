import './buildingVisualLab.css';
import {
  AmbientLight,
  Box3,
  Box3Helper,
  BoxGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  GridHelper,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import type { BufferGeometry, Material, Object3D } from 'three';
import type { GameSystem } from '../../core/lifecycle';
import type { SandboxContext, SandboxScenario } from '../SandboxScenario';
import {
  AshfallBuildingRenderer,
  ashfallBuildingAssets,
  ashfallBuildingVariants,
  configureAshfallTexture,
  getAshfallBuildingVariant,
} from '../../world/buildings/AshfallBuildingKit';

export type BuildingLabView =
  'overview' | 'close' | 'street' | 'overhead' | 'materials';
export type BuildingLabLodState = 'near-detail' | 'far-detail' | 'shell-only';

export interface BuildingLabVariantSnapshot {
  readonly id: string;
  readonly footprint: readonly [number, number];
  readonly height: number;
  readonly material: string;
  readonly frontageMaterial: string;
  readonly frontage: string;
  readonly localFrontage: readonly [0, 0, 1];
  readonly entrances: readonly {
    readonly offsetX: number;
    readonly width: number;
    readonly height: number;
  }[];
  readonly profile: string;
  readonly uvMetersPerRepeat: number;
  readonly bounds: {
    readonly min: readonly number[];
    readonly max: readonly number[];
  };
  readonly collisionBounds: {
    readonly min: readonly number[];
    readonly max: readonly number[];
  };
  readonly lodPieces: { readonly near: number; readonly far: number };
}

export interface BuildingLabSnapshot {
  readonly ready: boolean;
  readonly view: BuildingLabView;
  readonly lodState: BuildingLabLodState;
  readonly focusedVariantId: string;
  readonly boundsVisible: boolean;
  readonly collisionVisible: boolean;
  readonly variantCount: number;
  readonly textureCount: number;
  readonly meshCount: number;
  readonly textures: readonly string[];
  readonly variants: readonly BuildingLabVariantSnapshot[];
}

export interface BuildingLabApi {
  snapshot(): BuildingLabSnapshot;
  setView(view: BuildingLabView): void;
  setFocusedVariant(id: string): void;
  setLodState(state: BuildingLabLodState): void;
  setBoundsVisible(visible: boolean): void;
  setCollisionVisible(visible: boolean): void;
}

declare global {
  interface Window {
    __VANTA_BUILDING_LAB__?: BuildingLabApi;
  }
}

const labViews: readonly BuildingLabView[] = [
  'overview',
  'close',
  'street',
  'overhead',
  'materials',
];
const labLodStates: readonly BuildingLabLodState[] = [
  'near-detail',
  'far-detail',
  'shell-only',
];

class BuildingVisualLabSystem implements GameSystem {
  public readonly id = 'sandbox-building-visual-lab';
  public readonly updateMode = 'always' as const;

  private readonly stage = new Group();
  private readonly resources = new Set<BufferGeometry | Material>();
  private readonly renderer: AshfallBuildingRenderer;
  private readonly panel = document.createElement('aside');
  private readonly records: BuildingLabVariantSnapshot[] = [];
  private readonly buildings = new Map<string, Group>();
  private readonly boundsHelpers = new Map<string, Box3Helper>();
  private readonly collisionHelpers = new Map<string, LineSegments>();
  private ready = false;
  private cameraConfigured = false;
  private view: BuildingLabView = 'overview';
  private lodState: BuildingLabLodState = 'near-detail';
  private focusedVariantId = ashfallBuildingVariants[18].id;
  private boundsVisible = true;
  private collisionVisible = true;

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
        const position = [column * 28 - 56, 0.02, row * 25 - 62] as const;
        const building = await this.renderer.create({
          id: `lab.${definition.id}`,
          kind: 'building',
          variantId: definition.id,
          position,
        });
        this.stage.add(building);
        this.buildings.set(definition.id, building);
        const collisionBounds = this.addDiagnostics(
          building,
          definition.footprint,
          definition.height,
        );
        const bounds = new Box3().setFromObject(building);
        let near = 0;
        let far = 0;
        building.traverse((object) => {
          if (object.userData.ashfallLod === 'near-detail') near += 1;
          if (object.userData.ashfallLod === 'far-detail') far += 1;
        });
        this.records[index] = {
          id: definition.id,
          footprint: [...definition.footprint],
          height: definition.height,
          material: definition.wallMaterial,
          frontageMaterial: definition.frontageMaterial,
          frontage: definition.frontage,
          localFrontage: [...definition.localFrontage],
          entrances: definition.entrances.map((entry) => ({ ...entry })),
          profile: definition.profile,
          uvMetersPerRepeat: definition.uvMetersPerRepeat,
          bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
          collisionBounds: {
            min: collisionBounds.min.toArray(),
            max: collisionBounds.max.toArray(),
          },
          lodPieces: { near, far },
        };
      }),
    );
    await this.addTextureSwatches();
    this.ready = true;
    this.installBridge();
    this.applyLodState();
    this.updatePanelState();
  }

  public update(): void {
    if (!this.cameraConfigured) this.setView(this.view);
  }

  public dispose(): void {
    delete window.__VANTA_BUILDING_LAB__;
    this.context.mount.classList.remove('building-lab-active');
    this.panel.remove();
    this.stage.removeFromParent();
    for (const helper of this.boundsHelpers.values()) helper.dispose();
    this.boundsHelpers.clear();
    this.collisionHelpers.clear();
    this.buildings.clear();
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
      lodState: this.lodState,
      focusedVariantId: this.focusedVariantId,
      boundsVisible: this.boundsVisible,
      collisionVisible: this.collisionVisible,
      variantCount: ashfallBuildingVariants.length,
      textureCount: Object.keys(ashfallBuildingAssets).length,
      meshCount,
      textures: Object.values(ashfallBuildingAssets).map(({ metadata }) =>
        String(metadata.material),
      ),
      variants: this.records.filter(Boolean),
    };
  }

  public setView(view: BuildingLabView): void {
    if (!labViews.includes(view))
      throw new Error(`Unknown building lab view: ${view}`);
    const camera = this.context.camera;
    this.view = view;
    camera.up.set(0, 1, 0);
    const focused = this.buildings.get(this.focusedVariantId);
    const target = focused?.position ?? new Vector3();
    if (view === 'overview') {
      camera.position.set(116, 96, 150);
      camera.lookAt(0, 6, 0);
      camera.fov = 48;
    } else if (view === 'close') {
      camera.position.set(target.x + 12, 6.4, target.z + 18);
      camera.lookAt(target.x, 4.5, target.z);
      camera.fov = 46;
    } else if (view === 'street') {
      camera.position.set(-78, 6.2, 92);
      camera.lookAt(0, 6, -8);
      camera.fov = 54;
    } else if (view === 'overhead') {
      camera.position.set(0, 190, 0);
      camera.up.set(0, 0, -1);
      camera.lookAt(0, 0, 0);
      camera.fov = 46;
    } else {
      camera.position.set(84, 15, 54);
      camera.lookAt(68, 13, 10);
      camera.fov = 44;
    }
    camera.near = 0.1;
    camera.far = 320;
    camera.updateProjectionMatrix();
    this.cameraConfigured = true;
    this.updatePanelState();
  }

  public setFocusedVariant(id: string): void {
    getAshfallBuildingVariant(id);
    this.focusedVariantId = id;
    if (this.view === 'close') this.setView('close');
    this.updatePanelState();
  }

  public setLodState(state: BuildingLabLodState): void {
    if (!labLodStates.includes(state))
      throw new Error(`Unknown building LOD state: ${state}`);
    this.lodState = state;
    this.applyLodState();
    this.updatePanelState();
  }

  public setBoundsVisible(visible: boolean): void {
    this.boundsVisible = visible;
    for (const helper of this.boundsHelpers.values()) helper.visible = visible;
    this.updatePanelState();
  }

  public setCollisionVisible(visible: boolean): void {
    this.collisionVisible = visible;
    for (const helper of this.collisionHelpers.values())
      helper.visible = visible;
    this.updatePanelState();
  }

  private configureScene(): void {
    this.context.scene.background = new Color(0x92a8b8);
    const ambient = new AmbientLight(0xaec8d0, 1.45);
    ambient.name = 'building-lab:ambient';
    const sun = new DirectionalLight(0xffdfb4, 2.4);
    sun.name = 'building-lab:sun';
    sun.position.set(35, 48, 28);
    const grid = new GridHelper(180, 36, 0x58777b, 0x2f4549);
    grid.name = 'building-lab:grid';
    this.stage.add(ambient, sun, grid);
  }

  private async addTextureSwatches(): Promise<void> {
    const entries = Object.entries(ashfallBuildingAssets);
    await Promise.all(
      entries.map(async ([assetId], index) => {
        const texture = await this.context.assets.loadTexture(assetId);
        configureAshfallTexture(texture);
        const geometry = this.own(new BoxGeometry(7, 5, 0.3));
        const material = this.own(
          new MeshStandardMaterial({ map: texture, roughness: 0.95 }),
        );
        const swatch = new Mesh(geometry, material);
        swatch.name = `texture-swatch:${assetId}`;
        swatch.position.set(
          48 + (index % 4) * 9,
          3 + Math.floor(index / 4) * 6,
          10,
        );
        swatch.castShadow = true;
        swatch.receiveShadow = true;
        this.stage.add(swatch);
      }),
    );
  }

  private addDiagnostics(
    building: Object3D,
    footprint: readonly [number, number],
    height: number,
  ): Box3 {
    const bounds = new Box3().setFromObject(building);
    const helper = new Box3Helper(bounds, 0x73f3d1);
    helper.name = `${building.name}:bounds`;
    this.boundsHelpers.set(
      building.userData.buildingVariantId as string,
      helper,
    );
    const collisionBounds = new Box3(
      new Vector3(
        building.position.x - footprint[0] / 2,
        building.position.y,
        building.position.z - footprint[1] / 2,
      ),
      new Vector3(
        building.position.x + footprint[0] / 2,
        building.position.y + height,
        building.position.z + footprint[1] / 2,
      ),
    );
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
    this.collisionHelpers.set(
      building.userData.buildingVariantId as string,
      collision,
    );
    this.stage.add(helper, collision);
    return collisionBounds;
  }

  private buildPanel(): void {
    this.panel.className = 'building-lab-panel';
    this.panel.dataset.testid = 'building-lab-panel';
    this.panel.setAttribute('aria-label', 'Ashfall building visual lab');
    const rows = ashfallBuildingVariants
      .map(
        (definition) => `<tr data-variant-id="${definition.id}">
          <th scope="row">${definition.displayName}</th>
          <td>${definition.footprint[0]}×${definition.footprint[1]}×${definition.height}m</td>
          <td>+Z · ${definition.frontage}</td>
          <td>${definition.wallMaterial} / ${definition.frontageMaterial}</td>
          <td>${definition.profile}</td>
          <td>${definition.uvMetersPerRepeat}m</td>
        </tr>`,
      )
      .join('');
    this.panel.innerHTML = `<header>
      <p>Ashfall · 1997 material survey</p><h1>Building kit lab</h1>
      <output data-lab-status>Loading local textures…</output>
      <div class="building-lab-controls">
        <nav aria-label="Lab views">${labViews
          .map(
            (id) =>
              `<button type="button" data-view="${id}" aria-pressed="false">${id}</button>`,
          )
          .join('')}</nav>
        <label>Focused variant<select data-focus>${ashfallBuildingVariants
          .map(
            (definition) =>
              `<option value="${definition.id}">${definition.displayName}</option>`,
          )
          .join('')}</select></label>
        <label>LOD state<select data-lod>${labLodStates
          .map((state) => `<option value="${state}">${state}</option>`)
          .join('')}</select></label>
        <div class="building-lab-toggles" aria-label="Diagnostics">
          <button type="button" data-toggle="bounds" aria-pressed="true">Bounds</button>
          <button type="button" data-toggle="collision" aria-pressed="true">Collision</button>
        </div>
      </div>
    </header>
    <div class="building-lab-table"><table><thead><tr><th>Variant</th><th>W×D×H</th><th>Frontage</th><th>Wall / frontage</th><th>Massing</th><th>UV repeat</th></tr></thead><tbody>${rows}</tbody></table></div>
    <footer>Materials: ${Object.values(ashfallBuildingAssets)
      .map(({ metadata }) => metadata.material)
      .join(' · ')}</footer>`;
    for (const button of Array.from(
      this.panel.querySelectorAll<HTMLButtonElement>('[data-view]'),
    )) {
      button.addEventListener('click', () =>
        this.setView(button.dataset.view as BuildingLabView),
      );
    }
    this.panel
      .querySelector<HTMLSelectElement>('[data-focus]')!
      .addEventListener('change', (event) => {
        this.setFocusedVariant(
          (event.currentTarget as HTMLSelectElement).value,
        );
      });
    this.panel
      .querySelector<HTMLSelectElement>('[data-lod]')!
      .addEventListener('change', (event) => {
        this.setLodState(
          (event.currentTarget as HTMLSelectElement)
            .value as BuildingLabLodState,
        );
      });
    this.panel
      .querySelector<HTMLButtonElement>('[data-toggle="bounds"]')!
      .addEventListener('click', () => {
        this.setBoundsVisible(!this.boundsVisible);
      });
    this.panel
      .querySelector<HTMLButtonElement>('[data-toggle="collision"]')!
      .addEventListener('click', () => {
        this.setCollisionVisible(!this.collisionVisible);
      });
  }

  private applyLodState(): void {
    for (const building of this.buildings.values()) {
      building.traverse((object) => {
        const tag = object.userData.ashfallLod as unknown;
        if (tag === 'near-detail')
          object.visible = this.lodState === 'near-detail';
        if (tag === 'far-detail')
          object.visible = this.lodState !== 'shell-only';
      });
    }
  }

  private updatePanelState(): void {
    const status =
      this.panel.querySelector<HTMLOutputElement>('[data-lab-status]');
    if (status) {
      status.textContent = this.ready
        ? `${ashfallBuildingVariants.length} variants · ${Object.keys(ashfallBuildingAssets).length} local textures · ${this.focusedVariantId} · ${this.lodState}`
        : 'Loading local textures…';
    }
    for (const button of Array.from(
      this.panel.querySelectorAll<HTMLButtonElement>('[data-view]'),
    )) {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.view === this.view),
      );
    }
    const focus = this.panel.querySelector<HTMLSelectElement>('[data-focus]');
    if (focus) focus.value = this.focusedVariantId;
    const lod = this.panel.querySelector<HTMLSelectElement>('[data-lod]');
    if (lod) lod.value = this.lodState;
    const bounds = this.panel.querySelector<HTMLButtonElement>(
      '[data-toggle="bounds"]',
    );
    bounds?.setAttribute('aria-pressed', String(this.boundsVisible));
    const collision = this.panel.querySelector<HTMLButtonElement>(
      '[data-toggle="collision"]',
    );
    collision?.setAttribute('aria-pressed', String(this.collisionVisible));
    for (const row of Array.from(
      this.panel.querySelectorAll<HTMLTableRowElement>('[data-variant-id]'),
    )) {
      row.dataset.selected = String(
        row.dataset.variantId === this.focusedVariantId,
      );
    }
  }

  private installBridge(): void {
    window.__VANTA_BUILDING_LAB__ = {
      snapshot: () => this.getSnapshot(),
      setView: (view) => this.setView(view),
      setFocusedVariant: (id) => this.setFocusedVariant(id),
      setLodState: (state) => this.setLodState(state),
      setBoundsVisible: (visible) => this.setBoundsVisible(visible),
      setCollisionVisible: (visible) => this.setCollisionVisible(visible),
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
