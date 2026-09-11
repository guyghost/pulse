/**
 * Persistance du journal de première consultation (chrome.storage.local).
 * Événement shell au moment du mark-seen côté feed — voir
 * src/models/time-to-review.model.md. Les marquages automatiques
 * (notification, digest) ne doivent PAS appeler journalFirstViews.
 */
import {
  mergeFirstViewed,
  coerceIso,
  type FirstViewedEntryInput,
  type ReviewJournal,
} from '../../core/seen/first-viewed';
import type { Mission } from '../../core/types/mission';

const STORAGE_KEY = 'reviewJournal';

export async function getReviewJournal(): Promise<ReviewJournal> {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  const value = result[STORAGE_KEY];
  if (value === undefined || value === null || typeof value !== 'object') {
    return {};
  }
  return value as ReviewJournal;
}

/**
 * Journalise la première consultation des missions données (first-write-wins).
 * `capturedAt` est un snapshot de Mission.scrapedAt ; null si la mission n'est
 * pas dans `missions` (ou horodatage illisible).
 */
export async function journalFirstViews(missionIds: string[], missions: Mission[]): Promise<void> {
  if (missionIds.length === 0) {
    return;
  }

  const missionsById = new Map(missions.map((mission) => [mission.id, mission]));
  const viewedAt = new Date().toISOString();
  const entries: FirstViewedEntryInput[] = missionIds.map((missionId) => {
    const mission = missionsById.get(missionId);
    return {
      missionId,
      viewedAt,
      capturedAt: mission ? coerceIso(mission.scrapedAt) : null,
    };
  });

  const current = await getReviewJournal();
  const updated = mergeFirstViewed(current, entries);
  if (updated !== current) {
    await chrome.storage.local.set({ [STORAGE_KEY]: updated });
  }
}
