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

export async function getFirstScanDone(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(KEY_FIRST_SCAN);
    return result[KEY_FIRST_SCAN] === true;
  } catch {
    return false;
  }
}

export async function setFirstScanDone(): Promise<void> {
  try {
    await chrome.storage.local.set({ [KEY_FIRST_SCAN]: true });
  } catch {
    // Non-critical
  }
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
  try {
    await chrome.storage.local.set({ [KEY_BANNER_DISMISSED]: true });
  } catch {
    // Non-critical
  }
}
