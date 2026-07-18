export type UiLabState =
  | 'exploration'
  | 'combat'
  | 'dialogue'
  | 'restoration'
  | 'mission-update'
  | 'driving'
  | 'pause-map'
  | 'loading'
  | 'death';

export interface UiCompositionPresentationFixture {
  readonly label: string;
  readonly supported: boolean;
  readonly unavailableReason?: string;
}

/** Public, presentation-only fixtures. They never mutate runtime domain state. */
export const uiCompositionPresentationFixtures: Readonly<
  Record<UiLabState, UiCompositionPresentationFixture>
> = {
  exploration: { label: 'Exploration', supported: true },
  combat: { label: 'Combat warning', supported: true },
  dialogue: { label: 'Dialogue', supported: true },
  restoration: { label: 'Restoration', supported: true },
  'mission-update': {
    label: 'Mission update',
    supported: true,
  },
  driving: {
    label: 'Driving',
    supported: false,
    unavailableReason: 'VEHICLE-001 will provide vehicle and transfer state.',
  },
  'pause-map': {
    label: 'Pause / map',
    supported: false,
    unavailableReason: 'MAP-001 will provide the full-world map presentation.',
  },
  loading: {
    label: 'Loading',
    supported: false,
    unavailableReason:
      'Bootstrap lifecycle owns loading; no synthetic readiness is shown.',
  },
  death: {
    label: 'Death',
    supported: false,
    unavailableReason:
      'The live death system owns player, camera, and revival restoration.',
  },
};
