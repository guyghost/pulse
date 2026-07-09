import type { RemoteType } from '$lib/core/types/mission';

export interface RemoteOption {
  readonly value: RemoteType | 'any';
  readonly label: string;
}

/**
 * Shared work-mode options for the profile preference (onboarding + settings).
 * Values map to `RemoteType | 'any'`; `'any'` means "no preference".
 * Both surfaces must use this constant so labels/values stay in sync.
 */
export const REMOTE_OPTIONS: readonly RemoteOption[] = [
  { value: 'any', label: 'Indifférent' },
  { value: 'full', label: 'Remote' },
  { value: 'hybrid', label: 'Hybride' },
  { value: 'onsite', label: 'Présentiel' },
];
