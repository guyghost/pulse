import type { Mission } from '../../core/types/mission';
import type { Result, AppError } from '$lib/core/errors';

export interface PlatformConnector {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly icon: string;

  /**
   * Détecte si l'utilisateur a une session active sur la plateforme
   * @param now - Timestamp injecté (pas de Date.now() dans Core)
   */
  detectSession(now: number): Promise<Result<boolean, AppError>>;
  
  /**
   * Récupère les missions depuis la plateforme
   * @param now - Timestamp injecté (pas de Date.now() dans Core)
   */
  fetchMissions(now: number): Promise<Result<Mission[], AppError>>;
  
  /**
   * Récupère la date de dernière synchronisation
   * @param now - Timestamp injecté (pas de Date.now() dans Core)
   */
  getLastSync(now: number): Promise<Result<Date | null, AppError>>;
}
