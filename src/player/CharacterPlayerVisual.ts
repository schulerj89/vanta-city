import { Group } from 'three';
import type {
  CharacterLoader,
  LoadedCharacter,
} from '../characters/CharacterLoader';
import type { CharacterSelectionReader } from '../characters/CharacterSelection';
import type { PlayerMovementSimulation } from './PlayerMovement';
import type { PlayerVisual } from './PlayerVisual';

/** Player presentation backed by the selected character with guaranteed fallback. */
export class CharacterPlayerVisual implements PlayerVisual {
  public readonly id = 'player';
  public readonly object3d = new Group();

  private loaded: LoadedCharacter | undefined;
  private unsubscribe: (() => void) | undefined;
  private loadVersion = 0;

  public constructor(
    private readonly selection: CharacterSelectionReader,
    private readonly loader: CharacterLoader,
  ) {
    this.object3d.name = 'Player character';
  }

  public async init(): Promise<void> {
    await this.replace(this.selection.getSelectedDefinition());
    this.unsubscribe = this.selection.onSelectionChanged((definition) => {
      void this.replace(definition);
    });
  }

  public sync(movement: PlayerMovementSimulation): void {
    this.object3d.position.copy(movement.position);
    this.object3d.rotation.y = movement.facingYaw;
  }

  public get source(): LoadedCharacter['source'] | 'loading' {
    return this.loaded?.source ?? 'loading';
  }

  public dispose(): void {
    this.loadVersion += 1;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.loaded?.dispose();
    this.loaded = undefined;
    this.object3d.clear();
  }

  private async replace(
    definition: ReturnType<CharacterSelectionReader['getSelectedDefinition']>,
  ): Promise<void> {
    const version = ++this.loadVersion;
    const next = await this.loader.instantiate(definition);
    if (version !== this.loadVersion) {
      next.dispose();
      return;
    }
    this.loaded?.dispose();
    this.object3d.clear();
    this.loaded = next;
    this.object3d.add(next.root);
  }
}
