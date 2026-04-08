import { analyzeTJMHistory } from '$lib/core/tjm-history/index';
import type { TJMAnalysis, TJMHistory, TJMRegion } from '$lib/core/types/tjm';
import { loadTJMHistory } from '$lib/shell/storage/tjm-history';

/**
 * Get TJM analysis, optionally filtered by stacks and/or region.
 *
 * @param profileStacks - If provided, only include records matching these stacks
 * @param region - If provided, only include records from this region
 */
export async function getTJMAnalysis(
  profileStacks?: string[],
  region?: TJMRegion
): Promise<TJMAnalysis | null> {
  const history = await loadTJMHistory();

  const hasStackFilter = profileStacks && profileStacks.length > 0;
  const hasRegionFilter = !!region;

  if (!hasStackFilter && !hasRegionFilter) {
    return analyzeTJMHistory(history);
  }

  const normalizedStacks = hasStackFilter
    ? new Set(profileStacks.map((s) => s.toLowerCase().trim()))
    : null;

  const filtered: TJMHistory = {
    records: history.records.filter((r) => {
      if (normalizedStacks && !normalizedStacks.has(r.stack)) return false;
      if (hasRegionFilter && r.region !== region) return false;
      return true;
    }),
  };

  return analyzeTJMHistory(filtered);
}
