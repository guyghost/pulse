import { timingSafeEqual } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

export const COPILOT_RECEIPT_PURGE_BATCH_SIZE = 1000;
export const COPILOT_RECEIPT_PURGE_MAX_BATCHES = 100;

export function isAuthorizedCopilotMaintenanceRequest(
  authorization: string | null,
  secret: string | undefined
): boolean {
  if (!secret || secret.length < 16 || !authorization) return false;
  const expected = `Bearer ${secret}`;
  if (authorization.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(authorization), Buffer.from(expected));
}

/** Drain every expired batch; new receipts are always created with a future expiry. */
export async function purgeExpiredCopilotJobReceipts(
  client: Pick<SupabaseClient, 'rpc'>,
  batchSize = COPILOT_RECEIPT_PURGE_BATCH_SIZE,
  maxBatches = COPILOT_RECEIPT_PURGE_MAX_BATCHES
): Promise<number> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 10000) {
    throw new Error('Invalid Copilot receipt purge batch size');
  }
  if (!Number.isSafeInteger(maxBatches) || maxBatches < 1 || maxBatches > 1000) {
    throw new Error('Invalid Copilot receipt purge batch budget');
  }

  let total = 0;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const { data, error } = await client.rpc('purge_expired_copilot_deleted_job_receipts', {
      p_limit: batchSize,
    });
    if (error) throw new Error('Copilot receipt purge failed');
    if (typeof data !== 'number' || !Number.isSafeInteger(data) || data < 0 || data > batchSize) {
      throw new Error('Invalid Copilot receipt purge result');
    }
    total += data;
    if (data < batchSize) return total;
  }
  throw new Error('Copilot receipt purge did not drain within its batch budget');
}
