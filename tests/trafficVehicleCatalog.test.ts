import { Box3, BoxGeometry, Group, Mesh, Vector3 } from 'three';
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

  it('publishes unique stable metadata and safe detector contracts', () => {
    expect(trafficVehicleCatalog).toHaveLength(7);
    expect(new Set(trafficVehicleCatalog.map(({ id }) => id)).size).toBe(7);
    for (const definition of trafficVehicleCatalog) {
      const asset = assetManifest[definition.assetId];
      expect(
        'attribution' in asset ? asset.attribution : undefined,
      ).toMatchObject({
        creator: 'Quaternius',
        license: 'CC0 1.0 Universal',
      });
      expect(asset.url).toMatch(
        /^\/assets\/vehicles\/quaternius-cars\/.+\.glb$/,
      );
      expect(definition.presentation.length).toBeGreaterThanOrEqual(4.08);
      expect(definition.presentation.length).toBeLessThanOrEqual(4.4);
      expect(definition.presentation.detectionWidth).toBeLessThanOrEqual(
        definition.presentation.maximumWidth,
      );
      expect(definition.presentation.staticSweepRadius).toBeLessThanOrEqual(
        definition.presentation.detectionWidth / 2,
      );
    }
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
      const bounds = new Box3().setFromObject(model);
      const size = bounds.getSize(new Vector3());
      expect(bounds.min.y).toBeCloseTo(
        definition.presentation.groundClearance,
        5,
      );
      expect(size.z).toBeCloseTo(definition.presentation.length, 5);
      expect(size.x).toBeLessThanOrEqual(
        definition.presentation.maximumWidth + 1e-3,
      );
      expect(size.y).toBeLessThanOrEqual(
        definition.presentation.maximumHeight + 1e-3,
      );
    },
  );
});
