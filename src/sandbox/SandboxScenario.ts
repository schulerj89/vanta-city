import type { PerspectiveCamera, Scene } from 'three';
import type { GameAssetLoader } from '../assets/AssetLoader';
import type { GameSystem } from '../core/lifecycle';
import type { DebugRegistry } from '../debug/DebugRegistry';
import type { DebugVisualHelpers } from '../debug/DebugVisualHelpers';
import type { InputSystem } from '../input/InputSystem';

export interface SandboxContext {
  readonly mount: HTMLElement;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly input: InputSystem;
  readonly assets: GameAssetLoader;
  readonly debug: DebugRegistry;
  readonly visualHelpers: DebugVisualHelpers;
}

export interface SandboxScenario {
  readonly id: string;
  readonly title: string;
  create(context: SandboxContext): GameSystem;
}
