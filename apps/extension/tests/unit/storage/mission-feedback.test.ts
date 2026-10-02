import { beforeEach, expect, it, vi } from 'vitest';
import {
  getMissionFeedback,
  saveMissionFeedback,
} from '../../../src/lib/shell/storage/mission-feedback';
let data: Record<string, unknown>;
const set = vi.fn(async (next: Record<string, unknown>) => {
  Object.assign(data, next);
});
beforeEach(() => {
  data = {};
  set.mockClear();
  vi.stubGlobal('chrome', { storage: { local: { get: async () => data, set } } });
});
it('persists, modifies and clears local feedback', async () => {
  await saveMissionFeedback({ m: 'relevant' });
  expect(await getMissionFeedback()).toEqual({ m: 'relevant' });
  await saveMissionFeedback({ m: 'off-target' });
  expect(await getMissionFeedback()).toEqual({ m: 'off-target' });
  await saveMissionFeedback({});
  expect(await getMissionFeedback()).toEqual({});
});
it('rejects storage failures', async () => {
  set.mockRejectedValueOnce(new Error('quota'));
  await expect(saveMissionFeedback({ m: 'relevant' })).rejects.toThrow('quota');
});
it('does not interpret invalid stored feedback as a user decision', async () => {
  data.missionLocalFeedback = { m: 'cloud' };
  await expect(getMissionFeedback()).rejects.toThrow();
});

it('distinguishes a successful absent key from failed reads', async () => {
  expect(await getMissionFeedback()).toEqual({});
  data.missionLocalFeedback = { existing: 'relevant' };
  chrome.storage.local.get = vi.fn(async () => {
    throw new Error('read failed');
  });
  await expect(getMissionFeedback()).rejects.toThrow('read failed');
  expect(data.missionLocalFeedback).toEqual({ existing: 'relevant' });
  expect(set).not.toHaveBeenCalled();
});
