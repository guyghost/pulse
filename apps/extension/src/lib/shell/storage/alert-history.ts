import { z } from 'zod';
import type { AlertHistoryEntry } from '../../core/types/alert-history';

const ALERT_HISTORY_KEY = 'missionpulse.alertHistory';
const MAX_ALERT_HISTORY_ENTRIES = 20;
const MAX_STORED_MISSION_IDS = 20;
const MAX_STORED_MISSION_TITLES = 5;

const AlertHistoryEntrySchema = z
  .object({
    id: z.string().min(1).max(180),
    triggeredAt: z.number().int().min(0),
    missionCount: z.number().int().min(0).max(500),
    missionIds: z.array(z.string().min(1).max(256)).max(MAX_STORED_MISSION_IDS),
    missionTitles: z.array(z.string().min(1).max(180)).max(MAX_STORED_MISSION_TITLES),
    scoreThreshold: z.number().int().min(0).max(100),
    minDailyRate: z.number().int().min(0).max(5000),
    requiredStacks: z.array(z.string().min(1).max(40)).max(12),
    maxResults: z.number().int().min(1).max(20),
  })
  .strict();

const AlertHistorySchema = z.array(AlertHistoryEntrySchema).max(MAX_ALERT_HISTORY_ENTRIES);

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function normalizeAlertHistoryEntry(entry: AlertHistoryEntry): AlertHistoryEntry {
  return {
    id: entry.id.slice(0, 180),
    triggeredAt: clampInteger(entry.triggeredAt, 0, Number.MAX_SAFE_INTEGER),
    missionCount: clampInteger(entry.missionCount, 0, 500),
    missionIds: entry.missionIds
      .filter((id) => id.trim().length > 0)
      .map((id) => id.slice(0, 256))
      .slice(0, MAX_STORED_MISSION_IDS),
    missionTitles: entry.missionTitles
      .filter((title) => title.trim().length > 0)
      .map((title) => title.slice(0, 180))
      .slice(0, MAX_STORED_MISSION_TITLES),
    scoreThreshold: clampInteger(entry.scoreThreshold, 0, 100),
    minDailyRate: clampInteger(entry.minDailyRate, 0, 5000),
    requiredStacks: entry.requiredStacks
      .filter((stack) => stack.trim().length > 0)
      .map((stack) => stack.slice(0, 40))
      .slice(0, 12),
    maxResults: clampInteger(entry.maxResults, 1, 20),
  };
}

export async function getAlertHistory(): Promise<AlertHistoryEntry[]> {
  try {
    const stored = await chrome.storage.local.get(ALERT_HISTORY_KEY);
    const parsed = AlertHistorySchema.safeParse(stored[ALERT_HISTORY_KEY]);

    if (!parsed.success) {
      return [];
    }

    return parsed.data.sort((a, b) => b.triggeredAt - a.triggeredAt);
  } catch {
    return [];
  }
}

export async function recordAlertHistoryEntry(entry: AlertHistoryEntry): Promise<void> {
  const normalized = normalizeAlertHistoryEntry(entry);
  const history = await getAlertHistory();
  const nextHistory = [normalized, ...history.filter((item) => item.id !== normalized.id)].slice(
    0,
    MAX_ALERT_HISTORY_ENTRIES
  );

  await chrome.storage.local.set({ [ALERT_HISTORY_KEY]: nextHistory });
}

export async function clearAlertHistory(): Promise<void> {
  await chrome.storage.local.remove(ALERT_HISTORY_KEY);
}
