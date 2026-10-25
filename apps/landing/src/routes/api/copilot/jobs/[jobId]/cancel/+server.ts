import type { RequestHandler } from './$types';

import { publicError, toRemoteCopilotJob } from '#lib/server/copilot/remote-response.js';
import { createAuthenticatedCopilotRuntime } from '#lib/server/copilot/runtime.js';

const NO_STORE = { 'Cache-Control': 'no-store' };

export const POST: RequestHandler = async ({ request, params }) => {
  try {
    const { principal, service } = await createAuthenticatedCopilotRuntime(request);
    const outcome = await service.cancelJob(principal, params.jobId);
    return Response.json(toRemoteCopilotJob(outcome.job, outcome.creditsRemaining), {
      headers: NO_STORE,
    });
  } catch (error) {
    const response = publicError(error);
    return Response.json({ error: response.error }, { status: response.status, headers: NO_STORE });
  }
};
