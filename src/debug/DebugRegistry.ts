export type DebugValue = string | number | boolean | null | undefined;

/** One shared information architecture keeps subsystem registrations predictable. */
export const debugSections = {
  player: 'Player',
  input: 'Input / Ownership',
  collision: 'Collision / Physics',
  camera: 'Camera',
  world: 'World',
  lighting: 'Lighting',
  traffic: 'Traffic',
  combat: 'Combat',
  interactions: 'Interactions',
  dialogue: 'Dialogue / Conversation',
  missions: 'Mission / Objectives',
  assets: 'Assets',
  /** @deprecated Register controls in their owning subsystem section. */
  characters: 'Assets',
  runtime: 'Runtime / State',
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

export interface DebugNumberRegistration {
  readonly id: string;
  readonly label: string;
  readonly group?: string;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly read: () => number;
  readonly onChange: (value: number) => void | Promise<void>;
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

export interface DebugNumberSnapshot {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly value: number;
}

export type DebugUnregister = () => void;

export interface DebugRegistryChange {
  readonly kind: 'structure' | 'toggle' | 'number';
  readonly id: string;
}

const DEFAULT_VALUE_GROUP = debugSections.runtime;
const DEFAULT_CONTROL_GROUP = debugSections.runtime;

export class DebugRegistry {
  private readonly values = new Map<string, DebugValueRegistration>();
  private readonly toggles = new Map<
    string,
    DebugToggleRegistration & { enabled: boolean }
  >();
  private readonly commands = new Map<string, DebugCommandRegistration>();
  private readonly numbers = new Map<string, DebugNumberRegistration>();
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

  public registerNumber(
    registration: DebugNumberRegistration,
  ): DebugUnregister {
    this.assertAvailable(registration.id);
    if (
      !Number.isFinite(registration.min) ||
      !Number.isFinite(registration.max) ||
      registration.min >= registration.max ||
      (registration.step !== undefined &&
        (!Number.isFinite(registration.step) || registration.step <= 0))
    ) {
      throw new Error(`Invalid debug number bounds: ${registration.id}`);
    }
    this.numbers.set(registration.id, registration);
    this.notify({ kind: 'structure', id: registration.id });
    return this.unregister(this.numbers, registration.id, registration);
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

  public listNumbers(): readonly DebugNumberSnapshot[] {
    return [...this.numbers.values()].map((entry) => ({
      id: entry.id,
      label: entry.label,
      group: entry.group ?? DEFAULT_CONTROL_GROUP,
      min: entry.min,
      max: entry.max,
      ...(entry.step === undefined ? {} : { step: entry.step }),
      value: entry.read(),
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

  public async setNumber(id: string, value: number): Promise<void> {
    const number = this.numbers.get(id);
    if (!number) throw new Error(`Unknown debug number: ${id}`);
    if (!Number.isFinite(value) || value < number.min || value > number.max) {
      throw new Error(
        `${number.label} must be between ${number.min} and ${number.max}`,
      );
    }
    await number.onChange(value);
    this.notify({ kind: 'number', id });
  }

  public subscribe(
    listener: (change: DebugRegistryChange) => void,
  ): DebugUnregister {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private assertAvailable(id: string): void {
    if (
      this.values.has(id) ||
      this.toggles.has(id) ||
      this.commands.has(id) ||
      this.numbers.has(id)
    ) {
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
