import { Group } from 'three';
import type { Scene } from 'three';
import type { GameSystem } from '../core/lifecycle';
import type { FrameTime } from '../core/time';
import type { CharacterLoader, LoadedCharacter } from './CharacterLoader';
import type { CharacterSelectionReader } from './CharacterSelection';

export interface CharacterPreviewController {
  setRotation(angle: number): void;
  setAutoRotate(enabled: boolean): void;
}

export class CharacterPreviewSystem
  implements GameSystem, CharacterPreviewController
{
  public readonly id = 'character-preview';
  private readonly stage = new Group();
  private loaded: LoadedCharacter | undefined;
  private unsubscribe: (() => void) | undefined;
  private loadVersion = 0;
  private autoRotate = true;

  public constructor(
    private readonly scene: Scene,
    private readonly selection: CharacterSelectionReader,
    private readonly loader: CharacterLoader,
  ) {
    this.stage.name = 'Character preview stage';
    this.stage.position.set(0, 0, 4);
  }

  public async init(): Promise<void> {
    this.scene.add(this.stage);
    await this.replaceCharacter(this.selection.getSelectedDefinition());
    this.unsubscribe = this.selection.onSelectionChanged((definition) => {
      void this.replaceCharacter(definition);
    });
  }

  public update(time: FrameTime): void {
    if (this.autoRotate) this.stage.rotation.y += time.delta * 0.35;
  }

  public setRotation(angle: number): void {
    this.stage.rotation.y = angle;
  }

  public setAutoRotate(enabled: boolean): void {
    this.autoRotate = enabled;
  }

  public dispose(): void {
    this.loadVersion += 1;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.loaded?.dispose();
    this.loaded = undefined;
    this.scene.remove(this.stage);
    this.stage.clear();
  }

  private async replaceCharacter(
    definition: ReturnType<CharacterSelectionReader['getSelectedDefinition']>,
  ): Promise<void> {
    const version = ++this.loadVersion;
    const next = await this.loader.instantiate(definition);
    if (version !== this.loadVersion) {
      next.dispose();
      return;
    }

    this.loaded?.dispose();
    this.stage.clear();
    this.loaded = next;
    this.stage.add(next.root);
  }
}
