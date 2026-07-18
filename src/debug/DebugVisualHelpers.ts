import type { DebugUnregister } from './DebugRegistry';
import { DebugRegistry, debugSections } from './DebugRegistry';

export const standardVisualHelpers = {
  collision: 'Collision geometry',
  triggers: 'Trigger volumes',
  entityIds: 'Entity identifiers',
  spawnPoints: 'Spawn points',
  interactionRanges: 'Interaction ranges',
  navigation: 'Navigation / movement',
  characterAlignment: 'Character grounding / alignment',
  combatVolumes: 'Combat engagement / hit volumes',
} as const;

export type StandardVisualHelper = keyof typeof standardVisualHelpers;

const visualHelperSections: Record<StandardVisualHelper, string> = {
  collision: debugSections.collision,
  triggers: debugSections.interactions,
  entityIds: debugSections.world,
  spawnPoints: debugSections.world,
  interactionRanges: debugSections.interactions,
  navigation: debugSections.player,
  characterAlignment: debugSections.assets,
  combatVolumes: debugSections.combat,
};

export interface DebugVisualHelper {
  setVisible(visible: boolean): void;
}

export class DebugVisualHelpers {
  private readonly providers = new Map<
    StandardVisualHelper,
    Set<DebugVisualHelper>
  >();
  private readonly unregisterToggles: DebugUnregister[];

  public constructor(private readonly registry: DebugRegistry) {
    this.unregisterToggles = (
      Object.entries(standardVisualHelpers) as [StandardVisualHelper, string][]
    ).map(([id, label]) =>
      registry.registerToggle({
        id: this.toggleId(id),
        label,
        group: visualHelperSections[id],
        onChange: (enabled) => this.apply(id, enabled),
      }),
    );
  }

  public register(
    id: StandardVisualHelper,
    helper: DebugVisualHelper,
  ): DebugUnregister {
    const helpers = this.providers.get(id) ?? new Set();
    helpers.add(helper);
    this.providers.set(id, helpers);
    helper.setVisible(this.isEnabled(id));
    return () => {
      helper.setVisible(false);
      helpers.delete(helper);
      if (helpers.size === 0) this.providers.delete(id);
    };
  }

  public isEnabled(id: StandardVisualHelper): boolean {
    return this.registry.isToggleEnabled(this.toggleId(id));
  }

  public toggle(id: StandardVisualHelper): boolean {
    return this.registry.toggle(this.toggleId(id));
  }

  public dispose(): void {
    for (const helpers of this.providers.values()) {
      for (const helper of helpers) helper.setVisible(false);
    }
    this.providers.clear();
    for (const unregister of this.unregisterToggles) unregister();
  }

  private apply(id: StandardVisualHelper, enabled: boolean): void {
    for (const helper of this.providers.get(id) ?? []) {
      helper.setVisible(enabled);
    }
  }

  private toggleId(id: StandardVisualHelper): string {
    return `visual.${id}`;
  }
}
