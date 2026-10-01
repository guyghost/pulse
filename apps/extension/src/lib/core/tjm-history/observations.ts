import type { Mission } from '../types/mission';
import type {
  TJMFilters,
  TJMHistory,
  TJMObservation,
  TJMPopulation,
  TJMSampleAnalysis,
} from '../types/tjm';
import { buildTJMSeries } from './index';
import { normalizeRegion } from './normalize-region';

/** Source + stable advertised URL survives scan-specific IDs and account scoping. */
function announcementIdentity(mission: Mission): string {
  let url: URL;
  try {
    url = new URL(mission.url);
  } catch {
    return `${mission.source}:${mission.externalId || mission.id}`;
  }
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/$/, '') || '/';
  return `${mission.source}:${url.href}`;
}

/** The stored scrape date is the observation date, including on initial bootstrap. */
export function extractObservations(missions: Mission[]): TJMObservation[] {
  return missions.flatMap((mission) => {
    const observedAt = new Date(mission.scrapedAt).getTime();
    if (!Number.isFinite(observedAt)) {
      return [];
    }
    return [
      {
        identity: announcementIdentity(mission),
        observedAt: new Date(observedAt).toISOString(),
        source: mission.source,
        stacks: [
          ...new Set(mission.stack.map((stack) => stack.trim().toLowerCase()).filter(Boolean)),
        ],
        tjm:
          mission.tjm !== null && Number.isFinite(mission.tjm) && mission.tjm > 0
            ? mission.tjm
            : null,
        category: mission.classification?.category ?? null,
        seniority: mission.seniority ?? null,
        remote: mission.remote ?? null,
        // Geography and work mode are independent for new observations.
        region: mission.location?.trim() ? normalizeRegion(mission.location) : null,
      },
    ];
  });
}

export function addObservations(history: TJMHistory, observations: TJMObservation[]): TJMHistory {
  const snapshots = new Map<string, TJMObservation>();
  for (const observation of [...(history.observations ?? []), ...observations]) {
    snapshots.set(`${observation.identity}\n${observation.observedAt}`, observation);
  }
  return { ...history, observations: [...snapshots.values()] };
}

function population(observations: TJMObservation[]): TJMPopulation {
  const prices = observations.flatMap((o) => (o.tjm === null ? [] : [o.tjm])).sort((a, b) => a - b);
  const middle = Math.floor(prices.length / 2);
  return {
    total: observations.length,
    priced: prices.length,
    withoutTjm: observations.length - prices.length,
    range:
      prices.length === 0
        ? null
        : {
            min: prices[0],
            max: prices[prices.length - 1],
            median: prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2,
          },
  };
}

/** Window -> latest snapshot per announcement -> intersect dimensions -> statistics. */
export function analyzeTJMObservations(
  history: TJMHistory,
  filters: TJMFilters,
  now: Date
): TJMSampleAnalysis {
  const period = filters.period ?? 'all';
  const cutoff =
    period === 'all' ? -Infinity : now.getTime() - (period === '7d' ? 7 : 30) * 86_400_000;
  const latest = new Map<string, TJMObservation>();
  for (const observation of history.observations ?? []) {
    const timestamp = Date.parse(observation.observedAt);
    if (!Number.isFinite(timestamp) || timestamp < cutoff || timestamp > now.getTime()) {
      continue;
    }
    const previous = latest.get(observation.identity);
    if (!previous || timestamp >= Date.parse(previous.observedAt)) {
      latest.set(observation.identity, observation);
    }
  }
  const stacks = new Set(
    filters.profileStacks?.map((stack) => stack.trim().toLowerCase()).filter(Boolean)
  );
  const observations = [...latest.values()].filter((observation) => {
    if (stacks.size && !observation.stacks.some((stack) => stacks.has(stack))) {
      return false;
    }
    return (['category', 'seniority', 'remote', 'region'] as const).every((dimension) => {
      const selected = filters[dimension];
      return selected === undefined || (observation[dimension] ?? 'unknown') === selected;
    });
  });
  const dates = observations.map((o) => o.observedAt).sort();
  const sources = new Map<TJMObservation['source'], number>();
  for (const observation of observations) {
    sources.set(observation.source, (sources.get(observation.source) ?? 0) + 1);
  }
  return {
    ...population(observations),
    lastUpdated: dates.at(-1) ?? null,
    firstObservedAt: dates[0] ?? null,
    unknown: {
      category: observations.filter((o) => o.category === null).length,
      seniority: observations.filter((o) => o.seniority === null).length,
      remote: observations.filter((o) => o.remote === null).length,
      region: observations.filter((o) => o.region === null).length,
    },
    sources: [...sources].map(([source, count]) => ({ source, count })),
    levels: (['junior', 'confirmed', 'senior', 'unknown'] as const).map((seniority) => ({
      seniority,
      population: population(observations.filter((o) => (o.seniority ?? 'unknown') === seniority)),
    })),
    legacy: { recordCount: history.records.length, series: buildTJMSeries(history.records) },
  };
}
