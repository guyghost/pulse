import type { RequestHandler } from './$types';

import { publicError } from '#lib/server/copilot/remote-response.js';
import { authenticateCopilotRequest, syncCopilotEntitlement } from '#lib/server/copilot/auth.js';
import { copilotAuthorizationDependencies } from '#lib/server/copilot/runtime.js';

const NO_STORE = { 'Cache-Control': 'no-store' };

export const GET: RequestHandler = async ({ request }) => {
  try {
    const dependencies = copilotAuthorizationDependencies();
    const { principal } = await authenticateCopilotRequest(request, dependencies);
    const entitlement = await syncCopilotEntitlement(principal.userId, dependencies);
    return Response.json(entitlement, { headers: NO_STORE });
  } catch (error) {
    const response = publicError(error);
    return Response.json({ error: response.error }, { status: response.status, headers: NO_STORE });
  }
};
