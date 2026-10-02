import { sendMessage } from '../messaging/bridge';
import type { SourceVerificationResult } from '../connectors/verify-source-session';
export type {
  SourceVerificationStatus,
  SourceVerificationResult,
} from '../connectors/verify-source-session';

/** Session I/O belongs to the service worker; the panel only requests a projection. */
export async function verifySourceSession(sourceId: string): Promise<SourceVerificationResult> {
  try {
    const response = await sendMessage({ type: 'VERIFY_SOURCE_SESSION', payload: { sourceId } });
    if (response.type === 'SOURCE_SESSION_RESULT' && response.payload.sourceId === sourceId) {
      return response.payload;
    }
  } catch {
    // An unavailable worker must not look like a missing login.
  }
  return { sourceId, status: 'unavailable' };
}

/**
 * Opens the platform in a new tab (user login).
 * The side panel regains focus on return → the orchestration re-verifies.
 * Chrome tab errors propagate to the caller for user-facing feedback.
 * Without the tab API, window.open is best effort: a null result with
 * noopener is not evidence that the browser blocked the popup.
 */
export async function openSourceInNewTab(url: string): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    await chrome.tabs.create({ url });
    return;
  }
  window.open(url, '_blank', 'noopener');
}
