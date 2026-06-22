import {
  DEFAULT_CONNECTED_ALERT_PREFERENCES,
  normalizeConnectedAlertPreferences,
  type ConnectedAlertPreferences,
} from '$lib/core/types/alert-preferences';
import { sendMessage } from '$lib/shell/messaging/bridge';

export async function getAlertPreferences(): Promise<ConnectedAlertPreferences> {
  const response = await sendMessage({ type: 'GET_CONNECTED_ALERT_PREFERENCES' });
  if (response.type !== 'CONNECTED_ALERT_PREFERENCES_RESULT') {
    return DEFAULT_CONNECTED_ALERT_PREFERENCES;
  }

  return response.payload ?? DEFAULT_CONNECTED_ALERT_PREFERENCES;
}

export async function saveAlertPreferences(
  preferences: ConnectedAlertPreferences
): Promise<ConnectedAlertPreferences> {
  const normalized = normalizeConnectedAlertPreferences({
    ...preferences,
    revision: preferences.revision + 1,
    updatedAt: new Date().toISOString(),
  });

  const response = await sendMessage({
    type: 'SAVE_CONNECTED_ALERT_PREFERENCES',
    payload: normalized,
  });

  if (response.type !== 'CONNECTED_ALERT_PREFERENCES_SAVED' || !response.payload.saved) {
    throw new Error('Alert preferences save failed.');
  }

  return normalized;
}
