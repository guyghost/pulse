import type { ConnectOverCDPTransport } from 'playwright-core';

export interface TrackedSocketEvent {
  readonly code?: number;
  readonly data?: unknown;
  readonly reason?: string;
}

export interface TrackedSocketLike {
  readonly readyState: number;
  addEventListener(type: string, listener: (event: TrackedSocketEvent) => void): void;
  removeEventListener(type: string, listener: (event: TrackedSocketEvent) => void): void;
  send(data: string): void;
  close(): void;
}

export interface TrackedTransportIdentity {
  readonly leaseEpoch: number;
  readonly processGeneration: number;
  readonly transportId: string;
}

export interface TrackedTransportOpenReceipt extends TrackedTransportIdentity {
  readonly schemaVersion: 1;
}

export interface TrackedTransportCloseReceipt extends TrackedTransportIdentity {
  readonly code: number;
  readonly reason: string;
  readonly schemaVersion: 1;
}

interface OpenTrackedCdpTransportOptions {
  readonly createSocket: (endpointUrl: string) => TrackedSocketLike;
  readonly endpointUrl: string;
  readonly identity: TrackedTransportIdentity;
  readonly maxInboundMessageBytes: number;
  readonly onProtocolFailure: (error: Error) => void;
  readonly openTimeoutMs: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertIdentity(identity: TrackedTransportIdentity): void {
  if (
    !Number.isSafeInteger(identity.processGeneration) ||
    identity.processGeneration < 0 ||
    !Number.isSafeInteger(identity.leaseEpoch) ||
    identity.leaseEpoch < 0 ||
    identity.transportId.length === 0 ||
    identity.transportId.includes('\u0000') ||
    identity.transportId.includes('\r') ||
    identity.transportId.includes('\n')
  ) {
    throw new Error('Tracked transport identity is invalid.');
  }
}

export class TrackedCdpTransport implements ConnectOverCDPTransport {
  onmessage?: (message: object) => void;
  onclose?: (reason?: string) => void;

  readonly openReceipt: TrackedTransportOpenReceipt;
  readonly closed: Promise<TrackedTransportCloseReceipt>;

  readonly #socket: TrackedSocketLike;
  readonly #maxInboundMessageBytes: number;
  readonly #onProtocolFailure: (error: Error) => void;
  readonly #identity: TrackedTransportIdentity;
  readonly #resolveClosed: (receipt: TrackedTransportCloseReceipt) => void;
  readonly #openPromise: Promise<void>;
  readonly #resolveOpen: () => void;
  readonly #rejectOpen: (error: Error) => void;
  #openSettled = false;
  #closeRequested = false;
  #closeSettled = false;

  readonly #handleOpen = (): void => {
    if (this.#openSettled) {
      return;
    }
    this.#openSettled = true;
    this.#resolveOpen();
  };

  readonly #handleError = (): void => {
    const error = new Error('Tracked CDP WebSocket connection failed.');
    if (!this.#openSettled) {
      this.#openSettled = true;
      this.#rejectOpen(error);
    }
    this.#failProtocol(error);
  };

  readonly #handleMessage = (event: TrackedSocketEvent): void => {
    if (typeof event.data !== 'string') {
      this.#failProtocol(new Error('Tracked CDP inbound message must be text.'));
      return;
    }
    if (Buffer.byteLength(event.data, 'utf8') > this.#maxInboundMessageBytes) {
      this.#failProtocol(new Error('Tracked CDP inbound message exceeds its byte limit.'));
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data);
    } catch {
      this.#failProtocol(new Error('Tracked CDP inbound message is not valid JSON.'));
      return;
    }
    if (!isRecord(parsed)) {
      this.#failProtocol(new Error('Tracked CDP inbound message must be an object.'));
      return;
    }
    this.onmessage?.(parsed);
  };

  readonly #handleClose = (event: TrackedSocketEvent): void => {
    if (!this.#openSettled) {
      this.#openSettled = true;
      this.#rejectOpen(new Error('Tracked CDP WebSocket closed before opening.'));
    }
    if (this.#closeSettled) {
      return;
    }
    this.#closeSettled = true;
    this.#removeListeners();
    const receipt = Object.freeze({
      ...this.#identity,
      code: typeof event.code === 'number' ? event.code : 0,
      reason: typeof event.reason === 'string' ? event.reason : '',
      schemaVersion: 1 as const,
    });
    this.#resolveClosed(receipt);
    this.onclose?.(receipt.reason);
  };

  constructor(
    socket: TrackedSocketLike,
    identity: TrackedTransportIdentity,
    maxInboundMessageBytes: number,
    onProtocolFailure: (error: Error) => void
  ) {
    assertIdentity(identity);
    if (!Number.isSafeInteger(maxInboundMessageBytes) || maxInboundMessageBytes < 1) {
      throw new Error('Tracked CDP inbound byte limit must be a positive safe integer.');
    }
    this.#socket = socket;
    this.#identity = Object.freeze({ ...identity });
    this.#maxInboundMessageBytes = maxInboundMessageBytes;
    this.#onProtocolFailure = onProtocolFailure;
    this.openReceipt = Object.freeze({ ...identity, schemaVersion: 1 });

    let resolveClosed!: (receipt: TrackedTransportCloseReceipt) => void;
    this.closed = new Promise<TrackedTransportCloseReceipt>((resolve) => {
      resolveClosed = resolve;
    });
    this.#resolveClosed = resolveClosed;

    let resolveOpen!: () => void;
    let rejectOpen!: (error: Error) => void;
    this.#openPromise = new Promise<void>((resolve, reject) => {
      resolveOpen = resolve;
      rejectOpen = reject;
    });
    this.#resolveOpen = resolveOpen;
    this.#rejectOpen = rejectOpen;

    socket.addEventListener('open', this.#handleOpen);
    socket.addEventListener('error', this.#handleError);
    socket.addEventListener('message', this.#handleMessage);
    socket.addEventListener('close', this.#handleClose);
    if (socket.readyState === 1) {
      this.#handleOpen();
    }
  }

  open(): void {
    if (!this.#openSettled) {
      throw new Error('Tracked CDP transport is not open yet.');
    }
  }

  async waitUntilOpen(timeoutMs: number): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.#openPromise,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Timed out opening tracked CDP transport.')),
            timeoutMs
          );
        }),
      ]);
    } catch (error) {
      this.close();
      throw error;
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  }

  send(message: object): void {
    if (this.#socket.readyState !== 1 || this.#closeRequested) {
      throw new Error('Tracked CDP transport is not open.');
    }
    if (!isRecord(message)) {
      throw new Error('Tracked CDP outbound message must be an object.');
    }
    this.#socket.send(JSON.stringify(message));
  }

  close(): void {
    if (this.#closeRequested || this.#closeSettled) {
      return;
    }
    this.#closeRequested = true;
    this.#socket.close();
  }

  #failProtocol(error: Error): void {
    if (this.#closeRequested || this.#closeSettled) {
      return;
    }
    this.#onProtocolFailure(error);
    this.close();
  }

  #removeListeners(): void {
    this.#socket.removeEventListener('open', this.#handleOpen);
    this.#socket.removeEventListener('error', this.#handleError);
    this.#socket.removeEventListener('message', this.#handleMessage);
    this.#socket.removeEventListener('close', this.#handleClose);
  }
}

export async function openTrackedCdpTransport(
  options: OpenTrackedCdpTransportOptions
): Promise<TrackedCdpTransport> {
  if (!/^ws:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/devtools\/browser\//u.test(options.endpointUrl)) {
    throw new Error('Tracked CDP endpoint must be a canonical loopback browser WebSocket.');
  }
  if (!Number.isSafeInteger(options.openTimeoutMs) || options.openTimeoutMs < 1) {
    throw new Error('Tracked CDP open timeout must be a positive safe integer.');
  }
  const socket = options.createSocket(options.endpointUrl);
  const transport = new TrackedCdpTransport(
    socket,
    options.identity,
    options.maxInboundMessageBytes,
    options.onProtocolFailure
  );
  await transport.waitUntilOpen(options.openTimeoutMs);
  return transport;
}
