/**
 * Deep-link intent — pure helpers.
 *
 * No I/O, no `Date.now()`, no side effects. `now` is injected by the shell.
 * Used by the notification path (to build an intent) and the feed focus path
 * (to select matching missions). See `src/models/notification-deep-link.model.md`.
 */
import type { Mission } from '../types/mission';

export type DeepLinkIntentSource = 'notification' | 'digest';

export interface DeepLinkIntent {
  /** Non-empty, deduped, bounded list of mission ids to focus on. */
  focusMissionIds: string[];
  source: DeepLinkIntentSource;
  /** Epoch milliseconds. Injected by the caller — never `Date.now()` here. */
  triggeredAt: number;
}

/** Display cap — mirrors the notification `maxResults` ceiling. */
export const DEEP_LINK_FOCUS_MAX = 20;

/**
 * Build an intent from raw notified mission ids.
 *
 * - Dedupes, preserving first-seen order.
 * - Bounds to {@link DEEP_LINK_FOCUS_MAX} entries.
 * - Returns `null` if no non-empty ids remain (invariant I2: never emit an
 *   empty intent).
 */
export function createDeepLinkIntent(
  missionIds: readonly string[],
  source: DeepLinkIntentSource,
  now: number
): DeepLinkIntent | null {
  const seen = new Set<string>();
  const focusMissionIds: string[] = [];
  for (const id of missionIds) {
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) {
      continue;
    }
    seen.add(id);
    focusMissionIds.push(id);
    if (focusMissionIds.length >= DEEP_LINK_FOCUS_MAX) {
      break;
    }
  }

  if (focusMissionIds.length === 0) {
    return null;
  }

  return { focusMissionIds, source, triggeredAt: now };
}

/**
 * Select the missions to focus on, preserving the feed's own order (stable).
 * Returns an empty array if no mission matches — caller treats that as stale.
 */
export function selectFocusMissions(
  missions: readonly Mission[],
  intent: DeepLinkIntent
): Mission[] {
  const wanted = new Set(intent.focusMissionIds);
  return missions.filter((m) => wanted.has(m.id));
}

/** True if at least one intent id is present in the loaded missions. */
export function hasFocusMatch(
  missions: readonly Mission[],
  intent: DeepLinkIntent | null
): boolean {
  if (!intent) {
    return false;
  }
  return selectFocusMissions(missions, intent).length > 0;
}

/**
 * Relative "il y a Xmin" formatter (FR). Pure — `now` injected.
 * Returns the compact French form used in the focus banner.
 */
export function formatFocusSince(triggeredAt: number, now: number): string {
  const deltaMs = now - triggeredAt;
  if (!Number.isFinite(deltaMs) || deltaMs < 0) {
    return 'à l’instant';
  }
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 45) {
    return 'à l’instant';
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return minutes <= 1 ? 'il y a 1 min' : `il y a ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return hours <= 1 ? 'il y a 1 h' : `il y a ${hours} h`;
  }
  const days = Math.floor(hours / 24);
  return days <= 1 ? 'hier' : `il y a ${days} j`;
}
