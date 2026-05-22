import type { TJMAnalysis, TJMRegion } from '$lib/core/types/tjm';
import { sendMessage } from '$lib/shell/messaging/bridge';

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
  const payload = {
    ...(profileStacks && profileStacks.length > 0 ? { profileStacks } : {}),
    ...(region ? { region } : {}),
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
