import { Vector3 } from 'three';
import type { MissionSystem } from '../missions/MissionSystem';
import type { NpcSystem } from '../npcs/NpcSystem';
import type { CharacterPlayerVisual } from '../player/CharacterPlayerVisual';
import type { PlayerControllerSystem } from '../player/PlayerControllerSystem';
import { StaticCollisionWorld } from '../physics/CollisionWorld';
import { DefinitionLevelLocations } from '../world/LevelQueries';
import type { LevelRegistry } from '../world/LevelRegistry';
import type {
  LevelSystem,
  PreparedLevelTransition,
} from '../world/LevelSystem';
import type {
  CinematicPerformanceOwner,
  PerformanceReleaseReason,
} from './CinematicPerformanceController';
import type { CinematicPerformanceRequest } from './CinematicDefinition';
import type {
  CinematicDestinationAdapter,
  CinematicDestinationHandle,
  CinematicLandingAdapter,
  CinematicCompositionAdapter,
  CinematicCompositionSubject,
  CinematicCompositionVisual,
  CinematicPerformanceAdapter,
  CinematicPerformanceHandle,
  CinematicPerformanceReleaseReason,
  CinematicResolvedBlocking,
  CinematicRuntimeAdapters,
  CinematicSceneAdapter,
  CinematicStagingAdapter,
} from './CinematicRuntimeContracts';

/** Composes existing public owners; it owns no camera, mixer, level, or fact state. */
export function createCinematicRuntimeAdapters(dependencies: {
  readonly levels: LevelSystem;
  readonly registry: LevelRegistry;
  readonly player: PlayerControllerSystem;
  readonly playerVisual: CharacterPlayerVisual;
  readonly npcs: NpcSystem;
  readonly missions: MissionSystem;
}): CinematicRuntimeAdapters {
  return {
    performances: new ParticipantPerformanceAdapter(
      dependencies.playerVisual,
      dependencies.npcs,
      dependencies.player,
      dependencies.levels,
    ),
    staging: new ParticipantStagingAdapter(
      dependencies.player,
      dependencies.npcs,
      dependencies.levels,
    ),
    composition: new AuthoredCompositionAdapter(
      dependencies.levels,
      dependencies.registry,
    ),
    scene: new LevelSceneAdapter(dependencies.levels),
    destination: new LevelDestinationAdapter(
      dependencies.levels,
      dependencies.registry,
      dependencies.player,
    ),
    landing: new MissionLandingAdapter(dependencies.missions),
  };
}

class ParticipantStagingAdapter implements CinematicStagingAdapter {
  public constructor(
    private readonly player: PlayerControllerSystem,
    private readonly npcs: NpcSystem,
    private readonly levels: LevelSystem,
  ) {}

  public preflightBlocking(
    requests: Parameters<CinematicStagingAdapter['preflightBlocking']>[0],
  ) {
    const collision = collisionProbe(this.levels);
    const shape = this.player.movement.config;
    const resolved: CinematicResolvedBlocking[] = [];
    for (const request of requests) {
      try {
        const location = this.levels.getLocation(request.markId);
        const requested = new Vector3(...location.position);
        const placement = collision.moveCharacter(
          requested,
          new Vector3(0, -shape.groundSnapDistance, 0),
          shape,
          true,
        );
        const displacement = requested.distanceTo(placement.position);
        if (!placement.grounded) {
          return {
            ready: false as const,
            reason: `Blocking mark "${request.markId}" is not grounded`,
          };
        }
        if (displacement > request.maximumDisplacementMetres + 1e-6) {
          return {
            ready: false as const,
            reason: `Blocking mark "${request.markId}" displaced ${displacement.toFixed(3)}m`,
          };
        }
        resolved.push({
          participantId: request.participantId,
          markId: request.markId,
          requestedPosition: worldPosition(requested),
          resolvedPosition: worldPosition(placement.position),
          displacementMetres: displacement,
          clearanceMetres: measureClearance(
            collision,
            placement.position,
            shape.radius,
          ),
          grounded: placement.grounded,
          groundColliderId: placement.groundColliderId,
          facingParticipantId: request.facingParticipantId,
        });
      } catch (error) {
        return {
          ready: false as const,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    }
    return { ready: true as const, resolved };
  }

  public stageBlocking(resolved: readonly CinematicResolvedBlocking[]): void {
    for (const placement of resolved) {
      const { x, y, z } = placement.resolvedPosition;
      if (placement.participantId === 'casual') {
        this.player.teleport(new Vector3(x, y, z));
      } else if (
        !this.npcs.setPerformancePosition(placement.participantId, { x, y, z })
      ) {
        throw new Error(
          `Participant "${placement.participantId}" cannot be staged at "${placement.markId}"`,
        );
      }
    }
  }
}

class AuthoredCompositionAdapter implements CinematicCompositionAdapter {
  public constructor(
    private readonly levels: LevelSystem,
    private readonly registry: LevelRegistry,
  ) {}

  public preflightShot(
    shot: Parameters<CinematicCompositionAdapter['preflightShot']>[0],
    resolved: readonly CinematicResolvedBlocking[],
  ) {
    const positions = new Map(
      resolved.map((entry) => [entry.participantId, entry.resolvedPosition]),
    );
    const required = shot.requiredSubjectIds ?? [];
    for (const id of required) {
      if (!positions.has(id)) {
        return {
          ready: false as const,
          reason: `Required subject "${id}" has no resolved blocking pose`,
        };
      }
    }
    const collision = collisionProbe(this.levels);
    const requiredMargin = Math.max(
      shot.safeFrame.minSubjectMarginPercent,
      viewportAspect() >= 2.1 ? 15 : 0,
    );
    const candidates = [
      shot.cameraAnchorId,
      ...(shot.alternateCameraAnchorId ? [shot.alternateCameraAnchorId] : []),
    ];
    const failures: string[] = [];
    for (const [index, anchorId] of candidates.entries()) {
      const anchor = this.levels.getCinematicAnchor(anchorId);
      const selectedFieldOfView =
        viewportAspect() < 1 && shot.safeFrame.narrowFieldOfView
          ? shot.safeFrame.narrowFieldOfView
          : (anchor.fieldOfView ?? 50);
      const cameraCast = collision.castSegment(
        new Vector3(...anchor.position),
        new Vector3(...anchor.lookAt),
        {
          radius: 0.34,
          ignoreColliderTags: ['walkable', 'ground', 'roof'],
        },
      );
      if (cameraCast.obstructed && cameraCast.fraction < 0.97) {
        failures.push(
          `${anchorId}:camera:${cameraCast.colliderId ?? 'blocked'}`,
        );
        continue;
      }
      const subjects = required.map((id) =>
        projectSubject(
          id,
          positions.get(id)!,
          anchor,
          selectedFieldOfView,
          collision,
        ),
      );
      const visuals = (shot.requiredVisualIds ?? []).map((id) =>
        projectVisual(
          id,
          this.levels.getVisualBounds(id),
          anchor,
          selectedFieldOfView,
          collision,
        ),
      );
      const invalid = subjects.find(
        ({ marginPercent, headScreenY, screenY, occluded, inFront }) =>
          !inFront ||
          marginPercent + 1e-6 < requiredMargin ||
          headScreenY < 0 ||
          screenY > 0.66 ||
          occluded,
      );
      if (!invalid) {
        const invalidVisual = visuals.find(
          ({ screenY, marginPercent, inFront, occluded }) =>
            !inFront ||
            occluded ||
            screenY > 0.66 ||
            marginPercent + 1e-6 < requiredMargin,
        );
        if (invalidVisual) {
          failures.push(`${anchorId}:${invalidVisual.visualId}`);
          continue;
        }
        return {
          ready: true as const,
          selectedCameraAnchorId: anchorId,
          selectedFieldOfView,
          usedAlternate: index > 0,
          subjects,
          visuals,
        };
      }
      failures.push(
        `${anchorId}:${invalid.participantId}${invalid.blockerId ? `:${invalid.blockerId}` : ''}`,
      );
    }
    return {
      ready: false as const,
      reason: `No safe composition for "${shot.id}" (${failures.join(', ')})`,
    };
  }

  public preflightDestinationShot(
    destination: Parameters<
      NonNullable<CinematicCompositionAdapter['preflightDestinationShot']>
    >[0],
    shot: Parameters<
      NonNullable<CinematicCompositionAdapter['preflightDestinationShot']>
    >[1],
  ) {
    try {
      const definition = this.registry.get(destination.levelId);
      const locations = new DefinitionLevelLocations(definition);
      const spawn = locations.getSpawn(destination.spawnId);
      const anchor = locations.getCinematicAnchor(shot.cameraAnchorId);
      const collision = new StaticCollisionWorld();
      collision.addDefinitions(definition.staticCollision);
      const selectedFieldOfView =
        viewportAspect() < 1 && shot.safeFrame.narrowFieldOfView
          ? shot.safeFrame.narrowFieldOfView
          : (anchor.fieldOfView ?? 50);
      const [x, y, z] = spawn.position;
      const subjects = (shot.requiredSubjectIds ?? []).map((participantId) =>
        projectSubject(
          participantId,
          { x, y, z },
          anchor,
          selectedFieldOfView,
          collision,
        ),
      );
      const requiredMargin = Math.max(
        shot.safeFrame.minSubjectMarginPercent,
        viewportAspect() >= 2.1 ? 15 : 0,
      );
      const invalid = subjects.find(
        ({ inFront, occluded, marginPercent, headScreenY, screenY }) =>
          !inFront ||
          occluded ||
          marginPercent + 1e-6 < requiredMargin ||
          headScreenY < 0 ||
          screenY > 0.66,
      );
      if (invalid) {
        return {
          ready: false as const,
          reason: `No safe destination composition for "${shot.id}"`,
        };
      }
      return {
        ready: true as const,
        selectedCameraAnchorId: anchor.id,
        selectedFieldOfView,
        usedAlternate: false,
        subjects,
        visuals: [],
      };
    } catch (error) {
      return {
        ready: false as const,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

class LevelSceneAdapter implements CinematicSceneAdapter {
  public constructor(private readonly levels: LevelSystem) {}

  public preflightPath(
    request: Parameters<CinematicSceneAdapter['preflightPath']>[0],
  ) {
    try {
      for (const id of request.visualIds) {
        if (!this.levels.hasVisual(id)) {
          throw new Error(`Required cinematic visual "${id}" is unavailable`);
        }
      }
      for (const id of request.pointIds) this.levels.getLocation(id);
      return { ready: true as const };
    } catch (error) {
      return {
        ready: false as const,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  public requestPath(
    request: Parameters<CinematicSceneAdapter['requestPath']>[0],
  ) {
    return this.levels.requestVisualPath({
      owner: `cinematic:${request.id}`,
      visualIds: request.visualIds,
      points: request.pointIds.map(
        (id) => this.levels.getLocation(id).position,
      ),
      startSeconds: request.startSeconds,
      durationSeconds: request.durationSeconds,
    });
  }
}

class ParticipantPerformanceAdapter implements CinematicPerformanceAdapter {
  public constructor(
    private readonly player: CharacterPlayerVisual,
    private readonly npcs: NpcSystem,
    private readonly playerController: PlayerControllerSystem,
    private readonly levels: LevelSystem,
  ) {}

  public preflightPerformance(request: CinematicPerformanceRequest) {
    const result = this.owner(request.participantId)?.preflightPerformance(
      controllerRequest(request),
    );
    return result?.ok
      ? { ready: true, resolution: result.resolution ?? undefined }
      : {
          ready: false,
          reason:
            result?.reason ??
            `Participant "${request.participantId}" has no performance owner`,
        };
  }

  public capturePerformanceState(participantId: string): unknown {
    const ownerToken =
      this.requireOwner(participantId).capturePerformanceState();
    if (participantId !== 'casual') return ownerToken;
    const position = this.playerController.getPlayerPosition();
    return {
      ownerToken,
      position: new Vector3(position.x, position.y, position.z),
      yaw: this.playerController.getDebugSnapshot().facingYaw,
    };
  }

  public requestPerformance(
    request: CinematicPerformanceRequest,
  ): CinematicPerformanceHandle {
    const owner = this.requireOwner(request.participantId);
    const resolved = controllerRequest(request, this.targetFacingYaw(request));
    if (request.targetMarkId)
      this.stageAtMark(request.participantId, request.targetMarkId);
    if (request.phase === 'hold') owner.holdPerformance(resolved.requestId);
    else if (request.phase === 'release')
      owner.releasePerformance(resolved.requestId, 'completed');
    else {
      const result = owner.startPerformance(resolved);
      if (!result.ok)
        throw new Error(result.reason ?? 'Performance request failed');
    }
    return {
      requestId: resolved.requestId,
      pause: () => owner.holdPerformance(resolved.requestId),
      // A held one-shot remains on its authored pose. Loop clips continue to be
      // visually safe while the deterministic cue clock is paused.
      resume: () => undefined,
      release: (reason) =>
        owner.releasePerformance(resolved.requestId, releaseReason(reason)),
    };
  }

  public restorePerformance(participantId: string, token: unknown): void {
    if (participantId === 'casual') {
      const captured = token as {
        ownerToken: ReturnType<
          CinematicPerformanceOwner['capturePerformanceState']
        >;
        position: Vector3;
        yaw: number;
      };
      this.requireOwner(participantId).restorePerformance(captured.ownerToken);
      this.playerController.teleport(captured.position, captured.yaw);
      return;
    }
    this.requireOwner(participantId).restorePerformance(
      token as ReturnType<CinematicPerformanceOwner['capturePerformanceState']>,
    );
  }

  private owner(id: string): CinematicPerformanceOwner | undefined {
    return id === 'casual' ? this.player : this.npcs.getPerformanceOwner(id);
  }

  private requireOwner(id: string): CinematicPerformanceOwner {
    const owner = this.owner(id);
    if (!owner) throw new Error(`Participant "${id}" has no performance owner`);
    return owner;
  }

  private targetFacingYaw(
    request: CinematicPerformanceRequest,
  ): number | undefined {
    const targetId = request.targetParticipantId;
    if (!targetId) return undefined;
    const source =
      request.participantId === 'casual'
        ? this.playerController.getWorldPose()
        : this.npcs.getWorldPoseSource(request.participantId)?.getWorldPose();
    const target =
      targetId === 'casual'
        ? this.playerController.getWorldPose()
        : this.npcs.getWorldPoseSource(targetId)?.getWorldPose();
    if (!source || !target) return undefined;
    const dx = target.position.x - source.position.x;
    const dz = target.position.z - source.position.z;
    return Math.hypot(dx, dz) < 1e-6 ? undefined : Math.atan2(dx, dz);
  }

  private stageAtMark(participantId: string, markId: string): void {
    const [x, y, z] = this.levels.getLocation(markId).position;
    const position = { x, y, z };
    if (participantId === 'casual') {
      this.playerController.teleport(new Vector3(x, y, z));
      return;
    }
    if (!this.npcs.setPerformancePosition(participantId, position))
      throw new Error(
        `Participant "${participantId}" cannot stage at "${markId}"`,
      );
  }
}

class LevelDestinationAdapter implements CinematicDestinationAdapter {
  public constructor(
    private readonly levels: LevelSystem,
    private readonly registry: LevelRegistry,
    private readonly player: PlayerControllerSystem,
  ) {}

  public preflightDestination(
    request: Parameters<CinematicDestinationAdapter['preflightDestination']>[0],
  ) {
    try {
      const definition = this.registry.get(request.levelId);
      const locations = new DefinitionLevelLocations(definition);
      const destinationExists = [
        ...definition.locations,
        ...definition.landmarks,
        ...definition.zones,
      ].some(({ id }) => id === request.locationId);
      if (!destinationExists)
        throw new Error(
          `Unknown destination location "${request.locationId}" in level "${definition.id}"`,
        );
      locations.getSpawn(request.spawnId);
      locations.getCinematicAnchor(request.cameraAnchorId);
      return { ready: true as const };
    } catch (error) {
      return {
        ready: false as const,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  public requestDestination(
    request: Parameters<CinematicDestinationAdapter['requestDestination']>[0],
    commitLanding?: () => void,
  ): CinematicDestinationHandle {
    let state: ReturnType<CinematicDestinationHandle['getReadiness']> = {
      state: 'pending',
    };
    let prepared: PreparedLevelTransition | undefined;
    let cancelled = false;
    let committing = false;
    const abort = new AbortController();
    void this.levels
      .prepare(request.levelId, request.spawnId)
      .then(async (handle) => {
        prepared = handle;
        if (cancelled) {
          handle.cancel();
          return;
        }
        committing = true;
        await handle.commit((context) => {
          if (cancelled)
            throw new Error('Destination transition was cancelled');
          const { spawn } = context;
          const current = this.player.getPlayerPosition();
          const prior = new Vector3(current.x, current.y, current.z);
          const priorYaw = this.player.getDebugSnapshot().facingYaw;
          context.onRollback(() => this.player.teleport(prior, priorYaw));
          this.player.teleport(
            new Vector3(...spawn.position),
            spawn.rotation?.[1] ?? 0,
          );
          commitLanding?.();
        }, abort.signal);
        committing = false;
        if (!cancelled) state = { state: 'ready' };
      })
      .catch((error: unknown) => {
        committing = false;
        if (!cancelled)
          state = {
            state: 'failed',
            reason: error instanceof Error ? error.message : String(error),
          };
      });
    return {
      getReadiness: () => state,
      pause: () => undefined,
      resume: () => undefined,
      cancel: () => {
        if (cancelled) return;
        cancelled = true;
        abort.abort();
        if (prepared && !committing) {
          try {
            prepared.cancel();
          } catch {
            // A concurrent commit owns rollback from this point.
          }
        }
      },
      dispose: () => {
        if (cancelled) return;
        cancelled = true;
        abort.abort();
        if (prepared && !committing) {
          try {
            prepared.cancel();
          } catch {
            // A concurrent commit owns rollback from this point.
          }
        }
      },
    };
  }
}

class MissionLandingAdapter implements CinematicLandingAdapter {
  private readonly committed = new Set<string>();

  public constructor(private readonly missions: MissionSystem) {}

  public preflightLanding(
    transaction: Parameters<CinematicLandingAdapter['preflightLanding']>[0],
  ) {
    return transaction.id && transaction.storyEffectIds.length > 0
      ? { ready: true as const }
      : { ready: false as const, reason: 'Landing transaction is empty' };
  }

  public commitLanding(
    transaction: Parameters<CinematicLandingAdapter['commitLanding']>[0],
  ) {
    if (this.committed.has(transaction.id)) return { committed: true };
    for (const hookId of [
      ...transaction.storyEffectIds,
      ...transaction.missionHandoffIds,
    ]) {
      this.missions.dispatch({ type: 'event-hook', hookId });
    }
    this.committed.add(transaction.id);
    return { committed: true };
  }
}

function controllerRequest(
  request: CinematicPerformanceRequest,
  targetFacingYaw?: number,
) {
  return {
    requestId: request.cueId,
    cueId: request.cueId,
    shotId: request.shotId,
    intent: request.intent,
    allowNeutralFallback:
      request.missingPerformancePolicy === 'neutral-fallback',
    movementOwnerAvailable: request.intent !== 'approach',
    targetParticipantId: request.targetParticipantId,
    targetMarkId: request.targetMarkId ?? request.propMarkId,
    targetFacingYaw,
  } as const;
}

function releaseReason(
  reason: CinematicPerformanceReleaseReason,
): PerformanceReleaseReason {
  switch (reason) {
    case 'shot-completed':
      return 'completed';
    case 'landing':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    case 'failed':
      return 'failed';
    case 'disposed':
      return 'disposed';
  }
}

function collisionProbe(levels: LevelSystem): StaticCollisionWorld {
  const collision = new StaticCollisionWorld();
  collision.addDefinitions(levels.getStaticColliders());
  return collision;
}

function worldPosition(value: Readonly<Vector3>) {
  return { x: value.x, y: value.y, z: value.z };
}

function measureClearance(
  collision: StaticCollisionWorld,
  position: Readonly<Vector3>,
  radius: number,
): number {
  const origin = new Vector3(position.x, position.y + 0.9, position.z);
  let clearance = 3;
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const target = origin
      .clone()
      .add(new Vector3(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(3));
    const cast = collision.castSegment(origin, target, {
      radius,
      ignoreColliderTags: ['walkable', 'ground', 'roof'],
    });
    clearance = Math.min(clearance, cast.fraction * 3);
  }
  return clearance;
}

function projectSubject(
  participantId: string,
  position: { readonly x: number; readonly y: number; readonly z: number },
  anchor: ReturnType<LevelSystem['getCinematicAnchor']>,
  fieldOfView: number,
  collision: StaticCollisionWorld,
): CinematicCompositionSubject {
  const camera = new Vector3(...anchor.position);
  const forward = new Vector3(...anchor.lookAt).sub(camera).normalize();
  const right = new Vector3(0, 1, 0).cross(forward).normalize();
  const up = forward.clone().cross(right).normalize();
  const aspect = viewportAspect();
  const tangent = Math.tan((fieldOfView * Math.PI) / 360);
  const project = (world: Vector3) => {
    const relative = world.sub(camera);
    const depth = relative.dot(forward);
    const projectionDepth = Math.max(0.001, depth);
    const ndcX = relative.dot(right) / (projectionDepth * tangent * aspect);
    const ndcY = relative.dot(up) / (projectionDepth * tangent);
    return { x: (ndcX + 1) / 2, y: (1 - ndcY) / 2, depth };
  };
  const centerWorld = new Vector3(position.x, position.y + 0.95, position.z);
  const headWorld = new Vector3(position.x, position.y + 1.65, position.z);
  const center = project(centerWorld.clone());
  const head = project(headWorld.clone());
  const cast = collision.castSegment(camera, headWorld, {
    radius: 0.03,
    ignoreColliderTags: ['walkable', 'ground', 'roof'],
  });
  const marginPercent =
    Math.min(center.x, 1 - center.x, head.y, 1 - center.y) * 100;
  return {
    participantId,
    screenX: center.x,
    screenY: center.y,
    headScreenY: head.y,
    marginPercent,
    inFront: center.depth > 0 && head.depth > 0,
    occluded: cast.obstructed && cast.fraction < 0.97,
    blockerId: cast.colliderId,
  };
}

function projectVisual(
  visualId: string,
  bounds: {
    readonly center: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
    };
    readonly size: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
    };
  },
  anchor: ReturnType<LevelSystem['getCinematicAnchor']>,
  fieldOfView: number,
  collision: StaticCollisionWorld,
): CinematicCompositionVisual {
  const camera = new Vector3(...anchor.position);
  const forward = new Vector3(...anchor.lookAt).sub(camera).normalize();
  const right = new Vector3(0, 1, 0).cross(forward).normalize();
  const up = forward.clone().cross(right).normalize();
  const center = new Vector3(bounds.center.x, bounds.center.y, bounds.center.z);
  const relative = center.clone().sub(camera);
  const rawDepth = relative.dot(forward);
  const depth = Math.max(0.001, rawDepth);
  const tangent = Math.tan((fieldOfView * Math.PI) / 360);
  const screenX =
    (relative.dot(right) / (depth * tangent * viewportAspect()) + 1) / 2;
  const screenY = (1 - relative.dot(up) / (depth * tangent)) / 2;
  const half = new Vector3(
    bounds.size.x,
    bounds.size.y,
    bounds.size.z,
  ).multiplyScalar(0.5);
  const samples = [
    center,
    center.clone().add(new Vector3(half.x, half.y, half.z)),
    center.clone().add(new Vector3(-half.x, half.y, -half.z)),
    center.clone().add(new Vector3(half.x, -half.y, -half.z)),
    center.clone().add(new Vector3(-half.x, -half.y, half.z)),
  ];
  const casts = samples.map((sample) =>
    collision.castSegment(camera, sample, {
      radius: 0.02,
      ignoreColliderTags: ['walkable', 'ground', 'roof'],
    }),
  );
  const occluded = casts.every(
    (cast) => cast.obstructed && cast.fraction < 0.97,
  );
  const blockerId = casts.find(
    (cast) => cast.obstructed && cast.fraction < 0.97,
  )?.colliderId;
  return {
    visualId,
    screenX,
    screenY,
    marginPercent: Math.min(screenX, 1 - screenX, screenY, 1 - screenY) * 100,
    inFront: rawDepth > 0,
    occluded,
    blockerId,
  };
}

function viewportAspect(): number {
  return typeof window === 'undefined' || window.innerHeight <= 0
    ? 16 / 9
    : window.innerWidth / window.innerHeight;
}
