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
  const { getConnectors } = await import('./index');
  const [connector] = await getConnectors([id]);
  return connector;
}

/**
 * Verifies a source's session via its connector.
 * - `ready`: the connector reports an active session.
 * - `session-missing`: no session (→ "Ouvrir {source}" CTA).
 * - `unavailable`: missing connector or verification failure (→ retry).
 */
export async function checkSourceSession(
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
