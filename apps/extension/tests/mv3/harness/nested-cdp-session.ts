const MAX_NESTED_CDP_MESSAGE_BYTES = 1_048_576;
const MAX_NESTED_PENDING_COMMANDS = 256;

export interface ReceivedMessageFromTarget {
  readonly message: string;
  readonly sessionId: string;
}

export interface BrowserCdpSessionLike {
  on(
    event: 'Target.receivedMessageFromTarget',
    listener: (event: ReceivedMessageFromTarget) => void
  ): void;
  off(
    event: 'Target.receivedMessageFromTarget',
    listener: (event: ReceivedMessageFromTarget) => void
  ): void;
  send(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface NestedCdpEvent {
  readonly method: string;
  readonly params: Readonly<Record<string, unknown>>;
}

interface NestedCdpSessionOptions {
  readonly browserSession: BrowserCdpSessionLike;
  readonly nestedSessionId: string;
  readonly onProtocolFailure: (error: Error) => void;
}

interface PendingNestedCommand {
  readonly reject: (error: Error) => void;
  readonly resolve: (result: Readonly<Record<string, unknown>>) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function protocolError(value: unknown): string {
  return isRecord(value) && typeof value.message === 'string'
    ? value.message
    : 'Unknown nested CDP protocol error.';
}

export class NestedCdpSession {
  readonly #browserSession: BrowserCdpSessionLike;
  readonly #nestedSessionId: string;
  readonly #onProtocolFailure: (error: Error) => void;
  readonly #pending = new Map<number, PendingNestedCommand>();
  readonly #listeners = new Set<(event: NestedCdpEvent) => void | Promise<void>>();
  #nextCommandId = 0;
  #disposed = false;
  #eventChain: Promise<void> = Promise.resolve();

  readonly #handleMessage = (envelope: ReceivedMessageFromTarget): void => {
    if (this.#disposed || envelope.sessionId !== this.#nestedSessionId) {
      return;
    }
    if (
      typeof envelope.message !== 'string' ||
      Buffer.byteLength(envelope.message, 'utf8') > MAX_NESTED_CDP_MESSAGE_BYTES
    ) {
      this.#onProtocolFailure(new Error('Nested CDP message is non-text or oversized.'));
      return;
    }

    let value: unknown;
    try {
      value = JSON.parse(envelope.message);
    } catch {
      this.#onProtocolFailure(new Error('Nested CDP message is not valid JSON.'));
      return;
    }
    if (!isRecord(value)) {
      this.#onProtocolFailure(new Error('Nested CDP message must be an object.'));
      return;
    }

    if ('id' in value) {
      if (!Number.isSafeInteger(value.id) || (value.id as number) < 1 || 'method' in value) {
        this.#onProtocolFailure(new Error('Nested CDP response identity is invalid.'));
        return;
      }
      const pending = this.#pending.get(value.id as number);
      if (!pending) {
        this.#onProtocolFailure(new Error('Nested CDP response has no pending command.'));
        return;
      }
      this.#pending.delete(value.id as number);
      if ('error' in value) {
        pending.reject(new Error(protocolError(value.error)));
        return;
      }
      if (!isRecord(value.result)) {
        pending.reject(new Error('Nested CDP response result must be an object.'));
        return;
      }
      pending.resolve(Object.freeze({ ...value.result }));
      return;
    }

    if (typeof value.method !== 'string' || !isRecord(value.params)) {
      this.#onProtocolFailure(new Error('Nested CDP event shape is invalid.'));
      return;
    }
    const event = Object.freeze({
      method: value.method,
      params: Object.freeze({ ...value.params }),
    });
    this.#eventChain = this.#eventChain
      .then(async () => {
        for (const listener of this.#listeners) {
          await listener(event);
        }
      })
      .catch((error: unknown) => {
        this.#onProtocolFailure(
          error instanceof Error ? error : new Error('Nested CDP event listener failed.')
        );
      });
  };

  constructor(options: NestedCdpSessionOptions) {
    if (
      options.nestedSessionId.length === 0 ||
      Buffer.byteLength(options.nestedSessionId, 'utf8') > 512 ||
      options.nestedSessionId.includes('\u0000') ||
      options.nestedSessionId.includes('\r') ||
      options.nestedSessionId.includes('\n')
    ) {
      throw new Error('Nested CDP session ID is invalid.');
    }
    this.#browserSession = options.browserSession;
    this.#nestedSessionId = options.nestedSessionId;
    this.#onProtocolFailure = options.onProtocolFailure;
    this.#browserSession.on('Target.receivedMessageFromTarget', this.#handleMessage);
  }

  onEvent(listener: (event: NestedCdpEvent) => void | Promise<void>): () => void {
    if (this.#disposed) {
      throw new Error('Nested CDP session is disposed.');
    }
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async sendCommand(
    method: string,
    params: Readonly<Record<string, unknown>> = {}
  ): Promise<Readonly<Record<string, unknown>>> {
    if (this.#disposed) {
      throw new Error('Nested CDP session is disposed.');
    }
    if (
      method.length === 0 ||
      method.includes('\u0000') ||
      method.includes('\r') ||
      method.includes('\n') ||
      !isRecord(params)
    ) {
      throw new Error('Nested CDP command is invalid.');
    }
    if (this.#pending.size >= MAX_NESTED_PENDING_COMMANDS) {
      throw new Error('Nested CDP pending command capacity exceeded.');
    }
    const id = ++this.#nextCommandId;
    const message = JSON.stringify({ id, method, params });
    if (Buffer.byteLength(message, 'utf8') > MAX_NESTED_CDP_MESSAGE_BYTES) {
      throw new Error('Nested CDP outbound message exceeds its byte limit.');
    }

    const response = new Promise<Readonly<Record<string, unknown>>>((resolve, reject) => {
      this.#pending.set(id, { reject, resolve });
    });
    try {
      await this.#browserSession.send('Target.sendMessageToTarget', {
        message,
        sessionId: this.#nestedSessionId,
      });
    } catch (error) {
      this.#pending.delete(id);
      throw error;
    }
    return response;
  }

  async drainEvents(): Promise<void> {
    await this.#eventChain;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#browserSession.off('Target.receivedMessageFromTarget', this.#handleMessage);
    for (const pending of this.#pending.values()) {
      pending.reject(new Error('Nested CDP session disposed before command response.'));
    }
    this.#pending.clear();
    this.#listeners.clear();
  }
}
