export type EveProviderErrorCode =
  | 'EVE_DISABLED'
  | 'EVE_INVALID_REQUEST'
  | 'EVE_AUTH_UNAVAILABLE'
  | 'EVE_AUTH_REJECTED'
  | 'EVE_PROTOCOL_REJECTED'
  | 'EVE_TRANSPORT_FAILED'
  | 'EVE_OUTCOME_UNCERTAIN'
  | 'EVE_TURN_FAILED'
  | 'EVE_INTERACTION_REQUIRED'
  | 'EVE_OUTPUT_INVALID'
  | 'EVE_CANCEL_OUTCOME_UNCERTAIN'
  | 'EVE_OPERATION_UNSUPPORTED'
  | 'EVE_SESSION_DELETION_UNSUPPORTED';

export class EveProviderError extends Error {
  readonly code: EveProviderErrorCode;
  readonly retryable: boolean;
  readonly remoteEffectPossible: boolean;
  readonly session: { sessionId: string; continuationToken: string | null } | null;

  constructor(
    code: EveProviderErrorCode,
    message: string,
    retryable: boolean,
    options?: ErrorOptions & {
      remoteEffectPossible?: boolean;
      session?: { sessionId: string; continuationToken: string | null };
    }
  ) {
    super(message, options);
    this.name = 'EveProviderError';
    this.code = code;
    this.retryable = retryable;
    this.remoteEffectPossible = options?.remoteEffectPossible ?? false;
    this.session = options?.session ?? null;
  }
}
