/**
 * Stratégie de retry avec backoff exponentiel pour les requêtes réseau
 */

import type { Result, AppError } from '../../core/errors';
import { isRetryable } from '../errors/error-handler';

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Liste des codes d'erreur ou messages qui déclenchent un retry */
  retryableErrors: string[];
  /** Multiplicateur pour le backoff exponentiel (défaut: 2) */
  backoffMultiplier?: number;
}

export interface ResultRetryLifecycleObserver {
  onRetryableFailure?(error: AppError, attempt: number): void;
  onRetryTimerFired?(attempt: number): void;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  retryableErrors: ['OFFLINE', 'NETWORK_ERROR', 'TIMEOUT', 'ECONNRESET', 'ETIMEDOUT'],
  backoffMultiplier: 2,
};

/**
 * Erreur émise quand tous les retries ont échoué
 */
export class RetryExhaustedError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: Error
  ) {
    super(message);
    this.name = 'RetryExhaustedError';
  }
}

/**
 * Calcule le délai avant le prochain retry avec jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const multiplier = config.backoffMultiplier ?? 2;
  const exponentialDelay = config.baseDelayMs * Math.pow(multiplier, attempt - 1);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 30% jitter
  return Math.min(exponentialDelay + jitter, config.maxDelayMs);
}

/**
 * Vérifie si une erreur est retryable
 */
function isRetryableError(error: Error, retryableErrors: string[]): boolean {
  const errorMessage = error.message.toUpperCase();
  return retryableErrors.some((retryable) => errorMessage.includes(retryable.toUpperCase()));
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw abortError();
  }
}

/** Attend un délai et libère toujours timer/listener à la résolution ou l'abort. */
export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(abortError());
  }

  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Exécute une fonction avec retry automatique
 * @param fn Fonction à exécuter
 * @param config Configuration du retry
 * @param isOnline Fonction optionnelle pour vérifier la connexion
 * @returns Le résultat de fn()
 * @throws RetryExhaustedError si tous les retries échouent
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  isOnline: () => boolean = () => true,
  signal?: AbortSignal
): Promise<T> {
  const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config };

  for (let attempt = 1; attempt <= fullConfig.maxAttempts; attempt++) {
    throwIfAborted(signal);
    try {
      // Vérifier la connexion avant chaque tentative
      if (!isOnline() && attempt > 1) {
        // Attendre la reconnexion avant de réessayer
        await waitForOnlineState(isOnline, fullConfig.maxDelayMs, signal);
      }

      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === fullConfig.maxAttempts;
      const err = error instanceof Error ? error : new Error(String(error));

      // Si l'erreur n'est pas retryable, échouer immédiatement
      if (!isRetryableError(err, fullConfig.retryableErrors)) {
        throw err;
      }

      if (isLastAttempt) {
        throw new RetryExhaustedError(
          `Échec après ${attempt} tentatives: ${err.message}`,
          attempt,
          err
        );
      }

      // Calculer et attendre le délai avant retry
      const delay = calculateDelay(attempt, fullConfig);

      await abortableDelay(delay, signal);
    }
  }

  // Ne devrait jamais arriver
  throw new RetryExhaustedError(
    'Retry failed unexpectedly',
    fullConfig.maxAttempts,
    new Error('Unknown')
  );
}

/**
 * Attend que isOnline retourne true
 */
function waitForOnlineState(
  isOnline: () => boolean,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    if (isOnline()) {
      resolve();
      return;
    }

    const startTime = Date.now();
    const cleanup = (): void => {
      clearInterval(checkInterval);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = (): void => {
      cleanup();
      reject(abortError());
    };
    const checkInterval = setInterval(() => {
      if (isOnline()) {
        cleanup();
        resolve();
      } else if (Date.now() - startTime > timeoutMs) {
        cleanup();
        reject(new Error('Timeout waiting for online state'));
      }
    }, 500);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Wrapper pour les requêtes fetch avec retry
 */
export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retryConfig?: Partial<RetryConfig>
): Promise<Response> {
  return withRetry(
    () => fetch(url, options),
    retryConfig,
    () => navigator.onLine,
    options?.signal ?? undefined
  );
}

/**
 * Result-aware retry helper for functions returning Result<T, AppError>
 *
 * Unlike `withRetry`, this helper:
 * - Works with the Result pattern (ok/error) instead of exceptions
 * - Uses AppError's retryable flag instead of string matching
 * - Returns the final Result directly (no exception thrown)
 *
 * @param fn Function returning Promise<Result<T, AppError>>
 * @param config Retry configuration
 * @returns The final Result (either Ok<T> or Err<AppError>)
 */
export async function withResultRetry<T>(
  fn: () => Promise<Result<T, AppError>>,
  config: Partial<RetryConfig> = {},
  signal?: AbortSignal,
  lifecycle?: ResultRetryLifecycleObserver
): Promise<Result<T, AppError>> {
  const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config };

  for (let attempt = 1; attempt <= fullConfig.maxAttempts; attempt++) {
    throwIfAborted(signal);
    const result = await fn();
    throwIfAborted(signal);

    // Success - return immediately
    if (result.ok) {
      return result;
    }

    // Check if error is retryable using AppError's built-in flag
    if (!isRetryable(result.error)) {
      return result;
    }

    const isLastAttempt = attempt === fullConfig.maxAttempts;
    if (isLastAttempt) {
      // Return the last error - no more retries
      return result;
    }

    lifecycle?.onRetryableFailure?.(result.error, attempt);

    // Calculate and wait for delay before retry
    const delay = calculateDelay(attempt, fullConfig);

    await abortableDelay(delay, signal);
    throwIfAborted(signal);
    lifecycle?.onRetryTimerFired?.(attempt);
  }

  // Should never reach here
  return {
    ok: false,
    error: {
      type: 'network',
      message: 'Retry failed unexpectedly',
      retryable: false,
      recoverable: false,
      timestamp: Date.now(),
    },
  };
}
