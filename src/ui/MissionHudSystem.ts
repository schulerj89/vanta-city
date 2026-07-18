import { Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';
import type { GameSystem } from '../core/lifecycle';
import type { FrameTime } from '../core/time';
import type { MissionSystem } from '../missions/MissionSystem';
import type {
  MissionNotificationKind,
  MissionSystemSnapshot,
} from '../missions/MissionSystem';
import type { MissionHighlightSnapshot } from '../missions/MissionHighlight';
import type { CollisionWorld } from '../physics/CollisionWorld';
import type { ScreenSpaceLayoutSystem } from './ScreenSpaceLayoutSystem';
import type { LevelDefinition } from '../world/LevelDefinition';
import type { WorldPosition } from '../world/Spatial';

export interface MissionHudSnapshot {
  readonly objectiveVisible: boolean;
  readonly notificationVisible: boolean;
  readonly worldIndicatorVisible: boolean;
  readonly worldIndicatorOccluded: boolean;
  readonly missionId: string | undefined;
  readonly objectiveId: string | undefined;
  readonly notificationId: string | undefined;
  readonly worldTargetReferenceId: string | undefined;
  readonly worldTargetScreen:
    { readonly x: number; readonly y: number } | undefined;
}

export interface MissionHudLevelSource {
  readonly activeLevel: LevelDefinition | undefined;
}

const notificationLifetime = 4.5;

/** Three-zone mission projection driven only by the public mission snapshot. */
export class MissionHudSystem implements GameSystem {
  public readonly id = 'mission-hud';
  public readonly updateMode = 'always' as const;

  private readonly objective = document.createElement('section');
  private readonly objectiveKicker = document.createElement('p');
  private readonly missionTitle = document.createElement('strong');
  private readonly objectiveText = document.createElement('p');
  private readonly notification = document.createElement('section');
  private readonly notificationKicker = document.createElement('strong');
  private readonly notificationText = document.createElement('span');
  private readonly worldIndicator = document.createElement('div');
  private readonly worldLabel = document.createElement('span');
  private snapshot: MissionSystemSnapshot;
  private unsubscribe: (() => void) | undefined;
  private notificationRemaining = 0;
  private shownNotificationId: string | undefined;
  private worldIndicatorOccluded = false;
  private worldTargetScreen: { x: number; y: number } | undefined;

  public constructor(
    layout: ScreenSpaceLayoutSystem,
    private readonly missions: MissionSystem,
    private readonly level: MissionHudLevelSource,
    private readonly camera: PerspectiveCamera,
    private readonly collision: Pick<CollisionWorld, 'castSegment'>,
  ) {
    this.snapshot = missions.getSnapshot();
    this.objective.className = 'mission-objective-hud';
    this.objective.hidden = true;
    this.objective.setAttribute('role', 'region');
    this.objective.setAttribute('aria-label', 'Current mission objective');
    this.objectiveKicker.className = 'mission-objective-hud__kicker';
    this.missionTitle.className = 'mission-objective-hud__title';
    this.objectiveText.className = 'mission-objective-hud__objective';
    this.objective.append(
      this.objectiveKicker,
      this.missionTitle,
      this.objectiveText,
    );

    this.notification.className = 'mission-notification';
    this.notification.hidden = true;
    this.notification.setAttribute('role', 'status');
    this.notification.setAttribute('aria-live', 'polite');
    this.notificationKicker.className = 'mission-notification__kicker';
    this.notificationText.className = 'mission-notification__text';
    this.notification.append(this.notificationKicker, this.notificationText);

    this.worldIndicator.className = 'mission-world-indicator';
    this.worldIndicator.hidden = true;
    this.worldIndicator.setAttribute('aria-hidden', 'true');
    const marker = document.createElement('span');
    marker.className = 'mission-world-indicator__marker';
    this.worldLabel.className = 'mission-world-indicator__label';
    this.worldIndicator.append(marker, this.worldLabel);

    layout.zone('objectives').append(this.objective);
    layout.zone('notifications').append(this.notification);
    layout.zone('world-indicator').append(this.worldIndicator);
  }

  public init(): void {
    this.unsubscribe = this.missions.events.on('changed', (snapshot) =>
      this.sync(snapshot),
    );
    this.sync(this.missions.getSnapshot());
  }

  public update(time: FrameTime): void {
    if (this.notificationRemaining > 0) {
      this.notificationRemaining = Math.max(
        0,
        this.notificationRemaining - time.delta,
      );
      if (this.notificationRemaining === 0) this.notification.hidden = true;
    }
    this.updateWorldIndicator();
  }

  public getSnapshot(): MissionHudSnapshot {
    const active = this.snapshot.missions.find(
      ({ id }) => id === this.snapshot.activeMissionId,
    );
    return {
      objectiveVisible: this.objective.isConnected && !this.objective.hidden,
      notificationVisible:
        this.notification.isConnected && !this.notification.hidden,
      worldIndicatorVisible:
        this.worldIndicator.isConnected && !this.worldIndicator.hidden,
      worldIndicatorOccluded: this.worldIndicatorOccluded,
      missionId: active?.id,
      objectiveId: active?.currentObjectiveId,
      notificationId: this.shownNotificationId,
      worldTargetReferenceId: this.activeWorldHighlight()?.target.referenceId,
      worldTargetScreen: this.worldTargetScreen
        ? { ...this.worldTargetScreen }
        : undefined,
    };
  }

  public dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.objective.remove();
    this.notification.remove();
    this.worldIndicator.remove();
  }

  private sync(snapshot: MissionSystemSnapshot): void {
    this.snapshot = snapshot;
    const active = snapshot.missions.find(
      ({ id }) => id === snapshot.activeMissionId,
    );
    const activeObjective = active?.objectives.find(
      ({ status }) => status === 'active',
    );
    this.objective.hidden = !active || !activeObjective;
    if (active && activeObjective) {
      const completed = active.objectives.filter(
        ({ status }) => status === 'completed',
      ).length;
      this.objectiveKicker.textContent = `MISSION · ${completed + 1} / ${active.objectives.length}`;
      this.missionTitle.textContent = active.title;
      this.objectiveText.textContent = activeObjective.summary;
    }
    const notification = snapshot.notification;
    if (notification && notification.id !== this.shownNotificationId) {
      this.shownNotificationId = notification.id;
      this.notificationRemaining = notificationLifetime;
      this.notification.hidden = false;
      this.notification.dataset.kind = notification.kind;
      const failure = notification.kind === 'failed';
      this.notification.setAttribute('role', failure ? 'alert' : 'status');
      this.notification.setAttribute(
        'aria-live',
        failure ? 'assertive' : 'polite',
      );
      this.notificationKicker.textContent = notificationLabel(
        notification.kind,
      );
      this.notificationText.textContent = notification.message;
    }
    const world = this.activeWorldHighlight();
    this.worldLabel.textContent = world?.label ?? '';
    if (!world) this.hideWorldIndicator();
  }

  private updateWorldIndicator(): void {
    const highlight = this.activeWorldHighlight();
    const level = this.level.activeLevel;
    const target =
      highlight && level
        ? resolveHighlightPosition(highlight, level)
        : undefined;
    if (!highlight || !target) {
      this.hideWorldIndicator();
      return;
    }
    const world = new Vector3(target.x, target.y + 1.6, target.z);
    this.camera.updateMatrixWorld(true);
    const cameraPosition = this.camera.getWorldPosition(new Vector3());
    const hit = this.collision.castSegment(cameraPosition, world, {
      radius: 0.02,
    });
    this.worldIndicatorOccluded = hit.obstructed && hit.fraction < 0.98;
    const projected = world.clone().project(this.camera);
    const visible =
      !this.worldIndicatorOccluded &&
      projected.z >= -1 &&
      projected.z <= 1 &&
      Math.abs(projected.x) <= 1 &&
      Math.abs(projected.y) <= 1;
    if (!visible) {
      this.hideWorldIndicator(this.worldIndicatorOccluded);
      return;
    }
    const width = this.worldIndicator.parentElement?.clientWidth ?? 0;
    const height = this.worldIndicator.parentElement?.clientHeight ?? 0;
    const x = ((projected.x + 1) / 2) * width;
    const y = ((1 - projected.y) / 2) * height;
    this.worldTargetScreen = { x, y };
    this.worldIndicator.hidden = false;
    this.worldIndicator.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;
  }

  private activeWorldHighlight(): MissionHighlightSnapshot | undefined {
    return this.snapshot.highlights
      .filter(({ channels }) => channels.includes('world'))
      .sort((left, right) =>
        left.priority === right.priority
          ? left.id.localeCompare(right.id)
          : left.priority === 'primary'
            ? -1
            : 1,
      )[0];
  }

  private hideWorldIndicator(occluded = false): void {
    this.worldIndicator.hidden = true;
    this.worldIndicatorOccluded = occluded;
    this.worldTargetScreen = undefined;
  }
}

function resolveHighlightPosition(
  highlight: MissionHighlightSnapshot,
  level: LevelDefinition,
): WorldPosition | undefined {
  const { kind, referenceId } = highlight.target;
  const entry =
    kind === 'spawn' || kind === 'entity'
      ? level.spawns.find(({ id }) => id === referenceId)
      : kind === 'interaction' || kind === 'location'
        ? level.locations.find(({ id }) => id === referenceId)
        : kind === 'trigger'
          ? level.triggers.find(({ id }) => id === referenceId)
          : level.landmarks.find(({ id }) => id === referenceId);
  return entry
    ? { x: entry.position[0], y: entry.position[1], z: entry.position[2] }
    : undefined;
}

function notificationLabel(kind: MissionNotificationKind): string {
  switch (kind) {
    case 'started':
      return 'MISSION STARTED';
    case 'objective-completed':
      return 'OBJECTIVE UPDATED';
    case 'completed':
      return 'MISSION COMPLETE';
    case 'cancelled':
      return 'MISSION CANCELLED';
    case 'failed':
      return 'MISSION FAILED';
    case 'retry-ready':
      return 'MISSION RETRY';
  }
}
