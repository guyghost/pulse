import type { CopilotConsentSelection, CopilotTjmCoachFacts } from '@pulse/domain';

import { getDominantTrendForMission } from '../tjm-history';
import type { Mission } from '../types/mission';
import type { UserProfile } from '../types/profile';
import type { TJMHistory, TJMRecord } from '../types/tjm';

export type BuildTjmCoachFactsResult =
  | { ok: true; facts: CopilotTjmCoachFacts }
  | { ok: false; code: 'TJM_FACTS_CONSENT_REQUIRED' | 'TJM_FACTS_INVALID' };

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('fr-FR');
}

function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || month < 1 || month > 12 || day < 1) {
    return false;
  }
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

function validRecord(record: TJMRecord): boolean {
  return (
    Number.isFinite(record.min) &&
    Number.isFinite(record.max) &&
    Number.isFinite(record.average) &&
    Number.isInteger(record.sampleCount) &&
    record.sampleCount > 0 &&
    record.min > 0 &&
    record.max <= 5_000 &&
    record.min <= record.average &&
    record.average <= record.max &&
    isIsoDate(record.date)
  );
}

function confidence(sampleCount: number): CopilotTjmCoachFacts['confidence'] {
  if (sampleCount === 0) {
    return 'insufficient';
  }
  if (sampleCount < 5) {
    return 'low';
  }
  if (sampleCount < 20) {
    return 'medium';
  }
  return 'high';
}

/**
 * Builds local, deterministic market facts. These facts are evidence supplied
 * to the remote coach; they are not a recommendation and contain no free-form
 * profile or mission text.
 */
export function buildTjmCoachFacts(
  mission: Mission,
  profile: UserProfile,
  history: TJMHistory,
  selection: CopilotConsentSelection
): BuildTjmCoachFactsResult {
  const missionConsent = new Set(selection.missionFields);
  const profileConsent = new Set(selection.profileFields);
  if (
    !missionConsent.has('stack') ||
    !missionConsent.has('displayedTjm') ||
    !profileConsent.has('keywords') ||
    !profileConsent.has('tjmBounds')
  ) {
    return { ok: false, code: 'TJM_FACTS_CONSENT_REQUIRED' };
  }
  if (
    !Number.isFinite(profile.tjmMin) ||
    !Number.isFinite(profile.tjmMax) ||
    profile.tjmMin <= 0 ||
    profile.tjmMax > 5_000 ||
    profile.tjmMin > profile.tjmMax ||
    (mission.tjm !== null &&
      (!Number.isFinite(mission.tjm) || mission.tjm <= 0 || mission.tjm > 5_000))
  ) {
    return { ok: false, code: 'TJM_FACTS_INVALID' };
  }

  const relevantStacks = new Set(
    [...mission.stack, ...profile.keywords].map(normalized).filter(Boolean)
  );
  const records = history.records.filter(
    (record) => relevantStacks.has(normalized(record.stack)) && validRecord(record)
  );
  const sampleCount = records.reduce((sum, record) => sum + record.sampleCount, 0);
  const weightedAverage =
    sampleCount === 0
      ? null
      : Math.round(
          records.reduce((sum, record) => sum + record.average * record.sampleCount, 0) /
            sampleCount
        );
  const dates = records
    .map((record) => record.date)
    .filter(Boolean)
    .sort();

  return {
    ok: true,
    facts: {
      schemaVersion: 1,
      confidence: confidence(sampleCount),
      missionDisplayedTjm: mission.tjm,
      profileBounds: {
        min: profile.tjmMin,
        target: Math.round((profile.tjmMin + profile.tjmMax) / 2),
        max: profile.tjmMax,
        currency: 'EUR',
      },
      market: {
        matchedStacks: [...new Set(records.map((record) => normalized(record.stack)))].sort(),
        recordCount: records.length,
        sampleCount,
        min: records.length > 0 ? Math.min(...records.map((record) => record.min)) : null,
        weightedAverage,
        max: records.length > 0 ? Math.max(...records.map((record) => record.max)) : null,
        trend: getDominantTrendForMission({ records }, mission),
        lastObservedAt: dates.at(-1) ?? null,
      },
    },
  };
}
