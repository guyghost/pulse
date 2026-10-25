import type { RequestHandler } from './$types';

import { publicCopilotDossierSchema } from '#lib/server/copilot/contracts.js';
import { CopilotApiError } from '#lib/server/copilot/errors.js';
import { invalidRequestError, publicError } from '#lib/server/copilot/remote-response.js';
import { createAuthenticatedCopilotRuntime } from '#lib/server/copilot/runtime.js';

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
    return Response.json(validated.data, { headers: NO_STORE });
  } catch (error) {
    const response = publicError(error);
    return Response.json({ error: response.error }, { status: response.status, headers: NO_STORE });
  }
};

export const DELETE: RequestHandler = async ({ request, params }) => {
  try {
    if (!params.missionId || params.missionId.length > 256) throw invalidRequestError();
    const { principal, service } = await createAuthenticatedCopilotRuntime(request);
    const disposition = await service.deleteDossier(principal, params.missionId);
    return Response.json({ missionId: params.missionId, disposition }, { headers: NO_STORE });
  } catch (error) {
    const response = publicError(error);
    return Response.json({ error: response.error }, { status: response.status, headers: NO_STORE });
  }
};
