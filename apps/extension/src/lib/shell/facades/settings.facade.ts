/**
 * Chrome Storage — single entry point for settings persistence.
 *
 * UI pages import this instead of individual storage modules.
 */

import type { UserProfile } from '$lib/core/types/profile';
import type { AppSettings } from '$lib/core/types/app-settings';
import { sendMessage } from '$lib/shell/messaging/bridge';
import {
  getSettingsReleaseSnapshot,
  saveSettingsRelease,
} from '$lib/shell/facades/settings-release.facade';

export async function getSettings(): Promise<AppSettings> {
  return (await getSettingsReleaseSnapshot()).settings;
}

export async function setSettings(settings: AppSettings): Promise<void> {
  try {
    await saveSettingsRelease(settings);
  } catch (error) {
    throw new Error('Settings save was not committed.', { cause: error });
  }
}

export async function setSettingsConfirmed(settings: AppSettings): Promise<AppSettings> {
  return structuredClone((await saveSettingsRelease(settings)).settings);
}

/**
 * AI Gateway key management routes through the service worker (bridge): the
 * side panel never touches chrome.storage directly and never receives the
 * key value — only whether one is configured.
 */
export async function getAiGatewayKeyStatus(): Promise<{ configured: boolean }> {
  const response = await sendMessage({ type: 'AI_GATEWAY_KEY_STATUS' });
  if (response?.type !== 'AI_GATEWAY_KEY_STATUS_RESULT') {
    throw new Error('Unexpected AI Gateway key status response.');
  }
  return response.payload;
}

export async function saveAiGatewayKey(key: string): Promise<{ configured: boolean }> {
  const response = await sendMessage({ type: 'AI_GATEWAY_KEY_SET', payload: { key } });
  if (response?.type !== 'AI_GATEWAY_KEY_SET_RESULT') {
    throw new Error('Unexpected AI Gateway key save response.');
  }
  return response.payload;
}

export async function getProfile(): Promise<UserProfile | null> {
  const response = await sendMessage({ type: 'GET_PROFILE' });
  return response.type === 'PROFILE_RESULT' ? response.payload : null;
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  const response = await sendMessage({ type: 'SAVE_PROFILE', payload: profile });
  if (response.type !== 'PROFILE_RESULT' || response.payload === null) {
    throw new Error('Profile save failed.');
  }
}
