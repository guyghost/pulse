import type {
  CopilotOperationKind,
  CopilotTjmCoachFacts,
  CopilotTransmittedPayload,
} from '@pulse/domain';

export interface CopilotProviderFailure {
  code: string;
  message: string;
  retryable: boolean;
}

export interface CopilotProviderSessionHandle {
  sessionId: string;
  continuationToken: string | null;
}

export interface CopilotProviderStartRequest {
  jobId: string;
  attemptId: string;
  operationKind: CopilotOperationKind;
  payload: CopilotTransmittedPayload;
  tjmFacts: CopilotTjmCoachFacts | null;
  session: CopilotProviderSessionHandle | null;
}

export type CopilotProviderStartResult =
  | ({
      status: 'running';
      providerRunId: string;
    } & CopilotProviderSessionHandle)
  | ({
      status: 'completed';
      providerRunId: string;
      result: unknown;
    } & CopilotProviderSessionHandle);

export interface CopilotProviderGetRequest {
  providerRunId: string;
  sessionId: string;
}

export type CopilotProviderGetResult =
  | ({ status: 'running'; providerRunId: string } & CopilotProviderSessionHandle)
  | ({
      status: 'completed';
      providerRunId: string;
      result: unknown;
    } & CopilotProviderSessionHandle)
  | ({
      status: 'failed';
      providerRunId: string;
      failure: CopilotProviderFailure;
    } & CopilotProviderSessionHandle)
  | ({ status: 'cancelled'; providerRunId: string } & CopilotProviderSessionHandle);

export interface CopilotProviderCancelRequest {
  providerRunId: string;
  sessionId: string;
}

export type CopilotProviderCancelResult =
  | { status: 'running'; continuationToken: string | null }
  | { status: 'completed'; continuationToken: string | null; result: unknown }
  | { status: 'cancelled'; continuationToken: string | null };

export interface CopilotProviderDeleteSessionRequest {
  sessionId: string;
}

export interface CopilotProviderDeleteSessionResult {
  disposition: 'deleted' | 'retention-confirmed';
}

/**
 * Server-only provider port. Implementations live in `providers/**`; API and
 * billing orchestration depend only on this interface.
 */
export interface CopilotProvider {
  start(request: CopilotProviderStartRequest): Promise<CopilotProviderStartResult>;
  get?(request: CopilotProviderGetRequest): Promise<CopilotProviderGetResult>;
  cancel(request: CopilotProviderCancelRequest): Promise<CopilotProviderCancelResult>;
  deleteSession?(
    request: CopilotProviderDeleteSessionRequest
  ): Promise<CopilotProviderDeleteSessionResult>;
}
