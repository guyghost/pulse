import { CRON_SECRET } from '$app/env/private';
import type { RequestHandler } from './$types';

import {
  isAuthorizedCopilotMaintenanceRequest,
  purgeExpiredCopilotJobReceipts,
} from '#lib/server/copilot/receipt-maintenance.js';
import { createSupabaseAdminClient } from '#lib/server/supabase.js';

const NO_STORE = { 'Cache-Control': 'no-store' };

export const GET: RequestHandler = async ({ request }) => {
  if (!isAuthorizedCopilotMaintenanceRequest(request.headers.get('authorization'), CRON_SECRET)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  }

  try {
    const deleted = await purgeExpiredCopilotJobReceipts(createSupabaseAdminClient());
    return Response.json({ deleted }, { headers: NO_STORE });
  } catch (error) {
    console.error('Copilot receipt maintenance failed', error);
    return Response.json({ error: 'Maintenance failed' }, { status: 503, headers: NO_STORE });
  }
};
