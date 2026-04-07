/**
 * Maximum number of seen mission IDs to retain.
 * Must match the limit in shell/storage/seen-missions.ts for consistency.
 */
export const MAX_SEEN_IDS = 2000;

export function markAsSeen(currentIds: string[], newIds: string[]): string[] {
  const merged = [...new Set([...currentIds, ...newIds])];
  if (merged.length > MAX_SEEN_IDS) {
    return merged.slice(merged.length - MAX_SEEN_IDS);
  }
  return merged;
}
