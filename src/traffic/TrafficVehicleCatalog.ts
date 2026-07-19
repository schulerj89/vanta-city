import type { AssetManifest } from '../assets/AssetCatalog';
import { assetManifest } from '../assets/catalog';

/** Catalog-owned stable ID; runtime logic never enumerates concrete models. */
export type TrafficVehicleId = string;
export type VehicleForwardAxis = '+z' | '-z' | '+x' | '-x';

export interface TrafficVehiclePresentation {
  /** Authored model axis that points toward the front bumper. */
  readonly forwardAxis: VehicleForwardAxis;
  /** Uniformly scaled runtime body dimensions in metres. */
  readonly length: number;
  readonly maximumWidth: number;
  readonly maximumHeight: number;
  /** Distance above the lane plane after the lowest model point is grounded. */
  readonly groundClearance: number;
  /** Forward obstacle sweep dimensions in metres. */
  readonly detectionLength: number;
  readonly detectionWidth: number;
  readonly detectionHeight: number;
  /** Narrower road sweep preserves clearance from authored curb colliders. */
  readonly staticSweepRadius: number;
}

export interface TrafficVehicleDefinition {
  readonly id: TrafficVehicleId;
  readonly label: string;
  readonly assetId: keyof typeof assetManifest;
  readonly presentation: TrafficVehiclePresentation;
}

/**
 * The single authoritative runtime catalog for repository-local civilian cars.
 * Ordering is stable because it participates in deterministic model selection.
 */
export const trafficVehicleCatalog = validateTrafficVehicleCatalog([
  {
    id: 'pickup-truck',
    label: 'Pickup Truck',
    assetId: 'vehicle.traffic.pickup',
    presentation: {
      forwardAxis: '+z',
      length: 4.4,
      maximumWidth: 2.05,
      maximumHeight: 1.7,
      groundClearance: 0.02,
      detectionLength: 7,
      detectionWidth: 1.8,
      detectionHeight: 1,
      staticSweepRadius: 0.75,
    },
  },
  {
    id: 'sports-car',
    label: 'Sports Car',
    assetId: 'vehicle.traffic.sports-car',
    presentation: {
      forwardAxis: '+z',
      length: 4.4,
      maximumWidth: 2.05,
      maximumHeight: 1.7,
      groundClearance: 0.02,
      detectionLength: 7,
      detectionWidth: 1.8,
      detectionHeight: 1,
      staticSweepRadius: 0.75,
    },
  },
  {
    id: 'sport-coupe',
    label: 'Sport Coupe',
    assetId: 'vehicle.traffic.sport-coupe',
    presentation: {
      forwardAxis: '+z',
      length: 4.3,
      maximumWidth: 2.05,
      maximumHeight: 1.4,
      groundClearance: 0.02,
      detectionLength: 7,
      detectionWidth: 1.8,
      detectionHeight: 1,
      staticSweepRadius: 0.75,
    },
  },
  {
    id: 'family-sedan',
    label: 'Family Sedan',
    assetId: 'vehicle.traffic.family-sedan',
    presentation: {
      forwardAxis: '+z',
      length: 4.4,
      maximumWidth: 2.05,
      maximumHeight: 1.4,
      groundClearance: 0.02,
      detectionLength: 7,
      detectionWidth: 1.8,
      detectionHeight: 1,
      staticSweepRadius: 0.75,
    },
  },
  {
    id: 'taxi-sedan',
    label: 'Taxi Sedan',
    assetId: 'vehicle.traffic.taxi-sedan',
    presentation: {
      forwardAxis: '+z',
      length: 4.4,
      maximumWidth: 2.05,
      maximumHeight: 1.5,
      groundClearance: 0.02,
      detectionLength: 7,
      detectionWidth: 1.8,
      detectionHeight: 1,
      staticSweepRadius: 0.75,
    },
  },
  {
    id: 'suv',
    label: 'SUV',
    assetId: 'vehicle.traffic.suv',
    presentation: {
      forwardAxis: '+z',
      length: 4.08,
      maximumWidth: 2.05,
      maximumHeight: 1.55,
      groundClearance: 0.02,
      detectionLength: 7.2,
      detectionWidth: 1.8,
      detectionHeight: 1.1,
      staticSweepRadius: 0.75,
    },
  },
  {
    id: 'compact-wagon',
    label: 'Compact Wagon',
    assetId: 'vehicle.traffic.compact-wagon',
    presentation: {
      forwardAxis: '+z',
      length: 4.13,
      maximumWidth: 2.05,
      maximumHeight: 1.5,
      groundClearance: 0.02,
      detectionLength: 7,
      detectionWidth: 1.8,
      detectionHeight: 1,
      staticSweepRadius: 0.75,
    },
  },
] as const);

export function validateTrafficVehicleCatalog(
  definitions: readonly TrafficVehicleDefinition[],
  manifest: AssetManifest = assetManifest,
): readonly TrafficVehicleDefinition[] {
  if (definitions.length === 0) {
    throw new Error('Traffic vehicle catalog must contain at least one model');
  }
  const ids = new Set<string>();
  const assetIds = new Set<string>();
  for (const definition of definitions) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(definition.id)) {
      throw new Error(`Invalid traffic vehicle id: ${definition.id}`);
    }
    if (ids.has(definition.id)) {
      throw new Error(`Duplicate traffic vehicle id: ${definition.id}`);
    }
    ids.add(definition.id);
    if (assetIds.has(definition.assetId)) {
      throw new Error(`Duplicate traffic vehicle asset: ${definition.assetId}`);
    }
    assetIds.add(definition.assetId);
    const asset = manifest[definition.assetId];
    if (!asset || asset.type !== 'model') {
      throw new Error(`${definition.id} must reference a catalog model asset`);
    }
    if (asset.metadata?.intendedUse !== 'civilian-traffic') {
      throw new Error(`${definition.assetId} is not marked civilian-traffic`);
    }
    for (const [name, value] of Object.entries(definition.presentation)) {
      if (name === 'forwardAxis') continue;
      if (!Number.isFinite(value) || Number(value) <= 0) {
        throw new Error(`${definition.id}.${name} must be positive and finite`);
      }
    }
    if (definition.presentation.maximumWidth >= 3) {
      throw new Error(`${definition.id} exceeds the 3 m traffic lane width`);
    }
    if (
      definition.presentation.detectionWidth >
      definition.presentation.maximumWidth
    ) {
      throw new Error(`${definition.id} detector exceeds its safe body width`);
    }
  }
  return Object.freeze([...definitions]);
}

export function trafficVehicleById(
  id: TrafficVehicleId,
): TrafficVehicleDefinition {
  return trafficVehicleCatalog.find((definition) => definition.id === id)!;
}
