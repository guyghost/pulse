import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { publicCopilotDossierSchema } from '$lib/server/copilot/contracts';
import { CopilotApiError } from '$lib/server/copilot/errors';
import { invalidRequestError, publicError } from '$lib/server/copilot/remote-response';
import { createAuthenticatedCopilotRuntime } from '$lib/server/copilot/runtime';

const NO_STORE = { 'Cache-Control': 'no-store' };

export const GET: RequestHandler = async ({ request, params }) => {
  try {
    if (!params.missionId || params.missionId.length > 256) throw invalidRequestError();
    const { principal, service } = await createAuthenticatedCopilotRuntime(request);
    const projection = await service.getDossierProjection(principal, params.missionId);
    if (!projection) {
      throw new CopilotApiError(404, 'DOSSIER_NOT_FOUND', 'Copilot dossier not found');
    }
    const validated = publicCopilotDossierSchema.safeParse(projection);
    if (!validated.success) {
      throw new CopilotApiError(500, 'PERSISTENCE_FAILED', 'Invalid public dossier projection');
    }
    return json(validated.data, { headers: NO_STORE });
  } catch (error) {
    const response = publicError(error);
    return json({ error: response.error }, { status: response.status, headers: NO_STORE });
  }
};

export const DELETE: RequestHandler = async ({ request, params }) => {
  try {
    if (!params.missionId || params.missionId.length > 256) throw invalidRequestError();
    const { principal, service } = await createAuthenticatedCopilotRuntime(request);
    const disposition = await service.deleteDossier(principal, params.missionId);
    return json({ missionId: params.missionId, disposition }, { headers: NO_STORE });
  } catch (error) {
    const response = publicError(error);
    return json({ error: response.error }, { status: response.status, headers: NO_STORE });
  }
};
