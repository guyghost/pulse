import { sendMessage } from '../messaging/bridge';

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
  const response = await sendMessage({ type: 'GET_ONBOARDING_COMPLETED' });
  return response.type === 'ONBOARDING_COMPLETED_RESULT' ? response.payload : false;
}

export async function setOnboardingCompleted(): Promise<void> {
  const response = await sendMessage({ type: 'SET_ONBOARDING_COMPLETED' });
  if (response.type !== 'ONBOARDING_COMPLETED_SET' || !response.payload.saved) {
    throw new Error('Onboarding flag save failed.');
  }
}

export async function clearOnboardingCompleted(): Promise<void> {
  const response = await sendMessage({ type: 'CLEAR_ONBOARDING_COMPLETED' });
  if (response.type !== 'ONBOARDING_COMPLETED_CLEARED' || !response.payload.cleared) {
    throw new Error('Onboarding flag clear failed.');
  }
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
