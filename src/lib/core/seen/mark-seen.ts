export const MAX_SEEN_IDS = 500;

export function markAsSeen(currentIds: string[], newIds: string[]): string[] {
  const merged = [...new Set([...currentIds, ...newIds])];
  if (merged.length > MAX_SEEN_IDS) {
    return merged.slice(merged.length - MAX_SEEN_IDS);
  }
  return merged;
}
