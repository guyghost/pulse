import type { TJMAnalysis, TJMPeriod, TJMRegion } from '$lib/core/types/tjm';
import { sendMessage } from '$lib/shell/messaging/bridge';

/**
 * Get TJM analysis, optionally filtered by stacks, region and/or period.
 *
 * @param profileStacks - If provided, only include records matching these stacks
 * @param region - If provided, only include records from this region
 * @param period - If provided, only include records within this window ('7d' | '30d'; 'all' is the default)
 */
export async function getTJMAnalysis(
  profileStacks?: string[],
  region?: TJMRegion,
  period?: TJMPeriod
): Promise<TJMAnalysis | null> {
  const payload = {
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
    throw new Error('TJM analysis load failed.');
  }

  return response.payload.analysis;
}
