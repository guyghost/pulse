import type { TJMAnalysis } from '../core/types/tjm';

interface CacheEntry {
  key: string;
  analysis: TJMAnalysis;
  cachedAt: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function hashKey(title: string, location: string, seniority: string): string {
  const raw = `${title.toLowerCase()}-${location.toLowerCase()}-${seniority}`;
  // Simple hash — enough for cache key purposes
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `tjm-cache-${Math.abs(hash).toString(36)}`;
}

export function getCacheKey(title: string, location: string, seniority: string): string {
  return hashKey(title, location, seniority);
}

export async function getCachedAnalysis(title: string, location: string, seniority: string): Promise<TJMAnalysis | null> {
  const key = hashKey(title, location, seniority);

  return new Promise((resolve) => {
    const request = indexedDB.open('missionpulse', 1);
    request.onsuccess = () => {
      const db = request.result;
      try {
        const tx = db.transaction('tjmCache', 'readonly');
        const store = tx.objectStore('tjmCache');
        const getReq = store.get(key);
        getReq.onsuccess = () => {
          const entry = getReq.result as CacheEntry | undefined;
          if (!entry) { resolve(null); return; }
          if (Date.now() - entry.cachedAt > CACHE_TTL_MS) { resolve(null); return; }
          resolve(entry.analysis);
        };
        getReq.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    };
    request.onerror = () => resolve(null);
  });
}

export async function cacheAnalysis(title: string, location: string, seniority: string, analysis: TJMAnalysis): Promise<void> {
  const key = hashKey(title, location, seniority);

  return new Promise((resolve) => {
    const request = indexedDB.open('missionpulse', 1);
    request.onsuccess = () => {
      const db = request.result;
      try {
        const tx = db.transaction('tjmCache', 'readwrite');
        const store = tx.objectStore('tjmCache');
        store.put({ key, analysis, cachedAt: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    };
    request.onerror = () => resolve();
  });
}

export function isCacheValid(cachedAt: number): boolean {
  return Date.now() - cachedAt < CACHE_TTL_MS;
}
