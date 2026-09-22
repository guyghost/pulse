import { MIN_BRIEFING_INTERVAL_MS } from '../../core/feed/catch-up-briefing';

const STORAGE_KEY = 'lastVisitAt';

/**
 * Catch-up briefing persistence (shell).
 *
 * Tracks the `lastVisitAt` baseline in `chrome.storage.local`. The write is
 * throttled to a 30-minute minimum interval so a quick reopen does not reset
 * the briefing — the same threshold used by `computeCatchUpBriefing`.
 */

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/** Read the persisted last-visit baseline (null when never set or corrupt). */
export async function getLastVisitAt(): Promise<Date | null> {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  const raw = result[STORAGE_KEY];
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return null;
  }
  const date = new Date(raw);
  return isValidDate(date) ? date : null;
}

/**
 * Persist a last-visit baseline unconditionally (used by tests / explicit
 * set). `now` is injected for determinism.
 */
export async function setLastVisitAt(now: Date): Promise<void> {
  if (isValidDate(now)) {
    await chrome.storage.local.set({ [STORAGE_KEY]: now.getTime() });
  }
}

/**
 * Advance the baseline only when the previous visit is older than the
 * 30-minute threshold (or absent). Returns true when a write happened.
 */
export async function touchLastVisitAt(now: Date): Promise<boolean> {
  const previous = await getLastVisitAt();
  if (previous !== null && now.getTime() - previous.getTime() < MIN_BRIEFING_INTERVAL_MS) {
    return false;
  }
  await setLastVisitAt(now);
  return true;
}
