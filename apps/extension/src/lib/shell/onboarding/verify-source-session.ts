/**
 * P0-B — vérification de session par source (docs/plans/2026-09-07-
 * activation-first-scan-p0.md).
 *
 * Réutilise le pipeline existant des connecteurs (`detectSession`) — le même
 * que `checkSourceSessions` côté feed. La machine onboarding ne reçoit que
 * l'issue (`SOURCE_SESSION`) ; les états intermédiaires restent locaux à l'UI.
 *
 * Shell : I/O injectées pour la testabilité ; le défaut passe par le
 * registry de connecteurs (contexte extension / stubs dev).
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
 * Vérifie la session d'une source via son connecteur.
 * - `ready` : le connecteur rapporte une session active.
 * - `session-missing` : pas de session (→ CTA « Ouvrir {source} »).
 * - `unavailable` : connecteur absent ou échec de vérification (→ réessayer).
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
 * Ouvre la plateforme dans un nouvel onglet (connexion utilisateur).
 * Le side panel regagne le focus à la retour → l'orchestration re-vérifie.
 * Fallback `window.open` pour le mode dev sans contexte extension.
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
