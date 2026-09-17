/**
 * Rate Limiter - Token Bucket implementation
 *
 * Handles per-domain rate limiting to avoid overloading servers.
 * Uses a token bucket algorithm to allow controlled bursts.
 */

import { abortableDelay } from './retry-strategy';

export interface RateLimitConfig {
  /** Maximum number of requests per second */
  requestsPerSecond: number;
  /** Bucket size (allowed burst). Defaults to requestsPerSecond */
  burstSize?: number;
}

interface DomainState {
  tokens: number;
  lastUpdate: number;
  queue: (() => void)[];
}

/** Default configuration for known domains */
const DEFAULT_DOMAIN_CONFIGS: Record<string, RateLimitConfig> = {
  // General fallback
  default: { requestsPerSecond: 2, burstSize: 3 },
  // Free-work - public API, more tolerant
  'free-work.com': { requestsPerSecond: 3, burstSize: 5 },
  // Lehibou
  'lehibou.com': { requestsPerSecond: 2, burstSize: 3 },
  // Cherrypick
  'cherrypick.fr': { requestsPerSecond: 2, burstSize: 3 },
  // Hiway
  'hiway.fr': { requestsPerSecond: 2, burstSize: 3 },
  // Freelance.com
  'freelance.com': { requestsPerSecond: 2, burstSize: 3 },
  // Upwork
  'upwork.com': { requestsPerSecond: 1, burstSize: 2 },
};

/**
 * Extracts the domain from a full URL
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    // Strip the www. prefix when present
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    // If not a valid URL, assume it's already a domain
    return url.replace(/^www\./, '');
  }
}

/**
 * Finds the most specific config for a domain
 */
function findConfig(domain: string, configs: Record<string, RateLimitConfig>): RateLimitConfig {
  // Recherche exacte d'abord
  if (configs[domain]) {
    return configs[domain];
  }

  // Recherche par suffixe (ex: api.free-work.com -> free-work.com)
  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const suffix = parts.slice(i).join('.');
    if (configs[suffix]) {
      return configs[suffix];
    }
  }

  // Fallback
  return configs.default || DEFAULT_DOMAIN_CONFIGS.default;
}

export class RateLimiter {
  private domains: Map<string, DomainState> = new Map();
  private configs: Record<string, RateLimitConfig>;
  private enabled: boolean = true;

  constructor(configs: Record<string, RateLimitConfig> = DEFAULT_DOMAIN_CONFIGS) {
    this.configs = { ...DEFAULT_DOMAIN_CONFIGS, ...configs };
  }

  /**
   * Enables or disables rate limiting
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Updates the configuration for a domain
   */
  setConfig(domain: string, config: RateLimitConfig): void {
    this.configs[domain] = config;
  }

  /**
   * Acquires a token for the given domain.
   * Waits if necessary according to the rate limiting policy.
   */
  async acquire(urlOrDomain: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
    if (!this.enabled) {
      return;
    }

    const domain = extractDomain(urlOrDomain);
    const config = findConfig(domain, this.configs);

    // Compute the minimum delay between requests
    const minDelayMs = 1000 / config.requestsPerSecond;

    const now = Date.now();
    let state = this.domains.get(domain);

    if (!state) {
      state = {
        tokens: config.burstSize ?? config.requestsPerSecond,
        lastUpdate: now,
        queue: [],
      };
      this.domains.set(domain, state);
    }

    // Replenish tokens based on elapsed time
    const elapsedMs = now - state.lastUpdate;
    const tokensToAdd = (elapsedMs / 1000) * config.requestsPerSecond;
    const burstSize = config.burstSize ?? config.requestsPerSecond;
    state.tokens = Math.min(burstSize, state.tokens + tokensToAdd);
    state.lastUpdate = now;

    // Si on a des tokens disponibles, on consomme et on continue
    if (state.tokens >= 1) {
      state.tokens -= 1;

      if (import.meta.env.DEV) {
        console.debug(
          `[RateLimiter] Token acquired for ${domain} (${state.tokens.toFixed(1)} remaining)`
        );
      }
      return;
    }

    // Sinon, on calcule le temps d'attente
    const waitTimeMs = minDelayMs - (elapsedMs % minDelayMs);

    if (import.meta.env.DEV) {
      console.debug(
        `[RateLimiter] Rate limit hit for ${domain}, waiting ${waitTimeMs.toFixed(0)}ms`
      );
    }

    // Attendre le prochain token
    await abortableDelay(waitTimeMs, signal);

    // After waiting, retry recursively (to handle the queue)
    return this.acquire(urlOrDomain, signal);
  }

  /**
   * Retourne la longueur de la queue d'attente pour un domaine
   */
  getQueueLength(urlOrDomain: string): number {
    const domain = extractDomain(urlOrDomain);
    const state = this.domains.get(domain);
    return state?.queue.length ?? 0;
  }

  /**
   * Retourne le nombre de tokens disponibles pour un domaine
   */
  getAvailableTokens(urlOrDomain: string): number {
    const domain = extractDomain(urlOrDomain);
    const state = this.domains.get(domain);
    if (!state) {
      const config = findConfig(domain, this.configs);
      return config.burstSize ?? config.requestsPerSecond;
    }

    const config = findConfig(domain, this.configs);
    const now = Date.now();
    const elapsedMs = now - state.lastUpdate;
    const tokensToAdd = (elapsedMs / 1000) * config.requestsPerSecond;
    const burstSize = config.burstSize ?? config.requestsPerSecond;
    return Math.min(burstSize, state.tokens + tokensToAdd);
  }

  /**
   * Resets a domain's state
   */
  reset(urlOrDomain?: string): void {
    if (urlOrDomain) {
      const domain = extractDomain(urlOrDomain);
      this.domains.delete(domain);
    } else {
      this.domains.clear();
    }
  }
}

/**
 * Instance globale du rate limiter
 *
 * Usage: await globalRateLimiter.acquire('https://example.com/api');
 */
export const globalRateLimiter = new RateLimiter(DEFAULT_DOMAIN_CONFIGS);

/**
 * Constant delay between pages of the same connector
 * Used to space out pagination requests
 */
export const DEFAULT_PAGE_DELAY_MS = 500;

/**
 * Creates an inter-page delay with logging in dev mode
 */
export async function delayBetweenPages(
  connectorId: string,
  pageNumber: number,
  signal?: AbortSignal
): Promise<void> {
  if (pageNumber <= 1) {
    return;
  } // No delay for the first page

  if (import.meta.env.DEV) {
    console.debug(
      `[Scanner] Delay ${DEFAULT_PAGE_DELAY_MS}ms before page ${pageNumber} for ${connectorId}`
    );
  }

  await abortableDelay(DEFAULT_PAGE_DELAY_MS, signal);
}
