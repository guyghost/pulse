import { transitionStatus } from './transitions';
import type { MissionTracking } from '../types/tracking';
import type { ApplicationStatus } from '../types/tracking';
/** Opening a source selects a mission. Only explicit confirmation records sending. */
export function applicationIntentPath(
  status: ApplicationStatus | null,
  intent: 'open' | 'confirm'
): ApplicationStatus[] {
  const path: ApplicationStatus[] = ['selected', 'application_prepared', 'applied'];
  const start =
    status === null || status === 'detected'
      ? 0
      : status === 'selected'
        ? 1
        : status === 'application_prepared'
          ? 2
          : 3;
  return intent === 'open' ? (start === 0 ? ['selected'] : []) : path.slice(start);
}

/** Build a complete confirmation snapshot before any persistence occurs. */
export function confirmApplicationTracking(
  tracking: MissionTracking,
  now: number
): MissionTracking {
  let updated = tracking;
  for (const status of applicationIntentPath(tracking.currentStatus, 'confirm')) {
    const next = transitionStatus(updated, status, now, null);
    if (!next) {
      throw new Error('Invalid application confirmation transition');
    }
    updated = next;
  }
  return updated;
}
