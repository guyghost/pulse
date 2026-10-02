import { beforeEach, describe, expect, it, vi } from 'vitest';
const bridge = vi.hoisted(() => ({ sendMessage: vi.fn() }));
vi.mock('../../../src/lib/shell/messaging/bridge', () => bridge);
import {
  getMissionFeedback,
  saveMissionFeedback,
} from '../../../src/lib/shell/facades/feed-data.facade';
import { verifySourceSession } from '../../../src/lib/shell/onboarding/verify-source-session';
beforeEach(() => vi.resetAllMocks());
describe('review context boundaries', () => {
  it('loads and saves feedback through typed worker requests', async () => {
    bridge.sendMessage.mockResolvedValueOnce({
      type: 'MISSION_FEEDBACK_RESULT',
      payload: { m: 'relevant' },
    });
    expect(await getMissionFeedback()).toEqual({ m: 'relevant' });
    bridge.sendMessage.mockResolvedValueOnce({
      type: 'MISSION_FEEDBACK_SAVED',
      payload: { saved: true },
    });
    await saveMissionFeedback({ m: 'off-target' });
    expect(bridge.sendMessage.mock.calls).toEqual([
      [{ type: 'GET_MISSION_FEEDBACK' }],
      [{ type: 'SAVE_MISSION_FEEDBACK', payload: { m: 'off-target' } }],
    ]);
  });
  it('propagates feedback reads and writes that fail instead of fabricating empty state', async () => {
    bridge.sendMessage.mockResolvedValueOnce({ type: 'MISSION_FEEDBACK_FAILED' });
    await expect(getMissionFeedback()).rejects.toThrow('Impossible de charger');
    bridge.sendMessage.mockResolvedValueOnce({
      type: 'MISSION_FEEDBACK_SAVED',
      payload: { saved: false },
    });
    await expect(saveMissionFeedback({})).rejects.toThrow('Impossible d’enregistrer');
  });
  it('requests the session from the worker and distinguishes an unavailable worker', async () => {
    bridge.sendMessage.mockResolvedValueOnce({
      type: 'SOURCE_SESSION_RESULT',
      payload: { sourceId: 'lehibou', status: 'session-missing' },
    });
    expect(await verifySourceSession('lehibou')).toEqual({
      sourceId: 'lehibou',
      status: 'session-missing',
    });
    expect(bridge.sendMessage).toHaveBeenCalledWith({
      type: 'VERIFY_SOURCE_SESSION',
      payload: { sourceId: 'lehibou' },
    });
    bridge.sendMessage.mockRejectedValueOnce(new Error('Worker unavailable'));
    expect((await verifySourceSession('lehibou')).status).toBe('unavailable');
  });
});
