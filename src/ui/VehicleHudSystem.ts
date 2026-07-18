import type { GameSystem } from '../core/lifecycle';
import { bindingLabel, controlActions } from '../input/defaultBindings';
import type { QuickbarSystem } from './QuickbarSystem';
import type {
  VehicleControllerSystem,
  VehicleSnapshot,
} from '../vehicles/VehicleControllerSystem';

export interface VehicleHudSnapshot {
  readonly visible: boolean;
  readonly vehicleLabel: string;
  readonly speedKilometresPerHour: number;
  readonly exitAvailable: boolean;
}

/** Compact loadout-zone projection of the public vehicle snapshot. */
export class VehicleHudSystem implements GameSystem {
  public readonly id = 'vehicle-hud';
  public readonly updateMode = 'always' as const;
  private readonly root = document.createElement('section');
  private readonly label = document.createElement('span');
  private readonly speed = document.createElement('strong');
  private readonly controls = document.createElement('span');
  private readonly unsubscribers: (() => void)[] = [];
  private snapshot: VehicleSnapshot;

  public constructor(
    private readonly mount: HTMLElement,
    private readonly vehicle: VehicleControllerSystem,
    private readonly quickbar: QuickbarSystem,
  ) {
    this.snapshot = vehicle.getSnapshot();
    this.root.className = 'vehicle-hud';
    this.root.hidden = true;
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-label', 'Driving status');
    this.root.setAttribute('aria-live', 'polite');
    this.label.className = 'vehicle-hud__label';
    this.speed.className = 'vehicle-hud__speed';
    this.controls.className = 'vehicle-hud__controls';
    this.root.append(this.label, this.speed, this.controls);
  }

  public init(): void {
    this.mount.append(this.root);
    this.unsubscribers.push(
      this.vehicle.events.on('changed', (snapshot) => this.sync(snapshot)),
    );
    for (const event of ['entered', 'exited', 'recovered'] as const) {
      this.unsubscribers.push(
        this.vehicle.events.on(event, (snapshot) => this.sync(snapshot)),
      );
    }
    this.sync(this.vehicle.getSnapshot());
  }

  public getSnapshot(): VehicleHudSnapshot {
    return {
      visible: this.root.isConnected && !this.root.hidden,
      vehicleLabel: this.snapshot.vehicleLabel,
      speedKilometresPerHour: Math.round(Math.abs(this.snapshot.speed) * 3.6),
      exitAvailable: this.snapshot.exitAvailable,
    };
  }

  public dispose(): void {
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    this.quickbar.setVisible(true);
    this.root.remove();
  }

  private sync(snapshot: VehicleSnapshot): void {
    this.snapshot = snapshot;
    const driving = snapshot.mode === 'driving';
    this.root.hidden = !driving;
    this.quickbar.setVisible(!driving);
    this.label.textContent = snapshot.vehicleLabel;
    const direction = snapshot.speed < -0.05 ? 'R ' : '';
    this.speed.textContent = `${direction}${Math.round(Math.abs(snapshot.speed) * 3.6)} km/h`;
    this.controls.textContent = [
      `${primaryKey('moveForward')}/${primaryKey('moveBackward')} drive`,
      `${primaryKey('moveLeft')}/${primaryKey('moveRight')} steer`,
      `${primaryKey('interact')} ${snapshot.exitAvailable ? 'exit' : 'exit blocked'}`,
      `${primaryKey('recoverVehicle')} recover`,
    ].join(' · ');
    this.root.setAttribute(
      'aria-label',
      `Driving ${snapshot.vehicleLabel}, ${this.speed.textContent}. ` +
        `${bindingLabel('moveForward')} and ${bindingLabel('moveBackward')} drive; ` +
        `${bindingLabel('moveLeft')} and ${bindingLabel('moveRight')} steer; ` +
        `${bindingLabel('interact')} exit; ${bindingLabel('recoverVehicle')} recover.`,
    );
  }
}

function primaryKey(action: keyof typeof controlActions): string {
  return controlActions[action].keys[0]!;
}
