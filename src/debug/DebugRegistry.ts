export type DebugValue = string | number | boolean | null | undefined;

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

const DEFAULT_GROUP = 'Runtime';

export class DebugRegistry {
  private readonly values = new Map<string, DebugValueRegistration>();
  private readonly toggles = new Map<
    string,
    DebugToggleRegistration & { enabled: boolean }
  >();
  private readonly commands = new Map<string, DebugCommandRegistration>();
  private readonly listeners = new Set<() => void>();

  public registerValue(registration: DebugValueRegistration): DebugUnregister {
    this.assertAvailable(registration.id);
    this.values.set(registration.id, registration);
    this.notify();
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
    this.notify();
    return this.unregister(this.toggles, registration.id, entry);
  }

  public registerCommand(
    registration: DebugCommandRegistration,
  ): DebugUnregister {
    this.assertAvailable(registration.id);
    this.commands.set(registration.id, registration);
    this.notify();
    return this.unregister(this.commands, registration.id, registration);
  }

  public readValues(): readonly (DebugValueRegistration & {
    readonly value: DebugValue;
    readonly group: string;
  })[] {
    return [...this.values.values()].map((entry) => ({
      ...entry,
      group: entry.group ?? DEFAULT_GROUP,
      value: entry.read(),
    }));
  }

  public listToggles(): readonly DebugToggleSnapshot[] {
    return [...this.toggles.values()].map((entry) => ({
      id: entry.id,
      label: entry.label,
      group: entry.group ?? DEFAULT_GROUP,
      enabled: entry.enabled,
    }));
  }

  public listCommands(): readonly DebugCommandSnapshot[] {
    return [...this.commands.values()].map((entry) => ({
      id: entry.id,
      label: entry.label,
      group: entry.group ?? DEFAULT_GROUP,
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
    this.notify();
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

  public subscribe(listener: () => void): DebugUnregister {
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
      this.notify();
    };
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
