import { metricsCollector } from '../metrics/collector';
import { calculateHitRate } from '../../core/metrics/types';

/**
 * Cache mémoire TTL-based pour les données fréquemment accédées depuis IndexedDB.
 * Thread-safe (singleton) avec stats de debug pour le mode dev.
 */

export interface CacheEntry<T> {
  data: T;
  expiry: number;
  version: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

// Clés supportées par le cache
type CacheKey = 'missions' | 'profile' | 'favorites' | 'hidden' | 'seenIds';

// TTL par défaut: 5 secondes pour rafraîchissement rapide de l'UI
const DEFAULT_TTL_MS = 5000;

// Version globale pour invalidation manuelle
let globalVersion = 0;

// Store interne du cache
const cache = new Map<string, CacheEntry<unknown>>();

// Stats pour debug
const stats = {
  hits: 0,
  misses: 0,
};

/**
 * Récupère une valeur du cache si elle existe et n'est pas expirée.
 * @param key - Clé du cache
 * @returns La valeur cachée ou undefined
 */
export function getCached<T>(key: CacheKey): T | undefined {
  const entry = cache.get(key) as CacheEntry<T> | undefined;

  if (!entry) {
    stats.misses++;
    return undefined;
  }

  // Vérifier expiration
  if (Date.now() > entry.expiry) {
    cache.delete(key);
    stats.misses++;
    return undefined;
  }

  // Vérifier version (invalidation manuelle)
  if (entry.version < globalVersion) {
    cache.delete(key);
    stats.misses++;
    return undefined;
  }

  stats.hits++;
  return entry.data;
}

/**
 * Stocke une valeur dans le cache avec un TTL optionnel.
 * @param key - Clé du cache
 * @param data - Données à cacher
 * @param ttlMs - TTL en millisecondes (défaut: 5000ms)
 */
export function setCached<T>(key: CacheKey, data: T, ttlMs = DEFAULT_TTL_MS): void {
  const entry: CacheEntry<T> = {
    data,
    expiry: Date.now() + ttlMs,
    version: globalVersion,
  };
  cache.set(key, entry as CacheEntry<unknown>);
}

/**
 * Invalide une ou toutes les entrées du cache.
 * @param key - Clé spécifique à invalider, ou undefined pour tout invalider
 */
export function invalidateCache(key?: CacheKey): void {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
    globalVersion++;
  }
}

/**
 * Retourne les statistiques du cache (hits, misses, taille).
 * Utile pour debug en mode dev.
 * Enregistre également les métriques dans le collector.
 */
export function getCacheStats(): CacheStats {
  const hitRate = calculateHitRate(stats.hits, stats.misses);

  // Enregistrer les métriques si en mode dev
  if (import.meta.env.DEV) {
    metricsCollector.recordCacheMetrics('memory', {
      hits: stats.hits,
      misses: stats.misses,
      hitRate,
      size: cache.size,
    });
  }

  return {
    hits: stats.hits,
    misses: stats.misses,
    size: cache.size,
  };
}

/**
 * Réinitialise les statistiques du cache.
 * Utile pour les tests.
 */
export function resetCacheStats(): void {
  stats.hits = 0;
  stats.misses = 0;
}

/**
 * Vide complètement le cache et réinitialise la version.
 * À utiliser lors du logout ou reset complet.
 */
export function clearCache(): void {
  cache.clear();
  globalVersion = 0;
  resetCacheStats();
}
