/**
 * MV3 service worker keepalive (shell-only; see profile-state.model.md
 * "Post-save rescore orchestration").
 *
 * A terminated message channel no longer resets the 30s idle timer, so a
 * long post-commit projection (semantic rescore) must reset it itself: any
 * chrome.* API call does, and `chrome.runtime.getPlatformInfo()` is about
 * the cheapest one available.
 */

const PING_INTERVAL_MS = 20_000;

export async function withServiceWorkerKeepalive<T>(operation: () => Promise<T>): Promise<T> {
  const timer = setInterval(() => {
    try {
      void Promise.resolve(chrome.runtime.getPlatformInfo()).catch(() => {});
    } catch {
      // Non-extension context (dev stubs without runtime) — nothing to keep alive.
    }
  }, PING_INTERVAL_MS);

  try {
    return await operation();
  } finally {
    clearInterval(timer);
  }
}
