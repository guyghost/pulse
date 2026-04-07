import { analyzeTJMHistory } from '$lib/core/tjm-history/index';
import type { TJMAnalysis, TJMHistory } from '$lib/core/types/tjm';
import { loadTJMHistory } from '$lib/shell/storage/tjm-history';

/**
 * Get TJM analysis, optionally filtered by the user's stack.
 *
 * @param profileStacks - If provided, only include records matching these stacks
 */
export async function getTJMAnalysis(profileStacks?: string[]): Promise<TJMAnalysis | null> {
  const history = await loadTJMHistory();

  if (profileStacks && profileStacks.length > 0) {
    const normalizedStacks = new Set(profileStacks.map((s) => s.toLowerCase().trim()));
    const filtered: TJMHistory = {
      records: history.records.filter((r) => normalizedStacks.has(r.stack)),
    };
    return analyzeTJMHistory(filtered);
  }

  return analyzeTJMHistory(history);
}
