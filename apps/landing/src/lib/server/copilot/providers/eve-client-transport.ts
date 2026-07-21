import { getVercelOidcToken } from '@vercel/oidc';
import { Client, ClientError } from 'eve/client';

import type { EveProviderConfig } from './eve-config';
import { EveProviderError } from './eve-error';
import type {
  EveCancelTransportResult,
  EveTransport,
  EveTurnTransportRequest,
  EveTurnTransportResult,
} from './eve-transport';

type EnabledEveProviderConfig = Extract<EveProviderConfig, { enabled: true }>;
type OidcTokenResolver = () => Promise<string>;

function clientErrorToProviderError(error: ClientError): EveProviderError {
  if (error.status === 401 || error.status === 403) {
    return new EveProviderError(
      'EVE_AUTH_REJECTED',
      'Eve rejected the server-to-server identity.',
      false,
      { cause: error }
    );
  }

  const retryable = error.status === 408 || error.status === 429 || error.status >= 500;
  return new EveProviderError(
    retryable ? 'EVE_TRANSPORT_FAILED' : 'EVE_PROTOCOL_REJECTED',
    retryable ? 'The Eve transport failed.' : 'Eve rejected the provider request.',
    retryable,
    { cause: error, remoteEffectPossible: retryable }
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

export class EveClientTransport implements EveTransport {
  readonly #config: EnabledEveProviderConfig;
  readonly #resolveOidcToken: OidcTokenResolver;

  constructor(
    config: EnabledEveProviderConfig,
    resolveOidcToken: OidcTokenResolver = getVercelOidcToken
  ) {
    this.#config = config;
    this.#resolveOidcToken = resolveOidcToken;
  }

  async run<TOutput>(request: EveTurnTransportRequest): Promise<EveTurnTransportResult<TOutput>> {
    if (request.session !== null && request.session.continuationToken === null) {
      throw new EveProviderError(
        'EVE_INVALID_REQUEST',
        'An Eve follow-up requires a continuation token.',
        false
      );
    }

    try {
      const client = this.#createClient();
      const session = request.session
        ? client.session({
            sessionId: request.session.sessionId,
            continuationToken: request.session.continuationToken ?? undefined,
            streamIndex: 0,
          })
        : client.session();
      const response = await session.send<TOutput>({
        message: request.message,
        clientContext: request.clientContext,
        outputSchema: request.outputSchema,
        signal: AbortSignal.timeout(this.#config.timeoutMs),
      });
      const result = await response.result();

      return {
        status: result.status,
        data: result.data,
        sessionId: result.sessionId,
        continuationToken: session.state.continuationToken ?? response.continuationToken ?? null,
      };
    } catch (error) {
      if (error instanceof EveProviderError) throw error;
      if (isAbortError(error)) {
        throw new EveProviderError(
          'EVE_OUTCOME_UNCERTAIN',
          'The Eve turn exceeded its deadline; completion must be reconciled.',
          true,
          { cause: error, remoteEffectPossible: true }
        );
      }
      if (error instanceof ClientError) throw clientErrorToProviderError(error);
      throw new EveProviderError('EVE_TRANSPORT_FAILED', 'The Eve transport failed.', true, {
        cause: error,
        remoteEffectPossible: true,
      });
    }
  }

  async cancel(sessionId: string): Promise<EveCancelTransportResult> {
    try {
      const session = this.#createClient().session({ sessionId, streamIndex: 0 });
      const result = await session.cancel();
      return { status: result.status };
    } catch (error) {
      if (error instanceof EveProviderError) throw error;
      if (error instanceof ClientError) throw clientErrorToProviderError(error);
      throw new EveProviderError(
        'EVE_TRANSPORT_FAILED',
        'The Eve cancellation request failed.',
        true,
        { cause: error }
      );
    }
  }

  #createClient(): Client {
    return new Client({
      host: this.#config.host,
      redirect: 'error',
      preserveCompletedSessions: true,
      ...(this.#config.localDevelopment
        ? {}
        : {
            auth: {
              vercelOidc: {
                token: async () => {
                  try {
                    return await this.#resolveOidcToken();
                  } catch (error) {
                    throw new EveProviderError(
                      'EVE_AUTH_UNAVAILABLE',
                      'The Vercel OIDC identity is unavailable.',
                      false,
                      { cause: error }
                    );
                  }
                },
              },
            },
          }),
    });
  }
}
