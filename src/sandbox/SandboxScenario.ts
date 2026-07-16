import type { PerspectiveCamera, Scene } from 'three';
import type { GameSystem } from '../core/lifecycle';
import type { DebugRegistry } from '../debug/DebugRegistry';
import type { DebugVisualHelpers } from '../debug/DebugVisualHelpers';
import type { InputSystem } from '../input/InputSystem';

export interface SandboxContext {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly input: InputSystem;
  readonly mount: HTMLElement;
  readonly debug: DebugRegistry;
  readonly visualHelpers: DebugVisualHelpers;
}

export interface SandboxScenario {
  readonly id: string;
  readonly title: string;
  create(context: SandboxContext): GameSystem;
}
