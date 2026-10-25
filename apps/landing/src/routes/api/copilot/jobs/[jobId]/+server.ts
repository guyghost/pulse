import type { RequestHandler } from './$types';

import { publicError, toRemoteCopilotJob } from '#lib/server/copilot/remote-response.js';
import { createAuthorizedCopilotRuntime } from '#lib/server/copilot/runtime.js';

const NO_STORE = { 'Cache-Control': 'no-store' };

export const GET: RequestHandler = async ({ request, params }) => {
  try {
    const { principal, service } = await createAuthorizedCopilotRuntime(request);
    const job = await service.getJob(principal, params.jobId);
    return Response.json(toRemoteCopilotJob(job, principal.creditsRemaining), {
      headers: NO_STORE,
    });
  } catch (error) {
    const response = publicError(error);
    return Response.json({ error: response.error }, { status: response.status, headers: NO_STORE });
  }
};
