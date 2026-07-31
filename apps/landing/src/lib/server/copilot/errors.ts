export type CopilotErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'ENTITLEMENT_DENIED'
  | 'ROLLOUT_DISABLED'
  | 'INVALID_REQUEST'
  | 'DOSSIER_NOT_FOUND'
  | 'DOSSIER_BUSY'
  | 'JOB_NOT_FOUND'
  | 'JOB_GONE'
  | 'OWNERSHIP_DENIED'
  | 'INSUFFICIENT_CREDITS'
  | 'RATE_LIMITED'
  | 'PROVIDER_FAILED'
  | 'RESULT_INVALID'
  | 'CANCELLATION_NOT_ALLOWED'
  | 'CANCELLATION_FAILED'
  | 'REVIEW_NOT_ALLOWED'
  | 'DELETE_FAILED'
  | 'PERSISTENCE_FAILED';

export class CopilotApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: CopilotErrorCode,
    message: string,
    readonly retryable = false
  ) {
    super(message);
    this.name = 'CopilotApiError';
  }
}

export function asCopilotApiError(error: unknown): CopilotApiError {
  if (error instanceof CopilotApiError) return error;
  return new CopilotApiError(500, 'PERSISTENCE_FAILED', 'Copilot request failed', true);
}
