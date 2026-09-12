import type { Mission } from '../../core/types/mission';
import type { Result, AppError } from '$lib/core/errors';
import type { ConnectorSearchContext } from '../../core/connectors/search-context';

export interface PlatformConnector {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly icon: string;

  /**
   * Detects whether the user has an active session on the platform
   * @param now - Injected timestamp (no Date.now() in Core)
   * @param signal - Optional AbortSignal for cancellation
   */
  detectSession(now: number, signal?: AbortSignal): Promise<Result<boolean, AppError>>;

  /**
   * Fetches missions from the platform
   * @param now - Injected timestamp (no Date.now() in Core)
   * @param context - Optional search context for server-side filtering
   * @param signal - Optional AbortSignal for cancellation
   */
  fetchMissions(
    now: number,
    context?: ConnectorSearchContext,
    signal?: AbortSignal
  ): Promise<Result<Mission[], AppError>>;

  /**
   * Retrieves the last synchronization date
   * @param now - Injected timestamp (no Date.now() in Core)
   */
  getLastSync(now: number): Promise<Result<Date | null, AppError>>;
}
