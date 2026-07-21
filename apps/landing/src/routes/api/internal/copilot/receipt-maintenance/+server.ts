import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import {
  isAuthorizedCopilotMaintenanceRequest,
  purgeExpiredCopilotJobReceipts,
} from '$lib/server/copilot/receipt-maintenance';
import { createSupabaseAdminClient } from '$lib/server/supabase';

const NO_STORE = { 'Cache-Control': 'no-store' };

export const GET: RequestHandler = async ({ request }) => {
  if (
    !isAuthorizedCopilotMaintenanceRequest(request.headers.get('authorization'), env.CRON_SECRET)
  ) {
    return json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  }

  try {
    const deleted = await purgeExpiredCopilotJobReceipts(createSupabaseAdminClient());
    return json({ deleted }, { headers: NO_STORE });
  } catch (error) {
    console.error('Copilot receipt maintenance failed', error);
    return json({ error: 'Maintenance failed' }, { status: 503, headers: NO_STORE });
  }
};
