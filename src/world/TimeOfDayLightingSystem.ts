import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Scene,
} from 'three';
import type { AccessibilityPreferenceStore } from '../accessibility/AccessibilityPreferences';
import type { GameSystem } from '../core/lifecycle';
import type { FrameTime } from '../core/time';
import type { DebugRegistry, DebugUnregister } from '../debug/DebugRegistry';
import { debugSections } from '../debug/DebugRegistry';
import type { LevelDefinition, LampFixtureDefinition } from './LevelDefinition';
import type { LevelSystem } from './LevelSystem';
import type { WorldEvents } from './WorldEvents';
import type { EventBus } from '../core/events';

export type TimeOfDayPreset = 'day' | 'night';

export interface TimeOfDaySnapshot {
  readonly preset: TimeOfDayPreset | 'custom';
  readonly hour: number;
  readonly targetHour: number;
  readonly nightBlend: number;
  readonly transitioning: boolean;
  readonly transitionProgress: number;
  readonly reducedMotion: boolean;
  readonly localLightCount: number;
  readonly emissiveFixtureCount: number;
  readonly maxLocalLights: number;
  readonly shadowsEnabled: false;
  readonly pauseBehavior: 'freeze';
  readonly dialogueBehavior: 'continue';
}

interface Transition {
  readonly startHour: number;
  readonly startNightBlend: number;
  readonly targetHour: number;
  readonly targetNightBlend: number;
  elapsed: number;
}

interface MaterialState {
  readonly emissive: Color;
  readonly emissiveIntensity: number;
}

const DAY_HOUR = 13;
const NIGHT_HOUR = 22;
const TRANSITION_SECONDS = 1.2;
const MAX_LOCAL_LIGHTS = 4;
const lampColor = new Color(0xffc36b);

const day = {
  sky: new Color(0x92a8b8),
  hemisphereSky: new Color(0xbad7ed),
  hemisphereGround: new Color(0x35434a),
  hemisphereIntensity: 1.45,
  key: new Color(0xffedcf),
  keyIntensity: 2.5,
} as const;

const night = {
  sky: new Color(0x07111f),
  hemisphereSky: new Color(0x6881aa),
  hemisphereGround: new Color(0x111722),
  hemisphereIntensity: 1.12,
  key: new Color(0x9bb7e6),
  keyIntensity: 0.85,
} as const;

/**
 * Authoritative compact time-of-day presentation. Simulation lifecycle owns
 * transition timing, so pause/character-select freeze it while dialogue and
 * cinematics continue to update normally.
 */
export class TimeOfDayLightingSystem implements GameSystem {
  public readonly id = 'time-of-day-lighting';

  private readonly root = new Group();
  private readonly lampLights = new Group();
  private readonly hemisphere = new HemisphereLight();
  private readonly key = new DirectionalLight();
  private readonly materialStates = new Map<
    MeshStandardMaterial,
    MaterialState
  >();
  private readonly debugUnregister: DebugUnregister[] = [];
  private unsubscribeLevel: (() => void)[] = [];
  private unsubscribeAccessibility: (() => void) | undefined;
  private transition: Transition | undefined;
  private currentHour: number;
  private currentNightBlend: number;
  private targetHour: number;
  private reducedMotion: boolean;
  private emissiveFixtureCount = 0;
  private previousBackground: Scene['background'] = null;

  public constructor(
    private readonly scene: Scene,
    private readonly levels: Pick<LevelSystem, 'activeLevel'>,
    private readonly worldEvents: EventBus<WorldEvents>,
    private readonly accessibility: AccessibilityPreferenceStore,
    private readonly debug?: DebugRegistry,
    initialHour = DAY_HOUR,
  ) {
    const hour = normalizeHour(initialHour);
    this.currentHour = hour;
    this.targetHour = hour;
    this.currentNightBlend = nightBlendForHour(hour);
    this.reducedMotion = accessibility.current.reducedCameraMotion;
    this.root.name = 'environment:time-of-day';
    this.lampLights.name = 'environment:lamp-lights';
    this.hemisphere.name = 'environment:hemisphere';
    this.key.name = 'environment:key';
    this.key.position.set(18, 26, 12);
    this.key.castShadow = false;
    this.root.add(this.hemisphere, this.key, this.lampLights);
  }

  public init(): void {
    this.previousBackground = this.scene.background;
    this.scene.add(this.root);
    this.bindLevel(this.levels.activeLevel);
    this.unsubscribeLevel = [
      this.worldEvents.on('level:loaded', ({ level }) => this.bindLevel(level)),
      this.worldEvents.on('level:unloaded', () => this.clearLevelLighting()),
    ];
    this.unsubscribeAccessibility = this.accessibility.subscribe(
      ({ reducedCameraMotion }) => {
        this.reducedMotion = reducedCameraMotion;
        if (reducedCameraMotion && this.transition) this.finishTransition();
      },
    );
    this.registerDebug();
    this.applyLighting();
  }

  public update(time: FrameTime): void {
    const transition = this.transition;
    if (!transition) return;
    transition.elapsed = Math.min(
      TRANSITION_SECONDS,
      transition.elapsed + time.delta,
    );
    const progress = transition.elapsed / TRANSITION_SECONDS;
    const eased = progress * progress * (3 - 2 * progress);
    this.currentHour = lerp(transition.startHour, transition.targetHour, eased);
    this.currentNightBlend = lerp(
      transition.startNightBlend,
      transition.targetNightBlend,
      eased,
    );
    if (progress >= 1) this.transition = undefined;
    this.applyLighting();
  }

  public setPreset(preset: TimeOfDayPreset): void {
    this.setTime(preset === 'day' ? DAY_HOUR : NIGHT_HOUR);
  }

  public setTime(hour: number): void {
    if (!Number.isFinite(hour)) throw new Error('Time must be a finite hour');
    const targetHour = normalizeHour(hour);
    this.targetHour = targetHour;
    const targetNightBlend = nightBlendForHour(targetHour);
    if (this.reducedMotion) {
      this.currentHour = targetHour;
      this.currentNightBlend = targetNightBlend;
      this.transition = undefined;
      this.applyLighting();
      return;
    }
    this.transition = {
      startHour: this.currentHour,
      startNightBlend: this.currentNightBlend,
      targetHour,
      targetNightBlend,
      elapsed: 0,
    };
  }

  public getSnapshot(): TimeOfDaySnapshot {
    const progress = this.transition
      ? this.transition.elapsed / TRANSITION_SECONDS
      : 1;
    return {
      preset:
        this.targetHour === DAY_HOUR
          ? 'day'
          : this.targetHour === NIGHT_HOUR
            ? 'night'
            : 'custom',
      hour: normalizeHour(this.currentHour),
      targetHour: this.targetHour,
      nightBlend: this.currentNightBlend,
      transitioning: this.transition !== undefined,
      transitionProgress: progress,
      reducedMotion: this.reducedMotion,
      localLightCount: this.lampLights.children.length,
      emissiveFixtureCount: this.emissiveFixtureCount,
      maxLocalLights: MAX_LOCAL_LIGHTS,
      shadowsEnabled: false,
      pauseBehavior: 'freeze',
      dialogueBehavior: 'continue',
    };
  }

  public dispose(): void {
    for (const unregister of this.debugUnregister.splice(0)) unregister();
    for (const unsubscribe of this.unsubscribeLevel.splice(0)) unsubscribe();
    this.unsubscribeAccessibility?.();
    this.unsubscribeAccessibility = undefined;
    this.clearLevelLighting();
    this.scene.background = this.previousBackground;
    this.scene.remove(this.root);
    this.root.clear();
    this.transition = undefined;
  }

  private finishTransition(): void {
    const transition = this.transition;
    if (!transition) return;
    this.currentHour = transition.targetHour;
    this.currentNightBlend = transition.targetNightBlend;
    this.transition = undefined;
    this.applyLighting();
  }

  private bindLevel(level: LevelDefinition | undefined): void {
    this.clearLevelLighting();
    if (!level) return;
    for (const fixture of (level.lighting?.lamps ?? []).slice(
      0,
      MAX_LOCAL_LIGHTS,
    )) {
      this.bindFixture(fixture);
    }
    this.applyLighting();
  }

  private bindFixture(fixture: LampFixtureDefinition): void {
    const light = new PointLight(lampColor, 0, 12, 2);
    light.name = `environment:${fixture.id}`;
    light.position.set(...fixture.position);
    light.castShadow = false;
    this.lampLights.add(light);

    const visual = this.scene.getObjectByName(`visual:${fixture.visualId}`);
    let bound = false;
    visual?.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        if (
          !(material instanceof MeshStandardMaterial) ||
          material.name !== fixture.emissiveMaterialName
        ) {
          continue;
        }
        if (!this.materialStates.has(material)) {
          this.materialStates.set(material, {
            emissive: material.emissive.clone(),
            emissiveIntensity: material.emissiveIntensity,
          });
        }
        bound = true;
      }
    });
    if (bound) this.emissiveFixtureCount += 1;
  }

  private clearLevelLighting(): void {
    this.lampLights.clear();
    for (const [material, state] of this.materialStates) {
      material.emissive.copy(state.emissive);
      material.emissiveIntensity = state.emissiveIntensity;
    }
    this.materialStates.clear();
    this.emissiveFixtureCount = 0;
  }

  private applyLighting(): void {
    const blend = this.currentNightBlend;
    this.scene.background = day.sky.clone().lerp(night.sky, blend);
    this.hemisphere.color.copy(
      day.hemisphereSky.clone().lerp(night.hemisphereSky, blend),
    );
    this.hemisphere.groundColor.copy(
      day.hemisphereGround.clone().lerp(night.hemisphereGround, blend),
    );
    this.hemisphere.intensity = lerp(
      day.hemisphereIntensity,
      night.hemisphereIntensity,
      blend,
    );
    this.key.color.copy(day.key.clone().lerp(night.key, blend));
    this.key.intensity = lerp(day.keyIntensity, night.keyIntensity, blend);
    for (const light of this.lampLights.children) {
      if (light instanceof PointLight) light.intensity = 180 * blend;
    }
    for (const material of this.materialStates.keys()) {
      material.emissive.copy(lampColor);
      material.emissiveIntensity = 2.4 * blend;
    }
  }

  private registerDebug(): void {
    if (!this.debug) return;
    this.debugUnregister.push(
      this.debug.registerValue({
        id: 'world.time-of-day',
        label: 'Time of day',
        group: debugSections.lighting,
        read: () => {
          const snapshot = this.getSnapshot();
          return `${snapshot.hour.toFixed(2)}h · ${snapshot.preset}${snapshot.transitioning ? ` · ${(snapshot.transitionProgress * 100).toFixed(0)}%` : ''}`;
        },
      }),
      this.debug.registerValue({
        id: 'world.lighting',
        label: 'Environment lighting',
        group: debugSections.lighting,
        read: () => {
          const snapshot = this.getSnapshot();
          return `night ${snapshot.nightBlend.toFixed(2)} · lamps ${snapshot.localLightCount}/${snapshot.maxLocalLights} · emissive ${snapshot.emissiveFixtureCount} · shadows off`;
        },
      }),
      this.debug.registerCommand({
        id: 'time.day',
        label: 'Set daytime',
        group: debugSections.lighting,
        run: () => this.setPreset('day'),
      }),
      this.debug.registerCommand({
        id: 'time.night',
        label: 'Set nighttime',
        group: debugSections.lighting,
        run: () => this.setPreset('night'),
      }),
      this.debug.registerCommand({
        id: 'time.set',
        label: 'Set time of day',
        group: debugSections.lighting,
        argumentLabel: 'hour (0–24)',
        run: (value) => {
          const hour = Number(value);
          if (
            value?.trim() === '' ||
            !Number.isFinite(hour) ||
            hour < 0 ||
            hour > 24
          ) {
            throw new Error('Expected a finite hour from 0 through 24');
          }
          this.setTime(hour);
        },
      }),
    );
  }
}

export function nightBlendForHour(hour: number): number {
  const normalized = normalizeHour(hour);
  if (normalized < 5 || normalized >= 20) return 1;
  if (normalized < 7) return 1 - smoothstep((normalized - 5) / 2);
  if (normalized < 17) return 0;
  return smoothstep((normalized - 17) / 3);
}

function normalizeHour(hour: number): number {
  return ((hour % 24) + 24) % 24;
}

function smoothstep(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}
