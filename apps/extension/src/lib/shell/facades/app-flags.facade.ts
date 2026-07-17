import { sendMessage } from '../messaging/bridge';
import { getSettingsReleaseSnapshot, setOnboardingConsentRelease } from './settings-release.facade';

export async function getFirstScanDone(): Promise<boolean> {
  const response = await sendMessage({ type: 'GET_FIRST_SCAN_DONE' });
  return response.type === 'FIRST_SCAN_DONE_RESULT' ? response.payload : false;
}

export async function getProfileBannerDismissed(): Promise<boolean> {
  const response = await sendMessage({ type: 'GET_PROFILE_BANNER_DISMISSED' });
  return response.type === 'PROFILE_BANNER_DISMISSED_RESULT' ? response.payload : false;
}

export async function setProfileBannerDismissed(): Promise<void> {
  const response = await sendMessage({ type: 'SET_PROFILE_BANNER_DISMISSED' });
  if (response.type !== 'PROFILE_BANNER_DISMISSED_SET' || !response.payload.saved) {
    throw new Error('Profile banner flag save failed.');
  }
}

export async function getOnboardingCompleted(): Promise<boolean> {
  return (await getSettingsReleaseSnapshot()).onboardingCompleted;
}

export async function setOnboardingCompleted(): Promise<void> {
  await setOnboardingConsentRelease(true);
}

export async function clearOnboardingCompleted(): Promise<void> {
  await setOnboardingConsentRelease(false);
}

export async function getFeedTourSeen(): Promise<boolean> {
  const response = await sendMessage({ type: 'GET_FEED_TOUR_SEEN' });
  return response.type === 'FEED_TOUR_SEEN_RESULT' ? response.payload : false;
}

export async function setFeedTourSeen(): Promise<void> {
  const response = await sendMessage({ type: 'SET_FEED_TOUR_SEEN' });
  if (response.type !== 'FEED_TOUR_SEEN_SET' || !response.payload.saved) {
    throw new Error('Feed tour flag save failed.');
  }
}

export async function clearFeedTourSeen(): Promise<void> {
  const response = await sendMessage({ type: 'CLEAR_FEED_TOUR_SEEN' });
  if (response.type !== 'FEED_TOUR_SEEN_CLEARED' || !response.payload.cleared) {
    throw new Error('Feed tour flag clear failed.');
  }
}

export async function getKbdCheatsheetTipSeen(): Promise<boolean> {
  const response = await sendMessage({ type: 'GET_KBD_CHEATSHEET_TIP_SEEN' });
  return response.type === 'KBD_CHEATSHEET_TIP_SEEN_RESULT' ? response.payload : false;
}

export async function setKbdCheatsheetTipSeen(): Promise<void> {
  const response = await sendMessage({ type: 'SET_KBD_CHEATSHEET_TIP_SEEN' });
  if (response.type !== 'KBD_CHEATSHEET_TIP_SEEN_SET' || !response.payload.saved) {
    throw new Error('Keyboard cheatsheet tip flag save failed.');
  }
}
