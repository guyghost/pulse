/**
 * Chrome Storage — single entry point for settings persistence.
 *
 * UI pages import this instead of individual storage modules.
 */

import type { UserProfile } from '$lib/core/types/profile';
import { sendMessage } from '$lib/shell/messaging/bridge';

export { getSettings, setSettings } from '../storage/chrome-storage';

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
