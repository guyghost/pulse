/**
 * Availability domain types — pure data, no I/O.
 *
 * The freelancer declares when they are next available; the value is persisted
 * on `UserProfile.availability` and pushed to the mission connectors via the
 * availability sync machine
 * (see `apps/extension/src/models/availability-sync.model.md`).
 */

/** When the freelancer is next available. */
export type AvailabilityStatus = 'immediate' | 'from-date' | 'in-mission-until' | 'unavailable';

/**
 * Canonical availability record. Non-deterministic values (`updatedAt`) are
 * injected by the shell via {@link normalizeAvailability}.
 *
 * Invariant (enforced by the normalizer):
 * - `immediate` / `unavailable` ⇒ `date === null`
 * - `from-date` / `in-mission-until` ⇒ `date` is a valid `YYYY-MM-DD`
 *   - `from-date` → first available day
 *   - `in-mission-until` → last day of the current mission
 */
export interface Availability {
  status: AvailabilityStatus;
  date: string | null;
  note: string;
  updatedAt: number;
}

/** French labels for each status (copy + a11y). */
export const AVAILABILITY_STATUS_LABELS: Record<AvailabilityStatus, string> = {
  immediate: 'Disponible immédiatement',
  'from-date': 'Disponible à partir du',
  'in-mission-until': "En mission jusqu'au",
  unavailable: 'Non disponible',
};

/** Select ordering (most useful first). */
export const AVAILABILITY_STATUS_ORDER: AvailabilityStatus[] = [
  'immediate',
  'from-date',
  'in-mission-until',
  'unavailable',
];

/** Maximum length of the free-text note (enforced by the normalizer). */
export const AVAILABILITY_NOTE_MAX_LENGTH = 280;
