import { expect, type Page } from '@playwright/test';
import type { BrowserTestSnapshot } from '../src/debug/BrowserTestBridge';

interface SteadyPopulationOptions {
  readonly requiredSector?: string;
  readonly excludedSector?: string;
}

export interface AuthoritativePedestrianExpectation {
  readonly residentCount: number;
  readonly routeCount: number;
  readonly routeIds: readonly string[];
  readonly sectorCounts: Readonly<Record<string, number>>;
}

export function authoritativePedestrianExpectation(
  state: BrowserTestSnapshot,
): AuthoritativePedestrianExpectation {
  const plan = state.pedestrians.plan;
  return {
    residentCount: plan.residentCount,
    routeCount: plan.routeCount,
    routeIds: plan.routeIds,
    sectorCounts: plan.sectorCounts,
  };
}

export async function expectSteadyPedestrianPopulation(
  page: Page,
  options: SteadyPopulationOptions = {},
): Promise<BrowserTestSnapshot> {
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__VANTA_TEST__)))
    .toBe(true);
  await expect
    .poll(
      async () => {
        const state = await snapshot(page);
        const expected = authoritativePedestrianExpectation(state);
        const actualRouteIds = [
          ...new Set(
            state.pedestrians.pedestrians.map(({ routeId }) => routeId),
          ),
        ].sort();
        return {
          ready: state.ready,
          gameState: state.gameState,
          pending: state.world.sectors.pending,
          transitionsPending: state.world.sectors.transitionsPending,
          loading: state.pedestrians.loadingCount,
          requiredSectorReady:
            !options.requiredSector ||
            state.world.sectors.active.includes(options.requiredSector),
          excludedSectorGone:
            !options.excludedSector ||
            !state.world.sectors.active.includes(options.excludedSector),
          residentDelta:
            state.pedestrians.residentCount - expected.residentCount,
          routeDelta: state.pedestrians.routeCount - expected.routeCount,
          routeIdsMatch:
            JSON.stringify(actualRouteIds) ===
            JSON.stringify(expected.routeIds),
          sectorCountsMatch:
            JSON.stringify(sortedRecord(state.pedestrians.sectorCounts)) ===
            JSON.stringify(sortedRecord(expected.sectorCounts)),
          mixersMatch:
            state.pedestrians.mixerOwnerCount ===
            state.pedestrians.residentCount,
          visibleMatch:
            state.pedestrians.visibleCount === state.pedestrians.residentCount,
        };
      },
      { timeout: 25_000 },
    )
    .toEqual({
      ready: true,
      gameState: 'playing',
      pending: [],
      transitionsPending: false,
      loading: 0,
      requiredSectorReady: true,
      excludedSectorGone: true,
      residentDelta: 0,
      routeDelta: 0,
      routeIdsMatch: true,
      sectorCountsMatch: true,
      mixersMatch: true,
      visibleMatch: true,
    });
  return snapshot(page);
}

async function snapshot(page: Page): Promise<BrowserTestSnapshot> {
  return page.evaluate(() => window.__VANTA_TEST__!.snapshot());
}

function sortedRecord(
  value: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
}
