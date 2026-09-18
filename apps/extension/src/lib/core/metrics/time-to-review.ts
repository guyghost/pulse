/**
 * "Time to review" metric: delay (hours) between mission capture
 * (scrapedAt) and its first review (journal firstViewedAt), p50/p95 over
 * a rolling 30-day window. See src/models/time-to-review.model.md.
 *
 * Pure: now injected, no I/O, no clock.
 */
import type { Mission } from '../types/mission';
import { coerceIso, type ReviewJournal } from '../seen/first-viewed';

export interface ReviewEventInput {
  missionId: string;
  capturedAt: string | null;
  firstViewedAt: string | null;
}

export interface TimeToReviewPoint {
  value: number | null;
  delta: number | null;
}

export interface TimeToReviewSeriesPoint {
  day: string;
  p50: number | null;
  p95: number | null;
}

export interface TimeToReviewResult {
  hasData: boolean;
  p50: TimeToReviewPoint;
  p95: TimeToReviewPoint;
  /** Share of unviewed missions in the current window (0..1). */
  unviewed: TimeToReviewPoint;
  series: TimeToReviewSeriesPoint[];
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
export const REVIEW_WINDOW_DAYS = 30;

/** Union of known missions (DB) and journal entries (orphans included). */
export function buildReviewEvents(missions: Mission[], journal: ReviewJournal): ReviewEventInput[] {
  const events = new Map<string, ReviewEventInput>();
  for (const mission of missions) {
    events.set(mission.id, {
      missionId: mission.id,
      capturedAt: coerceIso(mission.scrapedAt),
      firstViewedAt: null,
    });
  }
  for (const [missionId, entry] of Object.entries(journal)) {
    const existing = events.get(missionId);
    if (existing) {
      events.set(missionId, {
        missionId,
        capturedAt: existing.capturedAt ?? entry.capturedAt,
        firstViewedAt: entry.firstViewedAt,
      });
    } else {
      events.set(missionId, {
        missionId,
        capturedAt: entry.capturedAt,
        firstViewedAt: entry.firstViewedAt,
      });
    }
  }
  return [...events.values()];
}

/** Percentile with linear interpolation; null on empty input. */
export function percentile(values: number[], p: 50 | 95): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sorted[lower];
  }
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function deltaOrNull(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) {
    return null;
  }
  return current - previous;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function utcDayKey(timeMs: number): string {
  const date = new Date(timeMs);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/**
 * Computes p50/p95 (hours), unviewed share, deltas vs the previous period and
 * daily series over a rolling 30-day window (UTC days).
 *
 * Exclusions (see model): unresolvable or future capturedAt; negative delay
 * (inconsistent clock → counted as viewed, outside percentiles); unviewed
 * counted in `unviewed` and excluded from percentiles.
 */
export function computeTimeToReview(events: ReviewEventInput[], now: Date): TimeToReviewResult {
  const nowMs = now.getTime();
  const currentStart = nowMs - REVIEW_WINDOW_DAYS * DAY_MS;
  const previousStart = nowMs - 2 * REVIEW_WINDOW_DAYS * DAY_MS;

  const currentDelays: number[] = [];
  const previousDelays: number[] = [];
  const delaysByDay = new Map<string, number[]>();
  let currentTotal = 0;
  let currentUnviewed = 0;
  let previousTotal = 0;
  let previousUnviewed = 0;

  for (const event of events) {
    const capturedIso = coerceIso(event.capturedAt);
    if (capturedIso === null) {
      continue;
    }
    const capturedMs = Date.parse(capturedIso);
    if (!Number.isFinite(capturedMs) || capturedMs > nowMs) {
      continue;
    }

    const viewedMs = event.firstViewedAt === null ? null : Date.parse(event.firstViewedAt);
    const hasValidView = viewedMs !== null && Number.isFinite(viewedMs);
    // Negative delay (inconsistent clock): counted as viewed, outside percentiles.
    const delayHours =
      hasValidView && viewedMs !== null && viewedMs >= capturedMs
        ? (viewedMs - capturedMs) / HOUR_MS
        : null;
    const isUnviewed = !hasValidView;

    if (capturedMs >= currentStart) {
      currentTotal += 1;
      if (isUnviewed) {
        currentUnviewed += 1;
      } else if (delayHours !== null) {
        currentDelays.push(delayHours);
        const day = capturedIso.slice(0, 10);
        const dayDelays = delaysByDay.get(day);
        if (dayDelays) {
          dayDelays.push(delayHours);
        } else {
          delaysByDay.set(day, [delayHours]);
        }
      }
    } else if (capturedMs >= previousStart) {
      previousTotal += 1;
      if (isUnviewed) {
        previousUnviewed += 1;
      } else if (delayHours !== null) {
        previousDelays.push(delayHours);
      }
    }
  }

  // 30 jours UTC se terminant aujourd'hui, strictement croissants.
  const lastDayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const series: TimeToReviewSeriesPoint[] = [];
  for (let offset = REVIEW_WINDOW_DAYS - 1; offset >= 0; offset -= 1) {
    const day = utcDayKey(lastDayStart - offset * DAY_MS);
    const dayDelays = delaysByDay.get(day) ?? [];
    series.push({
      day,
      p50: percentile(dayDelays, 50),
      p95: percentile(dayDelays, 95),
    });
  }

  const p50Value = percentile(currentDelays, 50);
  const p95Value = percentile(currentDelays, 95);
  const previousP50 = percentile(previousDelays, 50);
  const previousP95 = percentile(previousDelays, 95);
  const unviewedValue = currentTotal > 0 ? currentUnviewed / currentTotal : null;
  const previousUnviewedValue = previousTotal > 0 ? previousUnviewed / previousTotal : null;

  return {
    hasData: currentTotal > 0,
    p50: { value: p50Value, delta: deltaOrNull(p50Value, previousP50) },
    p95: { value: p95Value, delta: deltaOrNull(p95Value, previousP95) },
    unviewed: {
      value: unviewedValue,
      delta: deltaOrNull(unviewedValue, previousUnviewedValue),
    },
    series,
  };
}
