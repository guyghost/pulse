import type { CopilotProviderSessionHandle } from '../provider-port';

export type EveJsonValue =
  string | number | boolean | null | EveJsonValue[] | { [key: string]: EveJsonValue };

export interface EveJsonObject {
  [key: string]: EveJsonValue;
}

export interface EveTurnTransportRequest {
  session: CopilotProviderSessionHandle | null;
  message: string;
  clientContext: string;
  outputSchema: EveJsonObject;
}

export interface EveTurnTransportResult<TOutput> {
  status: 'completed' | 'failed' | 'waiting';
  data: TOutput | undefined;
  sessionId: string;
  continuationToken: string | null;
}

export interface EveCancelTransportResult {
  status: 'accepted' | 'no_active_turn';
}

export interface EveTransport {
  run<TOutput>(request: EveTurnTransportRequest): Promise<EveTurnTransportResult<TOutput>>;
  cancel(sessionId: string): Promise<EveCancelTransportResult>;
}
