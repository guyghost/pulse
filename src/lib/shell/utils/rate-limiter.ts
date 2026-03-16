/**
 * Rate Limiter - Token Bucket implementation
 * 
 * Gère le rate limiting par domaine pour éviter de surcharger les serveurs.
 * Utilise un algorithme token bucket pour permettre des bursts contrôlés.
 */

export interface RateLimitConfig {
  /** Nombre maximum de requêtes par seconde */
  requestsPerSecond: number;
  /** Taille du bucket (burst autorisé). Par défaut égal à requestsPerSecond */
  burstSize?: number;
}

interface DomainState {
  tokens: number;
  lastUpdate: number;
  queue: (() => void)[];
}

/** Configuration par défaut pour les domaines connus */
const DEFAULT_DOMAIN_CONFIGS: Record<string, RateLimitConfig> = {
  // General fallback
  default: { requestsPerSecond: 2, burstSize: 3 },
  // Free-work - API publique, plus tolérant
  'free-work.com': { requestsPerSecond: 3, burstSize: 5 },
  // Comet - plus strict
  'comet.co': { requestsPerSecond: 1, burstSize: 2 },
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
 * Extrait le domaine d'une URL complète
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    // Enlève le www. si présent
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    // Si ce n'est pas une URL valide, on considère que c'est déjà un domaine
    return url.replace(/^www\./, '');
  }
}

/**
 * Trouve la config la plus spécifique pour un domaine
 */
function findConfig(domain: string, configs: Record<string, RateLimitConfig>): RateLimitConfig {
  // Recherche exacte d'abord
  if (configs[domain]) return configs[domain];
  
  // Recherche par suffixe (ex: api.free-work.com -> free-work.com)
  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const suffix = parts.slice(i).join('.');
    if (configs[suffix]) return configs[suffix];
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
   * Active ou désactive le rate limiting
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Met à jour la configuration pour un domaine
   */
  setConfig(domain: string, config: RateLimitConfig): void {
    this.configs[domain] = config;
  }

  /**
   * Acquiert un token pour le domaine donné.
   * Attend si nécessaire selon la politique de rate limiting.
   */
  async acquire(urlOrDomain: string): Promise<void> {
    if (!this.enabled) return;

    const domain = extractDomain(urlOrDomain);
    const config = findConfig(domain, this.configs);
    
    // Calcul du délai minimum entre requêtes
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

    // Replénish tokens based on elapsed time
    const elapsedMs = now - state.lastUpdate;
    const tokensToAdd = (elapsedMs / 1000) * config.requestsPerSecond;
    const burstSize = config.burstSize ?? config.requestsPerSecond;
    state.tokens = Math.min(burstSize, state.tokens + tokensToAdd);
    state.lastUpdate = now;

    // Si on a des tokens disponibles, on consomme et on continue
    if (state.tokens >= 1) {
      state.tokens -= 1;
      
      if (import.meta.env.DEV) {
        console.log(`[RateLimiter] Token acquired for ${domain} (${state.tokens.toFixed(1)} remaining)`);
      }
      return;
    }

    // Sinon, on calcule le temps d'attente
    const waitTimeMs = minDelayMs - (elapsedMs % minDelayMs);
    
    if (import.meta.env.DEV) {
      console.log(`[RateLimiter] Rate limit hit for ${domain}, waiting ${waitTimeMs.toFixed(0)}ms`);
    }

    // Attendre le prochain token
    await new Promise(resolve => setTimeout(resolve, waitTimeMs));
    
    // Après l'attente, réessayer récursivement (pour gérer la queue)
    return this.acquire(urlOrDomain);
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
   * Réinitialise l'état d'un domaine
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
 * Délai constant entre les pages d'un même connecteur
 * Utilisé pour espacer les requêtes de pagination
 */
export const DEFAULT_PAGE_DELAY_MS = 500;

/**
 * Crée un délai entre les pages avec logging en mode dev
 */
export async function delayBetweenPages(connectorId: string, pageNumber: number): Promise<void> {
  if (pageNumber <= 1) return; // Pas de délai pour la première page
  
  if (import.meta.env.DEV) {
    console.log(`[Scanner] Delay ${DEFAULT_PAGE_DELAY_MS}ms before page ${pageNumber} for ${connectorId}`);
  }
  
  await new Promise(resolve => setTimeout(resolve, DEFAULT_PAGE_DELAY_MS));
}
