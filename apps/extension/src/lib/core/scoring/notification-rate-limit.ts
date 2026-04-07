/**
 * Notification rate limiting — Pure functions.
 *
 * Controls notification frequency to avoid spamming the user.
 * All functions are pure: non-deterministic values (current time) are injected.
 */

/** Minimum interval between notifications in milliseconds (5 minutes) */
export const NOTIFICATION_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Check if enough time has passed since the last notification.
 *
 * @param lastNotificationTime - Timestamp of the last notification (ms since epoch), or null if never
 * @param now - Current timestamp (ms since epoch)
 * @returns true if a new notification is allowed
 */
export const canNotify = (lastNotificationTime: number | null, now: number): boolean => {
  if (lastNotificationTime === null) return true;
  return now - lastNotificationTime >= NOTIFICATION_COOLDOWN_MS;
};
