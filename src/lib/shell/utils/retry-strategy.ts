/**
 * Stratégie de retry avec backoff exponentiel pour les requêtes réseau
 */

export interface RetryConfig {
	maxAttempts: number;
	baseDelayMs: number;
	maxDelayMs: number;
	/** Liste des codes d'erreur ou messages qui déclenchent un retry */
	retryableErrors: string[];
	/** Multiplicateur pour le backoff exponentiel (défaut: 2) */
	backoffMultiplier?: number;
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
	return retryableErrors.some((retryable) =>
		errorMessage.includes(retryable.toUpperCase())
	);
}

/**
 * Attend un certain délai
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
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
	isOnline: () => boolean = () => true
): Promise<T> {
	const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config };

	for (let attempt = 1; attempt <= fullConfig.maxAttempts; attempt++) {
		try {
			// Vérifier la connexion avant chaque tentative
			if (!isOnline() && attempt > 1) {
				// Attendre la reconnexion avant de réessayer
				await waitForOnlineState(isOnline, fullConfig.maxDelayMs);
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

			if (import.meta.env.DEV) {
				console.log(`[Retry] Tentative ${attempt} échouée, nouvel essai dans ${Math.round(delay)}ms...`);
			}

			await sleep(delay);
		}
	}

	// Ne devrait jamais arriver
	throw new RetryExhaustedError('Retry failed unexpectedly', fullConfig.maxAttempts, new Error('Unknown'));
}

/**
 * Attend que isOnline retourne true
 */
function waitForOnlineState(
	isOnline: () => boolean,
	timeoutMs: number
): Promise<void> {
	return new Promise((resolve, reject) => {
		if (isOnline()) {
			resolve();
			return;
		}

		const startTime = Date.now();
		const checkInterval = setInterval(() => {
			if (isOnline()) {
				clearInterval(checkInterval);
				resolve();
			} else if (Date.now() - startTime > timeoutMs) {
				clearInterval(checkInterval);
				reject(new Error('Timeout waiting for online state'));
			}
		}, 500);
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
		() => navigator.onLine
	);
}
