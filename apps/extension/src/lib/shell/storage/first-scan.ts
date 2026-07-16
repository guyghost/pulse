/**
 * First-scan state persistence.
 *
 * Tracks two independent flags:
 *  - `first_scan_done`: a silent preliminary scan ran on install
 *  - `profile_banner_dismissed`: the "refine your profile" CTA was dismissed
 *
 * Shell only — chrome.storage.local access.
 */

const KEY_FIRST_SCAN = 'first_scan_done';
const KEY_BANNER_DISMISSED = 'profile_banner_dismissed';
const KEY_ONBOARDING_COMPLETED = 'onboarding_completed';
const KEY_FEED_TOUR_SEEN = 'feed_tour_seen';
const KEY_KBD_CHEATSHEET_TIP_SEEN = 'kbd_cheatsheet_tip_seen';

export async function getFirstScanDone(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(KEY_FIRST_SCAN);
    return result[KEY_FIRST_SCAN] === true;
  } catch {
    return false;
  }
}

export async function setFirstScanDone(): Promise<void> {
  await chrome.storage.local.set({ [KEY_FIRST_SCAN]: true });
}

export async function getProfileBannerDismissed(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(KEY_BANNER_DISMISSED);
    return result[KEY_BANNER_DISMISSED] === true;
  } catch {
    return false;
  }
}

export async function setProfileBannerDismissed(): Promise<void> {
  await chrome.storage.local.set({ [KEY_BANNER_DISMISSED]: true });
}

export async function getOnboardingCompleted(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(KEY_ONBOARDING_COMPLETED);
    return result[KEY_ONBOARDING_COMPLETED] === true;
  } catch {
    return false;
  }
}

export async function setOnboardingCompleted(): Promise<void> {
  await chrome.storage.local.set({ [KEY_ONBOARDING_COMPLETED]: true });
}

export async function clearOnboardingCompleted(): Promise<void> {
  await chrome.storage.local.remove(KEY_ONBOARDING_COMPLETED);
}

export async function getFeedTourSeen(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(KEY_FEED_TOUR_SEEN);
    return result[KEY_FEED_TOUR_SEEN] === true;
  } catch {
    return false;
  }
}

export async function setFeedTourSeen(): Promise<void> {
  await chrome.storage.local.set({ [KEY_FEED_TOUR_SEEN]: true });
}

export async function clearFeedTourSeen(): Promise<void> {
  await chrome.storage.local.remove(KEY_FEED_TOUR_SEEN);
}

export async function getKbdCheatsheetTipSeen(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(KEY_KBD_CHEATSHEET_TIP_SEEN);
    return result[KEY_KBD_CHEATSHEET_TIP_SEEN] === true;
  } catch {
    return false;
  }
}

export async function setKbdCheatsheetTipSeen(): Promise<void> {
  await chrome.storage.local.set({ [KEY_KBD_CHEATSHEET_TIP_SEEN]: true });
}
