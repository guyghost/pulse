import { APPLICATION_TRANSITIONS, type ApplicationStage } from '@pulse/domain';

/**
 * Mission tracking types — pure types for application lifecycle management.
 *
 * Tracks the user's interaction with each mission from discovery to outcome.
 * All types are pure data — no I/O, no side effects.
 */

/**
 * Application status lifecycle for a mission.
 *
 * Valid transitions:
 *   new → interested → applying → applied → (rejected | accepted)
 *   new → archived
 *   interested → archived
 *   applied → rejected
 *   applied → accepted
 *
 * Any status → archived (can always archive)
 */
export type ApplicationStatus = ApplicationStage;

/**
 * A single status transition event in the tracking history.
 */
export interface StatusTransition {
  readonly from: ApplicationStatus | null; // null for initial status
  readonly to: ApplicationStatus;
  readonly timestamp: number; // epoch ms
  readonly note: string | null; // optional user note
}

/**
 * Full tracking record for a mission.
 */
export interface MissionTracking {
  readonly missionId: string;
  readonly currentStatus: ApplicationStatus;
  readonly history: StatusTransition[];
  /** IDs of generated assets (pitch, cover message, etc.) */
  readonly generatedAssetIds: string[];
  /** User's personal rating (1-5), null if unrated */
  readonly userRating: number | null;
  /** Free-text user notes */
  readonly notes: string;
  /** Next follow-up/action timestamp synchronized with the connected dashboard. */
  readonly nextActionAt?: string | null;
}

/**
 * Valid transition map — defines the state machine.
 * Each key maps to the set of valid next statuses.
 */
export const VALID_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = Object.fromEntries(
  Object.entries(APPLICATION_TRANSITIONS).map(([stage, nextStages]) => [stage, [...nextStages]])
) as Record<ApplicationStatus, ApplicationStatus[]>;

/**
 * Human-readable labels for each status.
 */
export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  detected: 'Détectée',
  selected: 'Sélectionnée',
  application_prepared: 'Préparée',
  applied: 'Candidaté',
  interview: 'Entretien',
  offer: 'Offre',
  rejected: 'Refusé',
  accepted: 'Accepté',
  archived: 'Archivé',
};

/**
 * Color variants for status badges in UI.
 */
export const STATUS_VARIANTS: Record<
  ApplicationStatus,
  'emerald' | 'blue' | 'amber' | 'red' | 'gray' | 'purple'
> = {
  detected: 'blue',
  selected: 'purple',
  application_prepared: 'amber',
  applied: 'emerald',
  interview: 'purple',
  offer: 'amber',
  rejected: 'red',
  accepted: 'emerald',
  archived: 'gray',
};
