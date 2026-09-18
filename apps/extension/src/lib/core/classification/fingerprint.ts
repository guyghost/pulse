/**
 * Classification fingerprint — stable content hash for cache invalidation.
 *
 * Pure function: deterministic, no I/O, no randomness. A mission whose title,
 * stack or description changes gets a new fingerprint, which invalidates its
 * cached classification on the next scan.
 */

import type { Mission } from '../types/mission';

const FNV_32_OFFSET = 0x811c9dc5;
const FNV_32_PRIME = 0x01000193;

/**
 * FNV-1a 32-bit hash, returned as 8 hex characters. Chosen over `crypto`
 * because the Core forbids impure APIs and a compact non-cryptographic
 * digest is enough for cache invalidation.
 */
export const hashString = (input: string): string => {
  let hash = FNV_32_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_32_PRIME);
  }
  // Force unsigned 32-bit, then pad to a stable width.
  return (hash >>> 0).toString(16).padStart(8, '0');
};

/**
 * Stable fingerprint of the mission fields the classification is based on.
 * Stacks are sorted so display order does not invalidate the cache.
 */
export const buildMissionContentFingerprint = (
  mission: Pick<Mission, 'title' | 'description' | 'stack'>
): string =>
  hashString(
    [
      mission.title.trim().toLowerCase(),
      [...mission.stack]
        .map((s) => s.trim().toLowerCase())
        .sort()
        .join(','),
      mission.description.trim().toLowerCase(),
    ].join('|')
  );
