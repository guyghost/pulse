/**
 * TJM History — Pure functions for tracking TJM evolution per technology stack.
 *
 * All functions are pure: no I/O, no async, no side effects.
 * Non-deterministic values (dates, IDs) are injected via parameters.
 */
import type { Mission } from '../types/mission';
import type { SeniorityLevel } from '../types/profile';
import type {
  TJMAnalysis,
  TJMHistory,
  TJMRange,
  TJMRecord,
  TJMStackInsight,
  TJMStats,
  TJMTrend,
} from '../types/tjm';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum number of data points required to determine a trend */
const MIN_DATA_POINTS_FOR_TREND = 2;

/** Minimum percentage change to count as a trend (not "stable") */
const TREND_THRESHOLD_PERCENT = 5;

// ---------------------------------------------------------------------------
// Record creation (pure — date injected)
// ---------------------------------------------------------------------------

/**
 * Extract TJM records from a batch of missions for a given date.
 *
 * Groups missions by stack + seniority, computes min/max/average TJM per group.
 * Missions without TJM or without stack are excluded.
 *
 * @param missions - Missions to extract TJM data from
 * @param date - ISO 8601 date string for the record (e.g. "2026-04-01")
 * @returns Array of TJMRecords, one per unique stack+seniority group with TJM data
 */
export const extractRecords = (missions: Mission[], date: string): TJMRecord[] => {
  interface StackGroup {
    tjms: number[];
    seniority: SeniorityLevel | null;
    stack: string;
  }

  const groups = new Map<string, StackGroup>();

  for (const mission of missions) {
    if (mission.tjm === null || mission.tjm <= 0) continue;
    if (mission.stack.length === 0) continue;

    for (const tech of mission.stack) {
      if (!tech) continue;
      const normalizedStack = tech.toLowerCase().trim();
      if (!normalizedStack) continue;

      const seniorityKey = mission.seniority ?? 'unknown';
      const groupKey = `${normalizedStack}:${seniorityKey}`;

      const existing = groups.get(groupKey);
      if (existing) {
        existing.tjms.push(mission.tjm);
      } else {
        groups.set(groupKey, {
          tjms: [mission.tjm],
          seniority: mission.seniority,
          stack: normalizedStack,
        });
      }
    }
  }

  const records: TJMRecord[] = [];

  for (const group of groups.values()) {
    const { tjms, seniority, stack } = group;
    const min = Math.min(...tjms);
    const max = Math.max(...tjms);
    const sum = tjms.reduce((acc, t) => acc + t, 0);
    const average = Math.round(sum / tjms.length);

    records.push({
      stack,
      date,
      min,
      max,
      average,
      sampleCount: tjms.length,
      seniority,
    });
  }

  return records;
};

// ---------------------------------------------------------------------------
// History management (pure — immutable)
// ---------------------------------------------------------------------------

/**
 * Add new records to an existing history, replacing any records for the same
 * stack+date+seniority combination (upsert by stack+date+seniority).
 *
 * @param history - Existing history
 * @param newRecords - Records to merge in
 * @returns New history with merged records
 */
export const addRecords = (history: TJMHistory, newRecords: TJMRecord[]): TJMHistory => {
  const existingByKey = new Map<string, TJMRecord>();

  for (const record of history.records) {
    existingByKey.set(`${record.stack}:${record.date}:${record.seniority ?? 'unknown'}`, record);
  }

  for (const record of newRecords) {
    existingByKey.set(`${record.stack}:${record.date}:${record.seniority ?? 'unknown'}`, record);
  }

  const merged = Array.from(existingByKey.values());
  merged.sort((a, b) => a.date.localeCompare(b.date) || a.stack.localeCompare(b.stack));

  return { records: merged };
};

/**
 * Create an empty TJM history.
 */
export const emptyHistory = (): TJMHistory => ({ records: [] });

// ---------------------------------------------------------------------------
// Statistics & Trend analysis (pure)
// ---------------------------------------------------------------------------

/**
 * Determine trend direction based on current vs previous average.
 * Returns 'stable' if the change is below the threshold percentage.
 */
export const determineTrend = (current: number, previous: number | null): TJMTrend => {
  if (previous === null || previous === 0) return 'stable';

  const changePercent = ((current - previous) / previous) * 100;

  if (changePercent > TREND_THRESHOLD_PERCENT) return 'up';
  if (changePercent < -TREND_THRESHOLD_PERCENT) return 'down';
  return 'stable';
};

/**
 * Compute aggregated statistics for a specific technology stack.
 *
 * @param history - Full TJM history
 * @param stack - Stack name to analyze (will be normalized to lowercase)
 * @returns TJMStats or null if no data exists for the stack
 */
export const getStatsForStack = (history: TJMHistory, stack: string): TJMStats | null => {
  const normalizedStack = stack.toLowerCase().trim();

  const stackRecords = history.records
    .filter((r) => r.stack === normalizedStack)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (stackRecords.length === 0) return null;

  const latestRecord = stackRecords[stackRecords.length - 1];
  const previousRecord =
    stackRecords.length >= MIN_DATA_POINTS_FOR_TREND ? stackRecords[stackRecords.length - 2] : null;

  const allMin = Math.min(...stackRecords.map((r) => r.min));
  const allMax = Math.max(...stackRecords.map((r) => r.max));

  return {
    stack: normalizedStack,
    currentAverage: latestRecord.average,
    previousAverage: previousRecord?.average ?? null,
    trend: determineTrend(latestRecord.average, previousRecord?.average ?? null),
    allTimeMin: allMin,
    allTimeMax: allMax,
    dataPointCount: stackRecords.length,
    lastUpdated: latestRecord.date,
  };
};

/**
 * Compute statistics for all stacks in the history.
 *
 * @param history - Full TJM history
 * @returns Map of stack name → TJMStats
 */
export const getAllStats = (history: TJMHistory): Map<string, TJMStats> => {
  const stats = new Map<string, TJMStats>();

  const uniqueStacks = new Set(history.records.map((r) => r.stack));

  for (const stack of uniqueStacks) {
    const stat = getStatsForStack(history, stack);
    if (stat) {
      stats.set(stack, stat);
    }
  }

  return stats;
};

/**
 * Get the trend for a specific stack. Convenience function.
 *
 * @param history - Full TJM history
 * @param stack - Stack name
 * @returns Trend direction, or 'stable' if no data
 */
export const getTrend = (history: TJMHistory, stack: string): TJMTrend => {
  const stats = getStatsForStack(history, stack);
  return stats?.trend ?? 'stable';
};

/**
 * Get statistics for all stacks matching any of the given mission's technologies.
 * Useful for showing trend indicators on mission cards.
 *
 * @param history - Full TJM history
 * @param mission - Mission whose stack to look up
 * @returns Map of stack name → TJMStats for stacks that have data
 */
export const getStatsForMission = (
  history: TJMHistory,
  mission: Mission
): Map<string, TJMStats> => {
  const result = new Map<string, TJMStats>();

  for (const tech of mission.stack) {
    if (!tech) continue;
    const stats = getStatsForStack(history, tech);
    if (stats) {
      result.set(tech.toLowerCase().trim(), stats);
    }
  }

  return result;
};

/**
 * Get the dominant trend across a mission's stacks.
 * Returns the most common trend, with 'up' winning ties.
 *
 * @param history - Full TJM history
 * @param mission - Mission to analyze
 * @returns Dominant trend direction
 */
export const getDominantTrendForMission = (history: TJMHistory, mission: Mission): TJMTrend => {
  const stats = getStatsForMission(history, mission);

  if (stats.size === 0) return 'stable';

  let upCount = 0;
  let downCount = 0;
  let stableCount = 0;

  for (const stat of stats.values()) {
    if (stat.trend === 'up') upCount++;
    else if (stat.trend === 'down') downCount++;
    else stableCount++;
  }

  if (upCount >= downCount && upCount >= stableCount) return 'up';
  if (downCount >= upCount && downCount >= stableCount) return 'down';
  return 'stable';
};

// ---------------------------------------------------------------------------
// UI-ready dashboard analysis (pure)
// ---------------------------------------------------------------------------

const clampConfidence = (value: number): number => Math.max(0, Math.min(1, value));

const medianOf = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  }
  return sorted[middle];
};

const buildRange = (values: number[]): TJMRange => {
  const source = values.length > 0 ? values : [0];
  return {
    min: Math.min(...source),
    max: Math.max(...source),
    median: medianOf(source),
  };
};

const sliceIntoThirds = (values: number[]): [number[], number[], number[]] => {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length <= 2) {
    return [sorted, sorted, sorted];
  }

  const size = Math.ceil(sorted.length / 3);
  const junior = sorted.slice(0, size);
  const confirmed = sorted.slice(size, size * 2);
  const senior = sorted.slice(size * 2);

  return [
    junior.length > 0 ? junior : sorted,
    confirmed.length > 0 ? confirmed : sorted,
    senior.length > 0 ? senior : sorted,
  ];
};

const buildTrendDetail = (trend: TJMTrend, topStacks: TJMStackInsight[]): string | null => {
  if (topStacks.length === 0) return null;

  const stackList = topStacks
    .slice(0, 3)
    .map((stack) => stack.stack)
    .join(', ');

  if (trend === 'up') {
    return `Le marché est orienté à la hausse sur ${stackList}.`;
  }
  if (trend === 'down') {
    return `Le marché ralentit sur ${stackList}. Ajustez votre ciblage TJM avec prudence.`;
  }
  return `Le marché reste globalement stable sur ${stackList}.`;
};

const buildRecommendation = (trend: TJMTrend, confirmed: TJMRange): string | null => {
  if (confirmed.median <= 0) return null;

  if (trend === 'up') {
    return `Visez en priorité la zone ${confirmed.min}–${confirmed.max} €/j pour vos positionnements confirmés.`;
  }
  if (trend === 'down') {
    return `Le cœur de marché semble se situer autour de ${confirmed.median} €/j. Misez sur des missions à forte valeur perçue.`;
  }
  return `Le centre de marché reste proche de ${confirmed.median} €/j. Utilisez cette base pour calibrer vos candidatures.`;
};

/**
 * Collect average TJM values from records matching a specific seniority level.
 */
const collectAveragesForSeniority = (records: TJMRecord[], level: SeniorityLevel): number[] =>
  records
    .filter((r) => r.seniority === level)
    .map((r) => r.average)
    .filter((v) => v > 0);

/**
 * Collect average TJM values from records with null seniority (unknown bucket).
 */
const collectAveragesUnknown = (records: TJMRecord[]): number[] =>
  records
    .filter((r) => r.seniority === null)
    .map((r) => r.average)
    .filter((v) => v > 0);

/**
 * Collect all average TJM values regardless of seniority.
 */
const collectAllAverages = (records: TJMRecord[]): number[] =>
  records.map((r) => r.average).filter((v) => v > 0);

/**
 * Build a TJMRange for a seniority level, with fallback strategy:
 * 1. Use averages from records matching the level
 * 2. If empty, fall back to unknown bucket
 * 3. If still empty, fall back to all averages
 */
const buildRangeForLevel = (records: TJMRecord[], level: SeniorityLevel): TJMRange => {
  const levelValues = collectAveragesForSeniority(records, level);
  if (levelValues.length > 0) return buildRange(levelValues);

  const unknownValues = collectAveragesUnknown(records);
  if (unknownValues.length > 0) return buildRange(unknownValues);

  const allValues = collectAllAverages(records);
  return buildRange(allValues);
};

/**
 * Transform a raw TJM history into a dashboard-ready analysis.
 *
 * When records have real seniority data, builds ranges from actual
 * seniority-grouped averages. When no records have seniority (all null),
 * falls back to the statistical sliceIntoThirds approach for backward
 * compatibility.
 *
 * Pure function: no I/O, no async, deterministic from inputs only.
 */
export const analyzeTJMHistory = (history: TJMHistory): TJMAnalysis | null => {
  if (history.records.length === 0) return null;

  const stats = [...getAllStats(history).values()]
    .sort((a, b) => b.dataPointCount - a.dataPointCount || b.currentAverage - a.currentAverage)
    .slice(0, 9);

  if (stats.length === 0) return null;

  const latestAverages = stats.map((stat) => stat.currentAverage).filter((value) => value > 0);
  if (latestAverages.length === 0) return null;

  // Check if any records have real seniority data
  const hasRealSeniority = history.records.some((r) => r.seniority !== null);

  let junior: TJMRange;
  let confirmed: TJMRange;
  let senior: TJMRange;

  if (hasRealSeniority) {
    // Use actual seniority-grouped data
    junior = buildRangeForLevel(history.records, 'junior');
    confirmed = buildRangeForLevel(history.records, 'confirmed');
    senior = buildRangeForLevel(history.records, 'senior');
  } else {
    // Fallback: statistical thirds (backward compatibility)
    const [juniorValues, confirmedValues, seniorValues] = sliceIntoThirds(latestAverages);
    junior = buildRange(juniorValues);
    confirmed = buildRange(confirmedValues);
    senior = buildRange(seniorValues);
  }

  const topStacks: TJMStackInsight[] = stats.slice(0, 5).map((stat) => ({
    stack: stat.stack,
    average: stat.currentAverage,
    trend: stat.trend,
    sampleCount: stat.dataPointCount,
    lastUpdated: stat.lastUpdated,
  }));

  let upCount = 0;
  let downCount = 0;
  let stableCount = 0;
  for (const stat of stats) {
    if (stat.trend === 'up') upCount++;
    else if (stat.trend === 'down') downCount++;
    else stableCount++;
  }

  const trend: TJMTrend =
    upCount >= downCount && upCount >= stableCount
      ? 'up'
      : downCount >= upCount && downCount >= stableCount
        ? 'down'
        : 'stable';

  const confidence = clampConfidence(
    stats.length * 0.12 +
      Math.min(history.records.length, 30) * 0.02 +
      (stableCount === stats.length ? 0.1 : 0.18)
  );

  const lastUpdated =
    stats
      .map((stat) => stat.lastUpdated)
      .filter((date): date is string => date !== null)
      .sort()
      .at(-1) ?? null;

  return {
    trend,
    confidence,
    dataPoints: history.records.length,
    junior,
    confirmed,
    senior,
    trendDetail: buildTrendDetail(trend, topStacks),
    recommendation: buildRecommendation(trend, confirmed),
    lastUpdated,
    topStacks,
  };
};
