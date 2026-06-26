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
  'selected',
  'application_prepared',
  'applied',
  'interview',
  'offer',
  'accepted',
  'rejected',
];

const ACTIVE_STATUSES = new Set<ApplicationStatus>([
  'selected',
  'application_prepared',
  'applied',
  'interview',
  'offer',
]);

function isDue(nextActionAt: string | null | undefined, now: number): boolean {
  if (!nextActionAt) {
    return false;
  }
  const timestamp = Date.parse(nextActionAt);
  return Number.isFinite(timestamp) && timestamp <= now;
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
    if (tracking.currentStatus === 'detected' || tracking.currentStatus === 'archived') {
      continue;
    }

    trackedCount += 1;
    counts.set(tracking.currentStatus, (counts.get(tracking.currentStatus) ?? 0) + 1);

    if (ACTIVE_STATUSES.has(tracking.currentStatus)) {
      activeCount += 1;
    }
    if (isDue(tracking.nextActionAt, now)) {
      dueFollowUps += 1;
    }
  }

  const stages = PIPELINE_STATUSES.map((status) => ({
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
