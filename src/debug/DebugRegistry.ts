export type DebugValue = string | number | boolean | null | undefined;

/**
 * One shared information architecture keeps registrations predictable. Values
 * belong to the subsystem they describe; every mutating toggle or command goes
 * in Commands / Actions so passive observation is visually unambiguous.
 */
export const debugSections = {
  player: 'Player / Coordinates',
  input: 'Input / Ownership',
  collision: 'Collision / Physics',
  camera: 'Camera',
  world: 'World / Level / Spawns',
  characters: 'Characters / Assets',
  interactions: 'Interactions',
  dialogue: 'Dialogue / Conversation',
  runtime: 'Runtime / State',
  actions: 'Commands / Actions',
} as const;

export const debugSectionOrder: readonly string[] =
  Object.values(debugSections);

export interface DebugValueRegistration {
  readonly id: string;
  readonly label: string;
  readonly group?: string;
  readonly read: () => DebugValue;
}

export interface DebugToggleRegistration {
  readonly id: string;
  readonly label: string;
  readonly group?: string;
  readonly initialValue?: boolean;
  readonly onChange?: (enabled: boolean) => void;
}

export interface DebugCommandRegistration {
  readonly id: string;
  readonly label: string;
  readonly group?: string;
  readonly argumentLabel?: string;
  readonly run: (argument?: string) => void | Promise<void>;
}

export interface DebugToggleSnapshot {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly enabled: boolean;
}

export interface DebugCommandSnapshot {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly argumentLabel?: string;
}

export type DebugUnregister = () => void;

export interface DebugRegistryChange {
  readonly kind: 'structure' | 'toggle';
  readonly id: string;
}

const DEFAULT_VALUE_GROUP = debugSections.runtime;
const DEFAULT_CONTROL_GROUP = debugSections.actions;

export class DebugRegistry {
  private readonly values = new Map<string, DebugValueRegistration>();
  private readonly toggles = new Map<
    string,
    DebugToggleRegistration & { enabled: boolean }
  >();
  private readonly commands = new Map<string, DebugCommandRegistration>();
  private readonly listeners = new Set<(change: DebugRegistryChange) => void>();

  public registerValue(registration: DebugValueRegistration): DebugUnregister {
    this.assertAvailable(registration.id);
    this.values.set(registration.id, registration);
    this.notify({ kind: 'structure', id: registration.id });
    return this.unregister(this.values, registration.id, registration);
  }

  public registerToggle(
    registration: DebugToggleRegistration,
  ): DebugUnregister {
    this.assertAvailable(registration.id);
    const entry = {
      ...registration,
      enabled: registration.initialValue ?? false,
    };
    this.toggles.set(registration.id, entry);
    this.notify({ kind: 'structure', id: registration.id });
    return this.unregister(this.toggles, registration.id, entry);
  }

  public registerCommand(
    registration: DebugCommandRegistration,
  ): DebugUnregister {
    this.assertAvailable(registration.id);
    this.commands.set(registration.id, registration);
    this.notify({ kind: 'structure', id: registration.id });
    return this.unregister(this.commands, registration.id, registration);
  }

  public readValues(): readonly (DebugValueRegistration & {
    readonly value: DebugValue;
    readonly group: string;
  })[] {
    return [...this.values.values()].map((entry) => ({
      ...entry,
      group: entry.group ?? DEFAULT_VALUE_GROUP,
      value: entry.read(),
    }));
  }

  public listToggles(): readonly DebugToggleSnapshot[] {
    return [...this.toggles.values()].map((entry) => ({
      id: entry.id,
      label: entry.label,
      group: entry.group ?? DEFAULT_CONTROL_GROUP,
      enabled: entry.enabled,
    }));
  }

  public listCommands(): readonly DebugCommandSnapshot[] {
    return [...this.commands.values()].map((entry) => ({
      id: entry.id,
      label: entry.label,
      group: entry.group ?? DEFAULT_CONTROL_GROUP,
      ...(entry.argumentLabel === undefined
        ? {}
        : { argumentLabel: entry.argumentLabel }),
    }));
  }

  public isToggleEnabled(id: string): boolean {
    return this.requireToggle(id).enabled;
  }

  public setToggle(id: string, enabled: boolean): void {
    const toggle = this.requireToggle(id);
    if (toggle.enabled === enabled) return;
    toggle.onChange?.(enabled);
    toggle.enabled = enabled;
    this.notify({ kind: 'toggle', id });
  }

  public toggle(id: string): boolean {
    const enabled = !this.requireToggle(id).enabled;
    this.setToggle(id, enabled);
    return enabled;
  }

  public async executeCommand(id: string, argument?: string): Promise<void> {
    const command = this.commands.get(id);
    if (!command) throw new Error(`Unknown debug command: ${id}`);
    await command.run(argument);
  }

  public subscribe(
    listener: (change: DebugRegistryChange) => void,
  ): DebugUnregister {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private assertAvailable(id: string): void {
    if (this.values.has(id) || this.toggles.has(id) || this.commands.has(id)) {
      throw new Error(`Debug registration id already exists: ${id}`);
    }
  }

  private requireToggle(
    id: string,
  ): DebugToggleRegistration & { enabled: boolean } {
    const toggle = this.toggles.get(id);
    if (!toggle) throw new Error(`Unknown debug toggle: ${id}`);
    return toggle;
  }

  private unregister<T>(
    collection: Map<string, T>,
    id: string,
    registration: T,
  ): DebugUnregister {
    return () => {
      if (collection.get(id) !== registration) return;
      collection.delete(id);
      this.notify({ kind: 'structure', id });
    };
  }

  private notify(change: DebugRegistryChange): void {
    for (const listener of [...this.listeners]) listener(change);
  }
}
