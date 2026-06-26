export interface AlertHistoryEntry {
  readonly id: string;
  readonly triggeredAt: number;
  readonly missionCount: number;
  readonly missionIds: string[];
  readonly missionTitles: string[];
  readonly scoreThreshold: number;
  readonly minDailyRate: number;
  readonly requiredStacks: string[];
  readonly maxResults: number;
}
