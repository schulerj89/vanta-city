import {
  AnimationAction,
  AnimationMixer,
  Group,
  LoopRepeat,
  MathUtils,
  Vector3,
} from 'three';
import type { CharacterDefinition } from '../characters/CharacterDefinition';
import type { LoadedCharacter } from '../characters/CharacterLoader';
import {
  calculateCharacterVisualAlignment,
  measureModelBounds,
} from '../characters/CharacterVisualAlignment';
import type { CollisionWorld } from '../physics/CollisionWorld';
import {
  pedestrianCollisionRadius,
  type PedestrianBoundaryEdge,
  type PedestrianBoundaryLifecyclePolicy,
  type PedestrianLifecycleReason,
  type PedestrianRouteLifecycleState,
} from './PedestrianBoundaryLifecyclePolicy';
import type { PedestrianRouteDefinition } from './PedestrianRouteDefinition';

export interface PedestrianCharacterLoader {
  instantiate(definition: CharacterDefinition): Promise<LoadedCharacter>;
}

export type PedestrianMovementState =
  'loading' | 'walking' | 'idle' | 'inactive';

export interface PedestrianSnapshot {
  readonly id: string;
  readonly routeId: string;
  readonly sectorId: string;
  readonly segmentId: string;
  readonly targetNodeId: string;
  readonly state: PedestrianMovementState;
  readonly lifecycleState: PedestrianRouteLifecycleState;
  readonly lifecycleReason: PedestrianLifecycleReason | null;
  readonly boundaryEdge: PedestrianBoundaryEdge | null;
  readonly signedBoundaryDistance: number | null;
  readonly visible: boolean;
  readonly distanceTravelled: number;
  readonly speed: number;
  readonly modelId: string;
  readonly modelSource: LoadedCharacter['source'] | 'pending';
  readonly position: readonly [number, number, number];
  readonly facingYaw: number;
  readonly grounded: boolean;
  readonly groundColliderId: string;
  readonly currentAnimation: 'loading' | 'idle' | 'walk';
  readonly mixerOwnerCount: number;
}

export interface PedestrianUpdateResult {
  readonly shouldDespawn: boolean;
  readonly reason: Extract<
    PedestrianLifecycleReason,
    'authored-boundary-exit'
  > | null;
  readonly edge: PedestrianBoundaryEdge | null;
}

const shape = {
  radius: pedestrianCollisionRadius,
  height: 1.78,
  stepHeight: 0.28,
  maxSlopeAngle: Math.PI / 4,
  groundSnapDistance: 0.35,
} as const;

export class PedestrianEntity {
  public readonly object3d = new Group();
  private readonly visualRoot = new Group();
  private readonly modelOffset = new Vector3();
  private loaded: LoadedCharacter | undefined;
  private mixer: AnimationMixer | undefined;
  private action: AnimationAction | undefined;
  private targetNodeIndex: number;
  private state: PedestrianMovementState = 'loading';
  private pauseRemaining = 0;
  private currentAnimation: PedestrianSnapshot['currentAnimation'] = 'loading';
  private grounded = true;
  private groundColliderId: string;
  private active = true;
  private visible = true;
  private distanceTravelled = 0;
  private lifecycleState: PedestrianRouteLifecycleState = 'resident';
  private boundaryEdge: PedestrianBoundaryEdge | null = null;
  private signedBoundaryDistance: number | null = null;
  private disposed = false;

  public constructor(
    public readonly id: string,
    public readonly route: PedestrianRouteDefinition,
    private readonly character: CharacterDefinition,
    private readonly loader: PedestrianCharacterLoader,
    private readonly collision: CollisionWorld,
    public readonly speed: number,
    startNodeIndex: number,
    private readonly pauseUnit: number,
    private readonly boundaryLifecycle: PedestrianBoundaryLifecyclePolicy,
  ) {
    const node = route.nodes[startNodeIndex]!;
    this.targetNodeIndex = (startNodeIndex + 1) % route.nodes.length;
    this.object3d.name = id;
    this.object3d.position.set(...node.position);
    this.groundColliderId = node.surfaceColliderId;
    this.visualRoot.name = `${id}:visual-alignment`;
    this.object3d.add(this.visualRoot);
    this.evaluateLifecycle();
  }

  public async init(): Promise<void> {
    const loaded = await this.loader.instantiate(this.character);
    if (this.disposed) {
      loaded.dispose();
      return;
    }
    this.loaded = loaded;
    try {
      const bounds = measureModelBounds(loaded.root);
      const alignment = calculateCharacterVisualAlignment(
        { minY: bounds.min.y, maxY: bounds.max.y },
        this.character.transform?.verticalOffset,
      );
      this.visualRoot.position.y = alignment.appliedVisualOffset;
      this.modelOffset.copy(loaded.root.position);
      this.visualRoot.add(loaded.root);
      if (loaded.animationClips.size > 0)
        this.mixer = new AnimationMixer(loaded.root);
      this.state = 'walking';
      this.play('walk');
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  public setActive(active: boolean): void {
    this.visible = active;
    this.object3d.visible = active;
    if (!this.route.loop) return;
    if (this.active === active) return;
    this.active = active;
    if (!active) {
      this.state = 'inactive';
      this.play('idle');
    } else if (this.loaded) {
      this.state = this.pauseRemaining > 0 ? 'idle' : 'walking';
      this.play(this.state === 'idle' ? 'idle' : 'walk');
    }
  }

  public update(
    delta: number,
    neighbors: readonly PedestrianEntity[],
  ): PedestrianUpdateResult {
    const beforeMovement = this.evaluateLifecycle();
    if (beforeMovement.shouldDespawn) return beforeMovement;
    if (!this.active || !this.loaded) return noDespawn;
    const safeDelta = Math.max(0, delta);
    if (this.pauseRemaining > 0) {
      this.pauseRemaining = Math.max(0, this.pauseRemaining - safeDelta);
      this.state = 'idle';
      this.play('idle');
      this.updatePresentation(safeDelta);
      return this.evaluateLifecycle();
    }

    const targetNode = this.route.nodes[this.targetNodeIndex]!;
    const target = new Vector3(...targetNode.position);
    const direction = target.sub(this.object3d.position);
    direction.y = 0;
    const distance = direction.length();
    if (distance <= 0.06) {
      this.object3d.position.set(...targetNode.position);
      const reachedIndex = this.targetNodeIndex;
      if (this.route.loop) {
        this.targetNodeIndex =
          (this.targetNodeIndex + 1) % this.route.nodes.length;
      } else if (this.targetNodeIndex < this.route.nodes.length - 1) {
        this.targetNodeIndex += 1;
      }
      const pause = this.route.nodes[reachedIndex]?.pauseSeconds;
      if (pause) {
        this.pauseRemaining = MathUtils.lerp(
          pause[0],
          pause[1],
          this.pauseUnit,
        );
        this.state = 'idle';
        this.play('idle');
      }
      this.updatePresentation(safeDelta);
      return this.evaluateLifecycle();
    }

    direction.normalize();
    const spacingScale = this.personalSpacingScale(direction, neighbors);
    const travel = Math.min(distance, this.speed * spacingScale * safeDelta);
    if (travel <= 1e-5) {
      this.state = 'idle';
      this.play('idle');
      this.updatePresentation(safeDelta);
      return this.evaluateLifecycle();
    }
    const displacement = direction.clone().multiplyScalar(travel);
    const dynamicHit = this.collision.castDynamicSegment?.(
      this.object3d.position,
      this.object3d.position.clone().add(displacement),
      0.34,
      [this.id],
    );
    if (dynamicHit?.obstructed) {
      this.state = 'idle';
      this.play('idle');
      this.updatePresentation(safeDelta);
      return this.evaluateLifecycle();
    }
    const result = this.collision.moveCharacter(
      this.object3d.position,
      displacement,
      shape,
      this.grounded,
    );
    const previousPosition = this.object3d.position.clone();
    this.object3d.position.copy(result.position);
    this.distanceTravelled += Math.hypot(
      this.object3d.position.x - previousPosition.x,
      this.object3d.position.z - previousPosition.z,
    );
    this.grounded = result.grounded;
    this.groundColliderId = result.groundColliderId;
    if (result.blocked) {
      this.pauseRemaining = 0.4 + this.pauseUnit * 0.35;
      this.state = 'idle';
      this.play('idle');
    } else {
      const targetYaw = Math.atan2(direction.x, direction.z);
      this.object3d.rotation.y = smoothYaw(
        this.object3d.rotation.y,
        targetYaw,
        safeDelta,
      );
      this.state = 'walking';
      this.play('walk');
    }
    this.updatePresentation(safeDelta);
    return this.evaluateLifecycle();
  }

  private evaluateLifecycle(): PedestrianUpdateResult {
    const decision = this.boundaryLifecycle.evaluate(
      this.route,
      this.object3d.position,
      this.targetNodeIndex,
    );
    this.lifecycleState = decision.state;
    this.boundaryEdge = decision.edge;
    this.signedBoundaryDistance = decision.signedBoundaryDistance;
    return {
      shouldDespawn: decision.shouldDespawn,
      reason: decision.reason,
      edge: decision.edge,
    };
  }

  private personalSpacingScale(
    direction: Readonly<Vector3>,
    neighbors: readonly PedestrianEntity[],
  ): number {
    let scale = 1;
    for (const neighbor of neighbors) {
      if (neighbor === this || !neighbor.active) continue;
      const offset = neighbor.object3d.position
        .clone()
        .sub(this.object3d.position);
      const distance = Math.hypot(offset.x, offset.z);
      if (distance >= 1.35 || distance < 1e-5) continue;
      offset.y = 0;
      if (offset.normalize().dot(direction) < 0.25) continue;
      scale = Math.min(scale, MathUtils.clamp((distance - 0.62) / 0.73, 0, 1));
    }
    return scale;
  }

  private updatePresentation(delta: number): void {
    if (this.visible) this.mixer?.update(delta);
    if (this.loaded) this.loaded.root.position.copy(this.modelOffset);
  }

  private play(logical: 'idle' | 'walk'): void {
    if (this.currentAnimation === logical) return;
    const clip = this.loaded?.animationClips.get(logical);
    this.currentAnimation = logical;
    if (!clip || !this.mixer) return;
    const previous = this.action;
    const next = this.mixer.clipAction(clip);
    if (previous !== next) {
      previous?.fadeOut(0.16);
      next.reset().setLoop(LoopRepeat, Infinity).fadeIn(0.16).play();
      this.action = next;
    }
  }

  public getSnapshot(): PedestrianSnapshot {
    const previousIndex = this.route.loop
      ? (this.targetNodeIndex - 1 + this.route.nodes.length) %
        this.route.nodes.length
      : Math.max(0, this.targetNodeIndex - 1);
    return {
      id: this.id,
      routeId: this.route.id,
      sectorId: this.route.sectorId,
      segmentId: `${this.route.nodes[previousIndex]!.id}->${this.route.nodes[this.targetNodeIndex]!.id}`,
      targetNodeId: this.route.nodes[this.targetNodeIndex]!.id,
      state: this.state,
      lifecycleState: this.lifecycleState,
      lifecycleReason: null,
      boundaryEdge: this.boundaryEdge,
      signedBoundaryDistance: this.signedBoundaryDistance,
      visible: this.visible,
      distanceTravelled: this.distanceTravelled,
      speed: this.state === 'walking' ? this.speed : 0,
      modelId: this.character.id,
      modelSource: this.loaded?.source ?? 'pending',
      position: this.object3d.position.toArray(),
      facingYaw: this.object3d.rotation.y,
      grounded: this.grounded,
      groundColliderId: this.groundColliderId,
      currentAnimation: this.currentAnimation,
      mixerOwnerCount: this.mixer ? 1 : 0,
    };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.active = false;
    this.visible = false;
    this.object3d.visible = false;
    this.action?.stop();
    if (this.mixer && this.loaded) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.loaded.root);
    }
    this.action = undefined;
    this.mixer = undefined;
    this.loaded?.dispose();
    this.loaded = undefined;
    this.visualRoot.clear();
    this.object3d.clear();
  }
}

const noDespawn: PedestrianUpdateResult = {
  shouldDespawn: false,
  reason: null,
  edge: null,
};

function smoothYaw(current: number, target: number, delta: number): number {
  const difference = Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current),
  );
  return current + difference * (1 - Math.exp(-9 * delta));
}
