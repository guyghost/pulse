import type { Mission } from '../../core/types/mission';
import type { Result, AppError } from '$lib/core/errors';
import type { ConnectorSearchContext } from '../../core/connectors/search-context';

export interface PlatformConnector {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly icon: string;

  /**
   * Détecte si l'utilisateur a une session active sur la plateforme
   * @param now - Timestamp injecté (pas de Date.now() dans Core)
   * @param signal - Optional AbortSignal for cancellation
   */
  detectSession(now: number, signal?: AbortSignal): Promise<Result<boolean, AppError>>;

  /**
   * Récupère les missions depuis la plateforme
   * @param now - Timestamp injecté (pas de Date.now() dans Core)
   * @param context - Optional search context for server-side filtering
   * @param signal - Optional AbortSignal for cancellation
   */
  fetchMissions(
    now: number,
    context?: ConnectorSearchContext,
    signal?: AbortSignal
  ): Promise<Result<Mission[], AppError>>;

  /**
   * Récupère la date de dernière synchronisation
   * @param now - Timestamp injecté (pas de Date.now() dans Core)
   */
  getLastSync(now: number): Promise<Result<Date | null, AppError>>;
}
