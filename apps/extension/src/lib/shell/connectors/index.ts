import type { PlatformConnector } from './platform-connector';
import type { Result, AppError } from '$lib/core/errors';
import type { ConnectorId } from './meta';
import { INCLUDED_CONNECTOR_IDS } from './build-config';
import { handleError, isRetryable } from '../errors/error-handler';
export { getConnectorsMeta, type ConnectorMeta, type ConnectorId } from './meta';

// Static imports — dynamic import() injects Vite's __vitePreload polyfill
// which uses `document` APIs and crashes in Chrome extension service workers.
// Service workers load all code at startup anyway, so lazy loading has no benefit.
import { FreeWorkConnector } from './freework.connector';
import { LeHibouConnector } from './lehibou.connector';
import { HiwayConnector } from './hiway.connector';
import { CollectiveConnector } from './collective.connector';
import { CherryPickConnector } from './cherrypick.connector';
import { MaltConnector } from './malt.connector';

// Factory functions using static imports (service-worker safe)
const CONNECTOR_REGISTRY = {
  'free-work': () => Promise.resolve(new FreeWorkConnector()),
  lehibou: () => Promise.resolve(new LeHibouConnector()),
  hiway: () => Promise.resolve(new HiwayConnector()),
  collective: () => Promise.resolve(new CollectiveConnector()),
  'cherry-pick': () => Promise.resolve(new CherryPickConnector()),
  malt: () => Promise.resolve(new MaltConnector()),
} satisfies Record<ConnectorId, () => Promise<PlatformConnector>>;

const INCLUDED_SET: ReadonlySet<ConnectorId> = new Set(INCLUDED_CONNECTOR_IDS);

/**
 * True if a connector id ships in this build (not filtered out by
 * connectors.config.json / CONNECTORS_INCLUDE/EXCLUDE).
 */
export function isConnectorIncluded(id: ConnectorId): boolean {
  return INCLUDED_SET.has(id);
}

/**
 * Get list of connector IDs shipped in this build.
 * Excluded connectors are omitted entirely — the scanner cannot reach them.
 */
export function getConnectorIds(): ConnectorId[] {
  return (Object.keys(CONNECTOR_REGISTRY) as ConnectorId[]).filter(isConnectorIncluded);
}

/**
 * Load a connector by ID asynchronously
 * @returns The connector instance or null if not found OR excluded from this build
 */
export async function getConnector(id: string): Promise<PlatformConnector | null> {
  if (!INCLUDED_SET.has(id as ConnectorId)) {
    return null;
  }
  const factory = CONNECTOR_REGISTRY[id as ConnectorId];
  if (!factory) {
    return null;
  }

  try {
    return await factory();
  } catch (error) {
    console.error(`Failed to load connector "${id}":`, error);
    return null;
  }
}

/**
 * Load multiple connectors by ID asynchronously
 * @returns Array of successfully loaded connectors
 */
export async function getConnectors(ids: string[]): Promise<PlatformConnector[]> {
  const results = await Promise.allSettled(ids.map((id) => getConnector(id)));
  return results
    .filter((r): r is PromiseFulfilledResult<PlatformConnector | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((c): c is PlatformConnector => c !== null);
}

// ============================================================================
// Détection de session avec gestion d'erreurs typées
// ============================================================================

export interface DetectionResult {
  connectorId: string;
  hasSession: boolean;
  error?: AppError;
}

/**
 * Détecte la session pour un connecteur avec gestion d'erreurs
 * @returns Result avec la détection ou l'erreur
 */
export async function detectConnectorSession(
  connector: PlatformConnector,
  now: number
): Promise<Result<DetectionResult, AppError>> {
  const result = await connector.detectSession(now);

  if (!result.ok) {
    // Gère l'erreur pour le logging/toast
    handleError(result.error);

    return result;
  }

  return {
    ok: true,
    value: {
      connectorId: connector.id,
      hasSession: result.value,
    },
  };
}

/**
 * Détecte les sessions pour tous les connecteurs avec gestion d'erreurs
 * Continue même si certains connecteurs échouent
 */
export async function detectAllConnectorSessions(
  connectors: PlatformConnector[],
  now: number
): Promise<DetectionResult[]> {
  const results = await Promise.all(
    connectors.map(async (connector) => {
      const result = await connector.detectSession(now);

      if (!result.ok) {
        handleError(result.error);
        return {
          connectorId: connector.id,
          hasSession: false,
          error: result.error,
        };
      }

      return {
        connectorId: connector.id,
        hasSession: result.value,
      };
    })
  );

  return results;
}

/**
 * Vérifie si une erreur de détection est retryable
 */
export function isDetectionRetryable(error: AppError): boolean {
  return isRetryable(error);
}
