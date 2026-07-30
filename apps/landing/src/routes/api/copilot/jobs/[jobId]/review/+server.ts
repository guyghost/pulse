import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

import {
  invalidRequestError,
  publicError,
  toRemoteCopilotJob,
} from '$lib/server/copilot/remote-response';
import { createAuthenticatedCopilotRuntime } from '$lib/server/copilot/runtime';

const reviewSchema = z.object({ decision: z.enum(['accept', 'reject']) }).strict();
const NO_STORE = { 'Cache-Control': 'no-store' };

export const POST: RequestHandler = async ({ request, params }) => {
  try {
    const { principal, service } = await createAuthenticatedCopilotRuntime(request);
    const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw invalidRequestError();
    const outcome = await service.reviewJob(principal, params.jobId, parsed.data.decision);
    return json(toRemoteCopilotJob(outcome.job, outcome.creditsRemaining), {
      headers: NO_STORE,
    });
  } catch (error) {
    const response = publicError(error);
    return json({ error: response.error }, { status: response.status, headers: NO_STORE });
  }
};
