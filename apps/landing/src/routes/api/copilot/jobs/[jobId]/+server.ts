import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { publicError, toRemoteCopilotJob } from '$lib/server/copilot/remote-response';
import { createAuthorizedCopilotRuntime } from '$lib/server/copilot/runtime';

const NO_STORE = { 'Cache-Control': 'no-store' };

export const GET: RequestHandler = async ({ request, params }) => {
  try {
    const { principal, service } = await createAuthorizedCopilotRuntime(request);
    const job = await service.getJob(principal, params.jobId);
    return json(toRemoteCopilotJob(job, principal.creditsRemaining), { headers: NO_STORE });
  } catch (error) {
    const response = publicError(error);
    return json({ error: response.error }, { status: response.status, headers: NO_STORE });
  }
};
