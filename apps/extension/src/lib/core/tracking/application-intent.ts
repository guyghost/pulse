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
