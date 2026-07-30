import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { publicError } from '$lib/server/copilot/remote-response';
import { authenticateCopilotRequest, syncCopilotEntitlement } from '$lib/server/copilot/auth';
import { copilotAuthorizationDependencies } from '$lib/server/copilot/runtime';

const NO_STORE = { 'Cache-Control': 'no-store' };

export const GET: RequestHandler = async ({ request }) => {
  try {
    const dependencies = copilotAuthorizationDependencies();
    const { principal } = await authenticateCopilotRequest(request, dependencies);
    const entitlement = await syncCopilotEntitlement(principal.userId, dependencies);
    return json(entitlement, { headers: NO_STORE });
  } catch (error) {
    const response = publicError(error);
    return json({ error: response.error }, { status: response.status, headers: NO_STORE });
  }
};
