import type { z } from 'zod';

import type {
  CopilotCreateApiInput,
  CopilotDossierProjection,
  CopilotEntitlement,
  CopilotError,
  CopilotRemoteDeleteResult,
  CopilotRemoteJob,
} from './contracts';
import {
  CopilotEntitlementSchema,
  CopilotDossierProjectionSchema,
  CopilotRemoteDeleteSchema,
  CopilotRemoteErrorEnvelopeSchema,
  CopilotRemoteJobSchema,
} from './validation';

/** Must remain above the server's 120s maximum Eve deadline. */
export const COPILOT_HTTP_TIMEOUT_MS = 130_000;

export class CopilotTransportError extends Error {
  readonly copilotError: CopilotError;

  constructor(error: CopilotError) {
    super(error.message);
    this.name = 'CopilotTransportError';
    this.copilotError = error;
  }
}

export interface CopilotTransport {
  createLinkUrl(redirectUri: string, state: string): string;
  syncEntitlement(bearer: string): Promise<CopilotEntitlement>;
  createJob(
    bearer: string,
    input: CopilotCreateApiInput,
    idempotencyKey: string
  ): Promise<CopilotRemoteJob>;
  getJob(bearer: string, jobId: string): Promise<CopilotRemoteJob>;
  getDossier(bearer: string, missionId: string): Promise<CopilotDossierProjection>;
  cancelJob(bearer: string, jobId: string): Promise<CopilotRemoteJob>;
  reviewJob(
    bearer: string,
    jobId: string,
    decision: 'accept' | 'reject'
  ): Promise<CopilotRemoteJob>;
  deleteDossier(bearer: string, missionId: string): Promise<CopilotRemoteDeleteResult>;
}

export interface CopilotTransportOptions {
  accountOrigin: string;
  apiOrigin: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function fallbackHttpError(status: number): CopilotError {
  switch (status) {
    case 401:
      return { code: 'AUTH_REQUIRED', message: 'La session Copilot a expiré.', retryable: false };
    case 402:
      return {
        code: 'INSUFFICIENT_CREDITS',
        message: 'Crédits Copilot insuffisants.',
        retryable: false,
      };
    case 403:
      return {
        code: 'ENTITLEMENT_DENIED',
        message: "L'abonnement Premium n'autorise pas cette action.",
        retryable: false,
      };
    case 404:
      return { code: 'JOB_NOT_FOUND', message: 'Job Copilot introuvable.', retryable: false };
    case 410:
      return {
        code: 'JOB_GONE',
        message: 'Ce job Copilot a été supprimé et ne peut pas être recréé.',
        retryable: false,
      };
    case 409:
      return { code: 'JOB_CONFLICT', message: 'Un job Copilot est déjà actif.', retryable: true };
    case 422:
      return { code: 'INVALID_REQUEST', message: 'Requête Copilot invalide.', retryable: false };
    case 429:
      return {
        code: 'RATE_LIMITED',
        message: 'Quota Copilot temporairement atteint. Réessayez à la prochaine fenêtre.',
        retryable: false,
      };
    default:
      return {
        code: 'REMOTE_FAILED',
        message: 'Le service Copilot est temporairement indisponible.',
        retryable: status >= 500 || status === 429,
      };
  }
}

async function parseHttpError(response: Response): Promise<CopilotError> {
  try {
    const parsed = CopilotRemoteErrorEnvelopeSchema.safeParse(await response.json());
    if (parsed.success) {
      return parsed.data.error;
    }
  } catch {
    // The fallback below intentionally does not expose an untrusted response body.
  }
  return fallbackHttpError(response.status);
}

export function createCopilotTransport(options: CopilotTransportOptions): CopilotTransport {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? COPILOT_HTTP_TIMEOUT_MS;
  const accountOrigin = new URL(options.accountOrigin).origin;
  const apiOrigin = new URL(options.apiOrigin).origin;

  async function requestJson<T>(
    pathname: string,
    bearer: string,
    schema: z.ZodType<T>,
    init: RequestInit = {}
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(new URL(pathname, apiOrigin), {
        ...init,
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${bearer}`,
          'Cache-Control': 'no-store',
          ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...init.headers,
        },
      });

      if (!response.ok) {
        throw new CopilotTransportError(await parseHttpError(response));
      }

      let raw: unknown;
      try {
        raw = await response.json();
      } catch {
        throw new CopilotTransportError({
          code: 'PROTOCOL_ERROR',
          message: 'Réponse Copilot illisible.',
          retryable: false,
        });
      }
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        throw new CopilotTransportError({
          code: 'PROTOCOL_ERROR',
          message: 'Réponse Copilot non conforme.',
          retryable: false,
        });
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof CopilotTransportError) {
        throw error;
      }
      throw new CopilotTransportError({
        code: 'NETWORK_ERROR',
        message:
          error instanceof DOMException && error.name === 'AbortError'
            ? 'Le service Copilot ne répond pas.'
            : 'Connexion au service Copilot impossible.',
        retryable: true,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    createLinkUrl(redirectUri, state) {
      const url = new URL('/api/copilot/link', accountOrigin);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('state', state);
      return url.toString();
    },
    syncEntitlement(bearer) {
      return requestJson('/api/copilot/entitlement', bearer, CopilotEntitlementSchema);
    },
    createJob(bearer, input, idempotencyKey) {
      return requestJson('/api/copilot/jobs', bearer, CopilotRemoteJobSchema, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(input),
      });
    },
    getJob(bearer, jobId) {
      return requestJson(
        `/api/copilot/jobs/${encodeURIComponent(jobId)}`,
        bearer,
        CopilotRemoteJobSchema
      );
    },
    getDossier(bearer, missionId) {
      return requestJson(
        `/api/copilot/dossiers/${encodeURIComponent(missionId)}`,
        bearer,
        CopilotDossierProjectionSchema
      );
    },
    cancelJob(bearer, jobId) {
      return requestJson(
        `/api/copilot/jobs/${encodeURIComponent(jobId)}/cancel`,
        bearer,
        CopilotRemoteJobSchema,
        { method: 'POST', body: JSON.stringify({}) }
      );
    },
    reviewJob(bearer, jobId, decision) {
      return requestJson(
        `/api/copilot/jobs/${encodeURIComponent(jobId)}/review`,
        bearer,
        CopilotRemoteJobSchema,
        { method: 'POST', body: JSON.stringify({ decision }) }
      );
    },
    deleteDossier(bearer, missionId) {
      return requestJson(
        `/api/copilot/dossiers/${encodeURIComponent(missionId)}`,
        bearer,
        CopilotRemoteDeleteSchema,
        { method: 'DELETE' }
      );
    },
  };
}
