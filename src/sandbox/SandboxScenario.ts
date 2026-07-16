import type { Scene } from 'three';
import type { GameSystem } from '../core/lifecycle';
import type { DebugRegistry } from '../debug/DebugRegistry';
import type { DebugVisualHelpers } from '../debug/DebugVisualHelpers';

export interface SandboxContext {
  readonly scene: Scene;
  readonly debug: DebugRegistry;
  readonly visualHelpers: DebugVisualHelpers;
}

export interface SandboxScenario {
  readonly id: string;
  readonly title: string;
  create(context: SandboxContext): GameSystem;
}
