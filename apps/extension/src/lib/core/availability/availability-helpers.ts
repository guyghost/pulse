/**
 * Pure helpers for the availability editor and cross-platform push.
 *
 * STRICTLY PURE: no Date, no async, no I/O, no side effects. Non-deterministic
 * values (`now`) are injected by the shell caller.
 *
 * See `apps/extension/src/models/availability-sync.model.md` for the state
 * machine that consumes these helpers.
 */
import type { Availability, AvailabilityStatus } from '../types/availability';
import { AVAILABILITY_NOTE_MAX_LENGTH } from '../types/availability';
import type { PlatformSyncTarget } from '../cv/experience-helpers';

export type { PlatformSyncTarget };

/** Statuses that carry a meaningful `date`. */
const DATE_STATUSES: ReadonlySet<AvailabilityStatus> = new Set(['from-date', 'in-mission-until']);

/** Returns true when `value` is a valid `YYYY-MM-DD` calendar date. */
export function isValidAvailabilityDate(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  // Construct with time components to avoid UTC offset surprises; invalid
  // calendar dates (e.g. 2026-02-31) roll over and change the day.
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/**
 * Normalize a raw/edited availability draft into a canonical
 * {@link Availability}. Enforces the status↔date invariant and trims/caps the
 * note. Never throws.
 */
export function normalizeAvailability(
  draft: Partial<Availability> & { status: AvailabilityStatus },
  now: number
): Availability {
  const status = draft.status;
  const rawDate = DATE_STATUSES.has(status) ? (draft.date ?? null) : null;
  const date = isValidAvailabilityDate(rawDate) ? rawDate : null;
  const note = (draft.note ?? '').trim().slice(0, AVAILABILITY_NOTE_MAX_LENGTH);

  return {
    status,
    date,
    note,
    updatedAt: now,
  };
}

/** "01/08/2026" from "2026-08-01" (French dd/MM/YYYY); "" when invalid. */
export function formatAvailabilityDate(value: string | null | undefined): string {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match || !isValidAvailabilityDate(value)) {
    return '';
  }
  // match[1]=YYYY, match[2]=MM, match[3]=DD → French dd/MM/YYYY.
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/**
 * Format the availability into a copy-pasteable one-liner (plus optional note
 * on a new line). This is what the user pastes into each platform's
 * availability field.
 */
export function formatAvailabilityPayload(availability: Availability): string {
  const head = availabilityHeadline(availability);
  const note = availability.note.trim();
  return note.length > 0 ? `${head}\n${note}` : head;
}

function availabilityHeadline(availability: Availability): string {
  switch (availability.status) {
    case 'immediate':
      return 'Disponible immédiatement';
    case 'from-date':
      return `Disponible à partir du ${formatAvailabilityDate(availability.date)}`;
    case 'in-mission-until':
      return `En mission jusqu'au ${formatAvailabilityDate(availability.date)}`;
    case 'unavailable':
      return 'Non disponible';
  }
}

/**
 * Build the per-platform payload map. Every target receives the same string —
 * platforms format availability identically. Returns an empty map when there
 * are no targets (still callable with a valid availability).
 */
export function buildAvailabilityPayloads(
  availability: Availability,
  targets: readonly PlatformSyncTarget[]
): Map<string, string> {
  const payload = formatAvailabilityPayload(availability);
  const map = new Map<string, string>();
  for (const target of targets) {
    map.set(target.id, payload);
  }
  return map;
}

/** A blank draft for the editor when availability has never been set. */
export function blankAvailabilityDraft(): Availability {
  return {
    status: 'immediate',
    date: null,
    note: '',
    updatedAt: 0,
  };
}
