/**
 * P0-B — per-source session verification (docs/plans/2026-09-07-
 * activation-first-scan-p0.md).
 *
 * Reuses the existing connector pipeline (`detectSession`) — the same as
 * `checkSourceSessions` on the feed side. The onboarding machine only
 * receives the issue (`SOURCE_SESSION`); intermediate states stay local to
 * the UI.
 *
 * Shell: injected I/O for testability; the default goes through the
 * connector registry (extension context / dev stubs).
 */

import type { PlatformConnector } from '$lib/shell/connectors/platform-connector';

export type SourceVerificationStatus = 'ready' | 'session-missing' | 'unavailable';

export interface SourceVerificationResult {
  sourceId: string;
  status: SourceVerificationStatus;
}

export interface VerifySourceSessionDeps {
  getConnector?: (
    id: string
  ) => Promise<Pick<PlatformConnector, 'id' | 'detectSession'> | undefined>;
  now?: () => number;
}

async function defaultGetConnector(
  id: string
): Promise<Pick<PlatformConnector, 'id' | 'detectSession'> | undefined> {
  const { getConnectors } = await import('../connectors/index');
  const [connector] = await getConnectors([id]);
  return connector;
}

/**
 * Verifies a source's session via its connector.
 * - `ready`: the connector reports an active session.
 * - `session-missing`: no session (→ "Ouvrir {source}" CTA).
 * - `unavailable`: missing connector or verification failure (→ retry).
 */
export async function verifySourceSession(
  sourceId: string,
  deps: VerifySourceSessionDeps = {}
): Promise<SourceVerificationResult> {
  const now = deps.now ?? Date.now;
  const getConnector = deps.getConnector ?? defaultGetConnector;
  try {
    const connector = await getConnector(sourceId);
    if (!connector) {
      return { sourceId, status: 'unavailable' };
    }
    const result = await connector.detectSession(now());
    if (!result.ok) {
      return { sourceId, status: 'unavailable' };
    }
    return { sourceId, status: result.value ? 'ready' : 'session-missing' };
  } catch {
    return { sourceId, status: 'unavailable' };
  }
}

/**
 * Opens the platform in a new tab (user login).
 * The side panel regains focus on return → the orchestration re-verifies.
 * `window.open` fallback for dev mode without extension context.
 */
export async function openSourceInNewTab(url: string): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    try {
      await chrome.tabs.create({ url });
      return;
    } catch {
      // fall through to window.open
    }
  }
  window.open(url, '_blank', 'noopener');
}
