import { z } from 'zod';
import type { MissionFeedbackMap } from '$lib/core/feed/local-feedback';
const KEY = 'missionLocalFeedback';
const schema = z.record(z.string().min(1).max(256), z.enum(['relevant', 'off-target']));
export async function getMissionFeedback(): Promise<MissionFeedbackMap> {
  const stored = await chrome.storage.local.get(KEY);
  const parsed = schema.safeParse(stored[KEY]);
  return parsed.success ? parsed.data : {};
}
export async function saveMissionFeedback(feedback: MissionFeedbackMap): Promise<void> {
  await chrome.storage.local.set({ [KEY]: schema.parse(feedback) });
}
