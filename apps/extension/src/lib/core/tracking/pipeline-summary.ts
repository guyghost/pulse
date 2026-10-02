import type { ApplicationStatus, MissionTracking } from '../types/tracking';
import { STATUS_LABELS } from '../types/tracking';

export interface PipelineStageSummary {
  status: ApplicationStatus;
  label: string;
  count: number;
}

export interface ApplicationPipelineSummary {
  stages: PipelineStageSummary[];
  trackedCount: number;
  activeCount: number;
  dueFollowUps: number;
  preparedNotApplied: number;
  acceptedCount: number;
  rejectedCount: number;
  bottleneck: PipelineStageSummary | null;
  acceptanceRate: number | null;
}

const PIPELINE_STATUSES: ApplicationStatus[] = [
  'detected',
  'selected',
  'application_prepared',
  'applied',
  'interview',
  'offer',
  'accepted',
  'rejected',
];

const ACTIVE_STATUSES = new Set<ApplicationStatus>([
  'detected',
  'selected',
  'application_prepared',
  'applied',
  'interview',
  'offer',
]);

/**
 * Terminal statuses: the mission reached an outcome and no longer requires a
 * follow-up. A stale `nextActionAt` on a terminal mission must never resurrect
 * as an overdue relance.
 */
const TERMINAL_STATUSES = new Set<ApplicationStatus>(['accepted', 'rejected', 'archived']);

export function isTerminalStatus(status: ApplicationStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** Explicit scheduling makes a detected mission a dossier without changing its status. */
export function isTrackedDossier(tracking: MissionTracking): boolean {
  return (
    tracking.currentStatus !== 'detected' ||
    Boolean(tracking.nextActionAt && Number.isFinite(Date.parse(tracking.nextActionAt)))
  );
}

export function isActiveDossier(tracking: MissionTracking): boolean {
  return isTrackedDossier(tracking) && !isTerminalStatus(tracking.currentStatus);
}

function isDue(nextActionAt: string | null | undefined, now: number): boolean {
  if (!nextActionAt) {
    return false;
  }
  const timestamp = Date.parse(nextActionAt);
  return Number.isFinite(timestamp) && timestamp <= now;
}

/**
 * A mission counts as a due follow-up only when it is still active (not yet
 * accepted/rejected/archived) AND its next action is in the past.
 *
 * Single source of truth shared by the pipeline summary and the Applications
 * page recommended-dossier logic, so the two can never diverge.
 */
export function isDueFollowUp(tracking: MissionTracking, now: number): boolean {
  return isActiveDossier(tracking) && isDue(tracking.nextActionAt, now);
}

export function summarizeApplicationPipeline(
  trackings: MissionTracking[],
  now: number
): ApplicationPipelineSummary {
  const counts = new Map<ApplicationStatus, number>();
  for (const status of PIPELINE_STATUSES) {
    counts.set(status, 0);
  }

  let trackedCount = 0;
  let activeCount = 0;
  let dueFollowUps = 0;

  for (const tracking of trackings) {
    if (!isTrackedDossier(tracking) || tracking.currentStatus === 'archived') {
      continue;
    }

    trackedCount += 1;
    counts.set(tracking.currentStatus, (counts.get(tracking.currentStatus) ?? 0) + 1);

    if (ACTIVE_STATUSES.has(tracking.currentStatus)) {
      activeCount += 1;
    }
    if (isDueFollowUp(tracking, now)) {
      dueFollowUps += 1;
    }
  }

  const stages = PIPELINE_STATUSES.filter(
    (status) => status !== 'detected' || (counts.get(status) ?? 0) > 0
  ).map((status) => ({
    status,
    label: STATUS_LABELS[status],
    count: counts.get(status) ?? 0,
  }));

  const activeStages = stages.filter((stage) => ACTIVE_STATUSES.has(stage.status));
  const bottleneck =
    activeStages.reduce<PipelineStageSummary | null>((current, stage) => {
      if (stage.count === 0) {
        return current;
      }
      if (!current || stage.count > current.count) {
        return stage;
      }
      return current;
    }, null) ?? null;

  const acceptedCount = counts.get('accepted') ?? 0;
  const rejectedCount = counts.get('rejected') ?? 0;
  const outcomes = acceptedCount + rejectedCount;

  return {
    stages,
    trackedCount,
    activeCount,
    dueFollowUps,
    preparedNotApplied: counts.get('application_prepared') ?? 0,
    acceptedCount,
    rejectedCount,
    bottleneck,
    acceptanceRate: outcomes > 0 ? Math.round((acceptedCount / outcomes) * 100) : null,
  };
}
