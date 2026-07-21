import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { publicError, toRemoteCopilotJob } from '$lib/server/copilot/remote-response';
import { createAuthenticatedCopilotRuntime } from '$lib/server/copilot/runtime';

const NO_STORE = { 'Cache-Control': 'no-store' };

export const POST: RequestHandler = async ({ request, params }) => {
  try {
    const { principal, service } = await createAuthenticatedCopilotRuntime(request);
    const outcome = await service.cancelJob(principal, params.jobId);
    return json(toRemoteCopilotJob(outcome.job, outcome.creditsRemaining), {
      headers: NO_STORE,
    });
  } catch (error) {
    const response = publicError(error);
    return json({ error: response.error }, { status: response.status, headers: NO_STORE });
  }
};
