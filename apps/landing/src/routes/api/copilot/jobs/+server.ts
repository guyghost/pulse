import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import {
  createJobBodySchema,
  parseConsent,
  validIdempotencyKey,
} from '$lib/server/copilot/contracts';
import {
  invalidRequestError,
  publicError,
  toRemoteCopilotJob,
} from '$lib/server/copilot/remote-response';
import { assertCopilotInputHash } from '$lib/server/copilot/input-hash';
import { createAuthorizedCopilotRuntime } from '$lib/server/copilot/runtime';

const MAX_BODY_BYTES = 256 * 1024;
const NO_STORE = { 'Cache-Control': 'no-store' };

export const POST: RequestHandler = async ({ request }) => {
  try {
    const idempotencyKey = request.headers.get('idempotency-key');
    if (!validIdempotencyKey(idempotencyKey)) throw invalidRequestError();
    const contentLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      throw invalidRequestError();
    }
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw invalidRequestError();
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw invalidRequestError();
    }
    const parsed = createJobBodySchema.safeParse(raw);
    if (!parsed.success) throw invalidRequestError();
    const { inputHash, ...hashInput } = parsed.data;
    await assertCopilotInputHash(hashInput, inputHash);
    const { principal, service } = await createAuthorizedCopilotRuntime(request);
    const existing = await service.getJobByIdempotency(principal, idempotencyKey, {
      inputHash,
      missionId: parsed.data.missionId,
      operationKind: parsed.data.kind,
    });
    if (existing) {
      return json(toRemoteCopilotJob(existing, principal.creditsRemaining), {
        headers: NO_STORE,
      });
    }
    await service.assertJobReplayAllowed(principal, idempotencyKey, inputHash);

    const consent = parseConsent(parsed.data.consent);
    const dossier = await service.createDossier(principal, {
      missionId: parsed.data.missionId,
      consent,
    });
    const outcome = await service.createJob(principal, {
      dossierId: dossier.id,
      idempotencyKey,
      operationKind: parsed.data.kind,
      inputHash,
      consent,
      payload: parsed.data.input,
      tjmFacts: parsed.data.tjmFacts,
    });
    return json(toRemoteCopilotJob(outcome.job, outcome.creditsRemaining), {
      headers: NO_STORE,
    });
  } catch (error) {
    const response = publicError(error);
    return json({ error: response.error }, { status: response.status, headers: NO_STORE });
  }
};
