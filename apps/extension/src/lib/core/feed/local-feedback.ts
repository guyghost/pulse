import type { Mission } from '../types/mission';
import type { FeedScoreBucket } from '../types/feed-view';
import { getMissionScore } from '../scoring/mission-grade';
export type MissionFeedback = 'relevant' | 'off-target';
export type MissionFeedbackMap = Record<string, MissionFeedback>;
export function matchesMinimumScore(mission: Mission, minimum: FeedScoreBucket): boolean {
  return (getMissionScore(mission) ?? 0) >= { strong: 80, good: 60, weak: 40 }[minimum];
}
/** Local feedback changes ordering only. Canonical scores remain untouched. */
export function sortByLocalFeedback(missions: Mission[], feedback: MissionFeedbackMap): Mission[] {
  const priority = (id: string) =>
    feedback[id] === 'relevant' ? 1 : feedback[id] === 'off-target' ? -1 : 0;
  return [...missions].sort(
    (a, b) =>
      priority(b.id) - priority(a.id) || (getMissionScore(b) ?? 0) - (getMissionScore(a) ?? 0)
  );
}
