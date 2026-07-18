import { BoxGeometry, Group, Mesh } from 'three';
import { assetManifest } from '../src/assets/catalog';
import {
  trafficVehicleCatalog,
  validateTrafficVehicleCatalog,
} from '../src/traffic/TrafficVehicleCatalog';
import { normalizeVehicleModel } from '../src/traffic/TrafficSystem';

describe('traffic vehicle catalog', () => {
  it('covers every manifest model marked for civilian traffic exactly once', () => {
    const manifestIds = Object.entries(assetManifest)
      .filter(([, asset]) => asset.metadata?.intendedUse === 'civilian-traffic')
      .map(([id]) => id)
      .sort();
    expect(trafficVehicleCatalog.map(({ assetId }) => assetId).sort()).toEqual(
      manifestIds,
    );
  });

  it('rejects duplicate assets and lane-unsafe presentation bounds', () => {
    const pickup = trafficVehicleCatalog[0]!;
    expect(() =>
      validateTrafficVehicleCatalog([pickup, { ...pickup, id: 'sports-car' }]),
    ).toThrow(/Duplicate traffic vehicle asset/);
    expect(() =>
      validateTrafficVehicleCatalog([
        {
          ...pickup,
          presentation: { ...pickup.presentation, maximumWidth: 3 },
        },
      ]),
    ).toThrow(/lane width/);
  });

  it.each(trafficVehicleCatalog)(
    'normalizes $id forward, length, ground contact, and safe bounds',
    (definition) => {
      const model = new Group();
      model.add(new Mesh(new BoxGeometry(2, 1.5, 5)));
      normalizeVehicleModel(model, definition);
      model.updateMatrixWorld(true);
      expect(model.position.y).toBeCloseTo(
        definition.presentation.groundClearance + 0.66,
        1,
      );
      expect(model.scale.x).toBeCloseTo(0.88);
    },
  );
});
