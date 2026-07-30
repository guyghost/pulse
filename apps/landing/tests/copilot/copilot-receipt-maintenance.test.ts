import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import {
  isAuthorizedCopilotMaintenanceRequest,
  purgeExpiredCopilotJobReceipts,
} from '../../src/lib/server/copilot/receipt-maintenance';

describe('Copilot receipt maintenance', () => {
  it('accepts only the configured 16+ character Vercel cron bearer', () => {
    const secret = '0123456789abcdef';
    expect(isAuthorizedCopilotMaintenanceRequest(`Bearer ${secret}`, secret)).toBe(true);
    expect(isAuthorizedCopilotMaintenanceRequest(null, secret)).toBe(false);
    expect(isAuthorizedCopilotMaintenanceRequest('Bearer wrong', secret)).toBe(false);
    expect(isAuthorizedCopilotMaintenanceRequest('Bearer too-short', 'too-short')).toBe(false);
  });

  it('drains every physical-delete batch until the database reports completion', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: 1000, error: null })
      .mockResolvedValueOnce({ data: 1000, error: null })
      .mockResolvedValueOnce({ data: 7, error: null });

    await expect(
      purgeExpiredCopilotJobReceipts({ rpc } as unknown as Pick<SupabaseClient, 'rpc'>)
    ).resolves.toBe(2007);
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc).toHaveBeenNthCalledWith(1, 'purge_expired_copilot_deleted_job_receipts', {
      p_limit: 1000,
    });
  });

  it('fails the maintenance run on a database or malformed-result error', async () => {
    const databaseFailure = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'unavailable' },
    });
    await expect(
      purgeExpiredCopilotJobReceipts({
        rpc: databaseFailure,
      } as unknown as Pick<SupabaseClient, 'rpc'>)
    ).rejects.toThrow('Copilot receipt purge failed');

    const malformed = vi.fn().mockResolvedValue({ data: 1001, error: null });
    await expect(
      purgeExpiredCopilotJobReceipts(
        { rpc: malformed } as unknown as Pick<SupabaseClient, 'rpc'>,
        1000
      )
    ).rejects.toThrow('Invalid Copilot receipt purge result');
  });

  it('fails explicitly instead of running past its batch budget', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    await expect(
      purgeExpiredCopilotJobReceipts({ rpc } as unknown as Pick<SupabaseClient, 'rpc'>, 1, 2)
    ).rejects.toThrow('Copilot receipt purge did not drain within its batch budget');
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
