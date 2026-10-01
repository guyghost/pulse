import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONNECTED_ALERT_PREFERENCES } from '../../../src/lib/core/types/alert-preferences';

const mocks = vi.hoisted(() => ({ sendMessage: vi.fn(), getSettings: vi.fn() }));
vi.mock('../../../src/lib/shell/messaging/bridge', () => ({ sendMessage: mocks.sendMessage }));
vi.mock('../../../src/lib/shell/facades/settings.facade', () => ({
  getSettings: mocks.getSettings,
}));
import { getAlertPreferences } from '../../../src/lib/shell/facades/alert-preferences.facade';

beforeEach(() => {
  mocks.sendMessage.mockReset();
  mocks.getSettings.mockReset();
});
describe('alert preferences reads', () => {
  it('keeps the existing threshold and enabled choice without writing', async () => {
    const stored = { ...DEFAULT_CONNECTED_ALERT_PREFERENCES, scoreThreshold: 83, enabled: false };
    mocks.sendMessage.mockResolvedValue({
      type: 'CONNECTED_ALERT_PREFERENCES_RESULT',
      payload: stored,
    });
    expect(await getAlertPreferences()).toEqual(stored);
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.getSettings).not.toHaveBeenCalled();
  });

  it('uses the effective legacy threshold only after a valid preference absence', async () => {
    mocks.sendMessage.mockResolvedValue({
      type: 'CONNECTED_ALERT_PREFERENCES_RESULT',
      payload: null,
    });
    mocks.getSettings.mockResolvedValue({ notificationScoreThreshold: 83 });
    expect((await getAlertPreferences()).scoreThreshold).toBe(83);
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('never presents a failed read as default preferences ready to overwrite storage', async () => {
    mocks.sendMessage.mockResolvedValue({ type: 'SETTINGS_RESULT', payload: null });
    await expect(getAlertPreferences()).rejects.toThrow('Unexpected alert preferences');
    expect(mocks.getSettings).not.toHaveBeenCalled();
    mocks.sendMessage.mockRejectedValue(new Error('Read unavailable'));
    await expect(getAlertPreferences()).rejects.toThrow('Read unavailable');
  });
});
