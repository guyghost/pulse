import { analyzeTJMHistory } from '$lib/core/tjm-history/index';
import type { TJMAnalysis } from '$lib/core/types/tjm';
import { loadTJMHistory } from '$lib/shell/storage/tjm-history';

export async function getTJMAnalysis(): Promise<TJMAnalysis | null> {
  const history = await loadTJMHistory();
  return analyzeTJMHistory(history);
}
