import { Vector3 } from 'three';
import type { MissionSystem } from '../missions/MissionSystem';
import type { NpcSystem } from '../npcs/NpcSystem';
import type { CharacterPlayerVisual } from '../player/CharacterPlayerVisual';
import type { PlayerControllerSystem } from '../player/PlayerControllerSystem';
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
  CinematicPerformanceAdapter,
  CinematicPerformanceHandle,
  CinematicPerformanceReleaseReason,
  CinematicRuntimeAdapters,
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
    destination: new LevelDestinationAdapter(
      dependencies.levels,
      dependencies.registry,
      dependencies.player,
    ),
    landing: new MissionLandingAdapter(dependencies.missions),
  };
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
    const resolved = controllerRequest(request);
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
  ): CinematicDestinationHandle {
    let state: ReturnType<CinematicDestinationHandle['getReadiness']> = {
      state: 'pending',
    };
    let prepared: PreparedLevelTransition | undefined;
    let cancelled = false;
    void this.levels
      .prepare(request.levelId, request.spawnId)
      .then(async (handle) => {
        prepared = handle;
        if (cancelled) {
          handle.cancel();
          return;
        }
        const commit = handle.commit.bind(handle);
        await commit((context) => {
          const { spawn } = context;
          const current = this.player.getPlayerPosition();
          const prior = new Vector3(current.x, current.y, current.z);
          const priorYaw = this.player.getDebugSnapshot().facingYaw;
          context.onRollback(() => this.player.teleport(prior, priorYaw));
          this.player.teleport(
            new Vector3(...spawn.position),
            spawn.rotation?.[1] ?? 0,
          );
        });
        if (!cancelled) state = { state: 'ready' };
      })
      .catch((error: unknown) => {
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
        cancelled = true;
        if (this.levels.getPreparationSnapshot().state === 'ready')
          prepared?.cancel();
      },
      dispose: () => undefined,
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

function controllerRequest(request: CinematicPerformanceRequest) {
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
