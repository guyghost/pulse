import type { TJMSampleAnalysis, TJMFilters, TJMPeriod } from '$lib/core/types/tjm';
import { sendMessage } from '$lib/shell/messaging/bridge';

/**
 * Get the identifiable local sample, intersecting stacks, geography, period and segments.
 *
 * @param profileStacks - If provided, only include records matching these stacks
 * @param region - If provided, only include records from this region
 * @param period - If provided, only include records within this window ('7d' | '30d'; 'all' is the default)
 */
export async function getTJMAnalysis(
  profileStacks?: string[],
  region?: TJMFilters['region'],
  period?: TJMPeriod,
  segments: Pick<TJMFilters, 'category' | 'seniority' | 'remote'> = {}
): Promise<TJMSampleAnalysis | null> {
  const payload = {
    ...segments,
    ...(profileStacks && profileStacks.length > 0 ? { profileStacks } : {}),
    ...(region ? { region } : {}),
    ...(period && period !== 'all' ? { period } : {}),
  };
  const response = await sendMessage(
    Object.keys(payload).length > 0
      ? { type: 'GET_TJM_ANALYSIS', payload }
      : { type: 'GET_TJM_ANALYSIS' }
  );

  if (response.type !== 'TJM_ANALYSIS_RESULT') {
    throw new Error('Impossible de charger l’analyse TJM.');
  }

  return response.payload.analysis;
}
