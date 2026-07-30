import {
  copilotTjmFactIds,
  isCopilotTjmCoachFacts,
  type CopilotValidatedResult,
} from '@pulse/domain';

import type {
  CopilotProvider,
  CopilotProviderCancelRequest,
  CopilotProviderCancelResult,
  CopilotProviderDeleteSessionRequest,
  CopilotProviderDeleteSessionResult,
  CopilotProviderGetRequest,
  CopilotProviderGetResult,
  CopilotProviderStartRequest,
  CopilotProviderStartResult,
} from '../provider-port';
import type { EveProviderConfig } from './eve-config';
import { EveProviderError } from './eve-error';
import { COPILOT_RESULT_JSON_SCHEMA, validateEveCopilotResult } from './eve-output';
import { validateEveCopilotPayload } from './eve-payload';
import { buildEveCopilotTurn } from './eve-prompt';
import type { EveTransport } from './eve-transport';

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function providerRunId(request: CopilotProviderStartRequest): string {
  return `eve:${encodeURIComponent(request.jobId)}:${encodeURIComponent(request.attemptId)}`;
}

export class EveCopilotProvider implements CopilotProvider {
  readonly #config: EveProviderConfig;
  readonly #transport: EveTransport;

  constructor(config: EveProviderConfig, transport: EveTransport) {
    this.#config = config;
    this.#transport = transport;
  }

  async start(request: CopilotProviderStartRequest): Promise<CopilotProviderStartResult> {
    this.#assertEnabled();
    if (
      !isNonEmpty(request.jobId) ||
      !isNonEmpty(request.attemptId) ||
      (request.session !== null && !isNonEmpty(request.session.sessionId))
    ) {
      throw new EveProviderError(
        'EVE_INVALID_REQUEST',
        'The Eve provider request is malformed.',
        false
      );
    }

    const payload = validateEveCopilotPayload(request.payload);
    if (payload === null) {
      throw new EveProviderError(
        'EVE_INVALID_REQUEST',
        'The Eve provider payload does not match the Copilot contract.',
        false
      );
    }

    if (
      (request.operationKind === 'tjm-coach' && !isCopilotTjmCoachFacts(request.tjmFacts)) ||
      (request.operationKind !== 'tjm-coach' && request.tjmFacts !== null)
    ) {
      throw new EveProviderError(
        'EVE_INVALID_REQUEST',
        'The Eve provider TJM facts do not match the requested operation.',
        false
      );
    }

    const turn = buildEveCopilotTurn(request.operationKind, payload, request.tjmFacts);
    const transportResult = await this.#transport.run<CopilotValidatedResult>({
      session: request.session,
      message: turn.message,
      clientContext: turn.clientContext,
      outputSchema: COPILOT_RESULT_JSON_SCHEMA,
    });

    if (transportResult.status === 'failed') {
      throw new EveProviderError('EVE_TURN_FAILED', 'The Eve turn failed.', true, {
        remoteEffectPossible: true,
        session: {
          sessionId: transportResult.sessionId,
          continuationToken: transportResult.continuationToken,
        },
      });
    }
    if (transportResult.status === 'waiting') {
      throw new EveProviderError(
        'EVE_INTERACTION_REQUIRED',
        'The non-interactive Eve provider requested user input.',
        false,
        {
          remoteEffectPossible: true,
          session: {
            sessionId: transportResult.sessionId,
            continuationToken: transportResult.continuationToken,
          },
        }
      );
    }

    const result = validateEveCopilotResult(
      transportResult.data,
      request.operationKind,
      payload.experienceEvidence.map((evidence) => evidence.evidenceId),
      copilotTjmFactIds(request.tjmFacts),
      { payload, tjmFacts: request.tjmFacts }
    );
    if (result === null) {
      throw new EveProviderError(
        'EVE_OUTPUT_INVALID',
        'Eve returned an invalid Copilot result.',
        false,
        {
          remoteEffectPossible: true,
          session: {
            sessionId: transportResult.sessionId,
            continuationToken: transportResult.continuationToken,
          },
        }
      );
    }

    return {
      status: 'completed',
      providerRunId: providerRunId(request),
      sessionId: transportResult.sessionId,
      continuationToken: transportResult.continuationToken,
      result,
    };
  }

  async get(_request: CopilotProviderGetRequest): Promise<CopilotProviderGetResult> {
    throw new EveProviderError(
      'EVE_OPERATION_UNSUPPORTED',
      'Eve 0.26.2 has no public durable job lookup API.',
      false
    );
  }

  async cancel(request: CopilotProviderCancelRequest): Promise<CopilotProviderCancelResult> {
    this.#assertEnabled();
    if (!isNonEmpty(request.providerRunId) || !isNonEmpty(request.sessionId)) {
      throw new EveProviderError(
        'EVE_INVALID_REQUEST',
        'The Eve cancellation request is malformed.',
        false
      );
    }

    const result = await this.#transport.cancel(request.sessionId);
    if (result.status === 'no_active_turn') {
      throw new EveProviderError(
        'EVE_CANCEL_OUTCOME_UNCERTAIN',
        'The Eve turn settled before cancellation and requires reconciliation.',
        true
      );
    }

    // Eve confirms that cooperative cancellation was accepted, not that the
    // durable turn has reached a cancelled terminal event.
    return { status: 'running', continuationToken: null };
  }

  async deleteSession(
    _request: CopilotProviderDeleteSessionRequest
  ): Promise<CopilotProviderDeleteSessionResult> {
    throw new EveProviderError(
      'EVE_SESSION_DELETION_UNSUPPORTED',
      'Eve 0.26.2 exposes no public session deletion API.',
      false
    );
  }

  #assertEnabled(): void {
    if (!this.#config.enabled) {
      throw new EveProviderError(
        'EVE_DISABLED',
        `The Eve pilot is disabled (${this.#config.reason}).`,
        false
      );
    }
  }
}
