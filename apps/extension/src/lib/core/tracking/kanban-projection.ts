import type { Mission } from '../types/mission';
import type { ApplicationStatus, MissionTracking } from '../types/tracking';
import { STATUS_LABELS } from '../types/tracking';

/**
 * Kanban board projection (models/application-kanban.model.md).
 * Read-only view over tracked missions; column membership is derived from
 * `currentStatus` only — this module never decides a transition.
 */
export interface KanbanCard {
  missionId: string;
  title: string;
  client: string | null;
  status: ApplicationStatus;
  /** Timestamp (epoch ms) of the latest tracking history entry, 0 when none. */
  lastActivityAt: number;
}

export interface KanbanColumn {
  status: ApplicationStatus;
  label: string;
  cards: KanbanCard[];
}

const KANBAN_STATUSES: ApplicationStatus[] = [
  'selected',
  'application_prepared',
  'applied',
  'interview',
  'offer',
];

/** Last activity of a tracking record, 0 when the history is empty. */
export function getTrackingLastActivity(record: MissionTracking | null): number {
  if (!record || record.history.length === 0) {
    return 0;
  }
  return record.history[record.history.length - 1].timestamp;
}

/**
 * Project tracked missions into the five active pipeline columns.
 *
 * Pure: terminal (accepted/rejected/archived) and undetected records are
 * excluded, cards are ordered by descending last activity, and the sum of
 * all cards equals the number of active tracked dossiers.
 */
export function buildKanbanBoard(
  missions: Mission[],
  trackings: MissionTracking[]
): KanbanColumn[] {
  const missionsById = new Map(missions.map((mission) => [mission.id, mission]));

  const cards: KanbanCard[] = [];
  for (const record of trackings) {
    if (!KANBAN_STATUSES.includes(record.currentStatus)) {
      continue;
    }
    const mission = missionsById.get(record.missionId);
    cards.push({
      missionId: record.missionId,
      title: mission?.title ?? 'Dossier suivi',
      client: mission?.client ?? null,
      status: record.currentStatus,
      lastActivityAt: getTrackingLastActivity(record),
    });
  }

  cards.sort((left, right) => right.lastActivityAt - left.lastActivityAt);

  return KANBAN_STATUSES.map((status) => ({
    status,
    label: STATUS_LABELS[status],
    cards: cards.filter((card) => card.status === status),
  }));
}
