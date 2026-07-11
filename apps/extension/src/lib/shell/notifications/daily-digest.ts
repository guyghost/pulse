/**
 * Daily Digest — pushes the top unseen missions once per day.
 *
 * Unlike scan-triggered notifications (which fire when new missions are found),
 * the digest is time-based: it fires daily at a fixed hour regardless of scan
 * activity, surfacing the best opportunities the user hasn't seen yet.
 *
 * Reuses the pure Core filtering logic (filterSmartNotifications) for mission
 * selection — this module is pure orchestration (I/O + Chrome APIs).
 */
import type { Mission } from '../../core/types/mission';
import { getMissions } from '../storage/db';
import { getSeenIds, saveSeenIds } from '../storage/seen-missions';
import { getSettings } from '../storage/chrome-storage';
import { getConnectedAlertPreferences } from '../storage/connected-alert-preferences';
import { recordAlertHistoryEntry } from '../storage/alert-history';
import { filterSmartNotifications } from '../../core/scoring/smart-notification';
import { markAsSeen } from '../../core/seen/mark-seen';
import { createDeepLinkIntent } from '../../core/deep-link/deep-link-intent';
import { clearDeepLinkIntent, setDeepLinkIntent } from '../storage/session-storage';
import { isMutedUntilActive } from './notify-missions';

/** Chrome alarm name for the daily digest. */
export const DIGEST_ALARM_NAME = 'daily-digest';

/** Notification ID for the digest (used by the click handler). */
export const DIGEST_NOTIFICATION_ID = 'daily-digest';

/** Hour of the day (0-23, local time) to send the digest. */
export const DIGEST_HOUR = 9;

/** Maximum missions to include in the digest. */
export const DIGEST_MAX_RESULTS = 3;

/**
 * Compute the epoch timestamp of the next digest fire time.
 *
 * Returns the next occurrence of DIGEST_HOUR (local time). If that hour
 * has already passed today, returns tomorrow's occurrence.
 *
 * Advances by calendar day (setDate + setHours) rather than adding a fixed
 * 24h in ms, so the local wall-clock hour is preserved across DST transitions
 * (a day can be 23h on spring-forward and 25h on fall-back).
 *
 * Pure function — `now` is injected for testability.
 */
export function nextDigestTime(now: Date = new Date()): number {
  const next = new Date(now);
  next.setHours(DIGEST_HOUR, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
    next.setHours(DIGEST_HOUR, 0, 0, 0);
  }
  return next.getTime();
}

/**
 * Schedule (or reschedule) the daily digest alarm.
 *
 * Creates a one-shot Chrome alarm that fires at the next DIGEST_HOUR (local
 * time). The alarm handler reschedules itself after each fire, so local time
 * is preserved across DST transitions (a fixed periodInMinutes of 24*60 would
 * drift by ±1h on DST changeovers).
 *
 * Call during service worker initialization and when settings change.
 */
export function scheduleDailyDigestAlarm(): void {
  chrome.alarms.create(DIGEST_ALARM_NAME, {
    when: nextDigestTime(),
  });
}

export interface DigestResult {
  sent: boolean;
  missionIds: string[];
}

/**
 * Send a daily digest notification with the top unseen missions.
 *
 * Loads stored missions from IndexedDB, selects the top unseen high-score
 * missions (max 3), and pushes a Chrome notification. Notified missions
 * are marked as seen so they won't reappear in future digests or scan alerts.
 *
 * No-op if notifications are disabled, connected alerts are disabled,
 * or no qualifying missions exist.
 */
export async function sendDailyDigest(): Promise<DigestResult> {
  // Guard: global notifications must be enabled
  let settings;
  try {
    settings = await getSettings();
  } catch {
    return { sent: false, missionIds: [] };
  }
  if (!settings.notifications) {
    return { sent: false, missionIds: [] };
  }

  // Respect connected-alert preferences (user may have disabled or muted alerts)
  const alertPrefs = await getConnectedAlertPreferences();
  if (
    alertPrefs &&
    (!alertPrefs.enabled || isMutedUntilActive(alertPrefs.mutedUntil, Date.now()))
  ) {
    return { sent: false, missionIds: [] };
  }

  // Load stored missions
  let missions: Mission[];
  try {
    missions = await getMissions();
  } catch {
    return { sent: false, missionIds: [] };
  }
  if (missions.length === 0) {
    return { sent: false, missionIds: [] };
  }

  // Load seen IDs
  let seenIds: string[] = [];
  try {
    seenIds = await getSeenIds();
  } catch {
    // proceed without seen filtering
  }

  // Filter criteria: connected prefs or settings defaults
  const scoreThreshold = alertPrefs?.scoreThreshold ?? settings.notificationScoreThreshold;
  const requiredStacks = alertPrefs?.requiredStacks ?? [];
  const minTJM = alertPrefs?.minDailyRate ?? 0;

  // Select top missions (pure Core filtering)
  const topMissions = filterSmartNotifications(missions, seenIds, {
    scoreThreshold,
    requiredStacks,
    minTJM,
    maxResults: DIGEST_MAX_RESULTS,
  });

  if (topMissions.length === 0) {
    return { sent: false, missionIds: [] };
  }

  // Build digest message
  const count = topMissions.length;
  const title = count === 1 ? '📌 Top mission du jour' : `📌 Top ${count} missions du jour`;
  const message = topMissions
    .map((m) => {
      const tjm = m.tjm ? ` — ${m.tjm}€/j` : '';
      return `• ${m.title}${tjm}`;
    })
    .join('\n');

  const notifiedIds = topMissions.map((m) => m.id);
  const now = Date.now();

  // Create notification. Persist the digest deep-link intent before the
  // notification is visible so clicks cannot consume a stale high-score intent.
  try {
    const intent = createDeepLinkIntent(notifiedIds, 'digest', now);
    if (intent) {
      await setDeepLinkIntent(intent);
    } else {
      await clearDeepLinkIntent();
    }

    await chrome.notifications.create(DIGEST_NOTIFICATION_ID, {
      type: 'basic',
      iconUrl: 'static/icons/icon-128.png',
      title,
      message,
      priority: 2,
      isClickable: true,
    });
  } catch (err) {
    console.error('[MissionPulse] Failed to send daily digest:', err);
    await clearDeepLinkIntent().catch(() => {});
    return { sent: false, missionIds: [] };
  }

  // Mark notified missions as seen so they don't reappear
  try {
    const updatedSeenIds = markAsSeen(seenIds, notifiedIds);
    await saveSeenIds(updatedSeenIds);
  } catch {
    // Non-critical: missions may resurface in next digest
  }

  // Record alert history entry for consistency with scan notifications
  try {
    await recordAlertHistoryEntry({
      id: `digest-${now}-${notifiedIds.slice(0, 3).join('-').slice(0, 90)}`,
      triggeredAt: now,
      missionCount: count,
      missionIds: notifiedIds,
      missionTitles: topMissions.map((m) => m.title),
      scoreThreshold,
      minDailyRate: minTJM,
      requiredStacks,
      maxResults: DIGEST_MAX_RESULTS,
    });
  } catch {
    // Non-critical
  }

  return { sent: true, missionIds: notifiedIds };
}
