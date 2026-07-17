export const MAX_CDP_MESSAGE_BYTES = 1_048_576;
export const MAX_CDP_OPERATIONAL_COMMANDS = 224;
export const MAX_CDP_CLEANUP_COMMANDS = 32;

const MAX_CDP_EVENT_LISTENERS = 64;
const OPEN_SOCKET_STATE = 1;
const UTF8_ENCODER = new TextEncoder();

export interface RawCdpSocketEvent {
  readonly data?: unknown;
  readonly code?: number;
  readonly reason?: string;
}

export interface RawCdpRootSocket {
  readonly readyState: number;
  addEventListener(type: string, listener: (event: RawCdpSocketEvent) => void): void;
  removeEventListener(type: string, listener: (event: RawCdpSocketEvent) => void): void;
  send(data: string): void;
  close(): void;
}

export interface RawCdpIdentity {
  readonly leaseEpoch: number;
  readonly processGeneration: number;
  readonly transportId: string;
}

export type RawCdpDiagnosticKind =
  'unknown-response' | 'stale-response' | 'response-session-mismatch' | 'protocol-failure';

export interface RawCdpDiagnostic extends RawCdpIdentity {
  readonly schemaVersion: 1;
  readonly kind: RawCdpDiagnosticKind;
  readonly message: string;
  readonly responseId?: number;
}

export interface RawCdpEvent {
  readonly method: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly sessionId?: string;
}

export interface RawCdpCommand {
  readonly method: string;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly sessionId?: string;
}

export interface RawCdpCommandReceipt extends RawCdpIdentity {
  readonly schemaVersion: 1;
  readonly id: number;
  readonly method: string;
  readonly result: Readonly<Record<string, unknown>>;
  readonly sessionId?: string;
}

export interface RawCdpSentCommand extends RawCdpCommand {
  readonly id: number;
}

export class RawCdpBatchSendError extends Error {
  readonly schemaVersion = 1 as const;
  readonly processGeneration: number;
  readonly leaseEpoch: number;
  readonly transportId: string;
  readonly sentPrefix: readonly RawCdpSentCommand[];
  override readonly cause: unknown;

  constructor(cause: unknown, identity: RawCdpIdentity, sentPrefix: readonly RawCdpSentCommand[]) {
    const normalizedCause = toError(cause, 'Raw CDP operational command batch send failed.');
    super(normalizedCause.message);
    this.name = 'RawCdpBatchSendError';
    this.cause = cause;
    this.processGeneration = identity.processGeneration;
    this.leaseEpoch = identity.leaseEpoch;
    this.transportId = identity.transportId;
    this.sentPrefix = Object.freeze([...sentPrefix]);
    Object.freeze(this);
  }
}

export interface RawCdpCloseReceipt extends RawCdpIdentity {
  readonly code: number;
  readonly reason: string;
  readonly schemaVersion: 1;
}

export interface RawCdpClientOptions {
  readonly identity: RawCdpIdentity;
  readonly onDiagnostic?: (diagnostic: RawCdpDiagnostic) => void;
  readonly socket: RawCdpRootSocket;
}

export interface RawCdpCommandRange {
  readonly firstCommandId: number;
  readonly lastCommandId: number;
  readonly nextCommandId: number;
}

type CommandKind = 'cleanup' | 'operational';
type EventListener = (event: RawCdpEvent) => void | Promise<void>;

interface NormalizedCommand {
  readonly method: string;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly sessionId?: string;
}

interface PendingCommand {
  readonly id: number;
  readonly kind: CommandKind;
  readonly method: string;
  readonly reject: (error: Error) => void;
  readonly resolve: (receipt: RawCdpCommandReceipt) => void;
  readonly sessionId?: string;
}

interface ParsedSuccessResponse {
  readonly id: number;
  readonly kind: 'success-response';
  readonly result: Readonly<Record<string, unknown>>;
  readonly sessionId?: string;
}

interface ParsedErrorResponse {
  readonly error: Readonly<Record<string, unknown>> & {
    readonly code: number;
    readonly message: string;
  };
  readonly id: number;
  readonly kind: 'error-response';
  readonly sessionId?: string;
}

interface ParsedEvent {
  readonly event: RawCdpEvent;
  readonly kind: 'event';
}

type ParsedInboundMessage = ParsedErrorResponse | ParsedEvent | ParsedSuccessResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(record: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function assertOnlyKeys(
  record: Readonly<Record<string, unknown>>,
  allowedKeys: ReadonlySet<string>,
  context: string
): void {
  const unknownKey = Object.keys(record).find((key) => !allowedKeys.has(key));
  if (unknownKey !== undefined) {
    throw new Error(`${context} contains the unknown field ${unknownKey}.`);
  }
}

function utf8ByteLength(value: string): number {
  return UTF8_ENCODER.encode(value).byteLength;
}

function toError(value: unknown, fallback: string): Error {
  return value instanceof Error ? value : new Error(fallback);
}

function freezeSentCommand(serialized: string): RawCdpSentCommand {
  const parsed = JSON.parse(serialized) as RawCdpSentCommand;
  if (parsed.params !== undefined) {
    Object.freeze(parsed.params);
  }
  return Object.freeze(parsed);
}

function isValidProtocolString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('\0') &&
    !value.includes('\r') &&
    !value.includes('\n')
  );
}

function assertIdentity(identity: RawCdpIdentity): void {
  if (
    !Number.isSafeInteger(identity.processGeneration) ||
    identity.processGeneration < 0 ||
    !Number.isSafeInteger(identity.leaseEpoch) ||
    identity.leaseEpoch < 0 ||
    !isValidProtocolString(identity.transportId)
  ) {
    throw new Error('Raw CDP identity is invalid.');
  }
}

export function reserveRawCdpCommandRange(
  firstCommandId: number,
  commandCount: number
): RawCdpCommandRange {
  if (
    !Number.isSafeInteger(firstCommandId) ||
    firstCommandId < 1 ||
    !Number.isSafeInteger(commandCount) ||
    commandCount < 1
  ) {
    throw new Error('Raw CDP command ID range inputs are invalid.');
  }
  const lastCommandId = firstCommandId + commandCount - 1;
  const nextCommandId = lastCommandId + 1;
  if (!Number.isSafeInteger(lastCommandId) || !Number.isSafeInteger(nextCommandId)) {
    throw new Error('Raw CDP command ID range exceeds safe integers.');
  }
  return Object.freeze({ firstCommandId, lastCommandId, nextCommandId });
}

function parseOptionalSessionId(record: Readonly<Record<string, unknown>>): string | undefined {
  if (!hasOwn(record, 'sessionId') || record.sessionId === undefined) {
    return undefined;
  }
  if (!isValidProtocolString(record.sessionId)) {
    throw new Error('Raw CDP sessionId must be a non-empty string without control characters.');
  }
  return record.sessionId;
}

function normalizeCommand(value: unknown): NormalizedCommand {
  if (!isRecord(value)) {
    throw new Error('Raw CDP command must be an object.');
  }
  assertOnlyKeys(value, new Set(['method', 'params', 'sessionId']), 'Raw CDP command');
  if (!isValidProtocolString(value.method)) {
    throw new Error(
      'Raw CDP command method must be a non-empty string without control characters.'
    );
  }
  let params: Readonly<Record<string, unknown>> | undefined;
  if (hasOwn(value, 'params') && value.params !== undefined) {
    if (!isRecord(value.params)) {
      throw new Error('Raw CDP command params must be an object.');
    }
    params = value.params;
  }

  const sessionId = parseOptionalSessionId(value);
  return {
    method: value.method,
    ...(params === undefined ? {} : { params }),
    ...(sessionId === undefined ? {} : { sessionId }),
  };
}

function parseInboundMessage(data: unknown): ParsedInboundMessage {
  if (typeof data !== 'string') {
    throw new Error('Raw CDP inbound message must be text.');
  }
  if (utf8ByteLength(data) > MAX_CDP_MESSAGE_BYTES) {
    throw new Error('Raw CDP inbound message exceeds its byte limit.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new Error('Raw CDP inbound message is not valid JSON.');
  }
  if (!isRecord(parsed)) {
    throw new Error('Raw CDP inbound message must be an object.');
  }

  const hasId = hasOwn(parsed, 'id');
  const hasMethod = hasOwn(parsed, 'method');
  if (hasId === hasMethod) {
    throw new Error('Raw CDP inbound message must be exactly one response or event.');
  }
  return hasId ? parseResponse(parsed) : parseEvent(parsed);
}

function parseResponse(record: Readonly<Record<string, unknown>>): ParsedInboundMessage {
  assertOnlyKeys(record, new Set(['id', 'result', 'error', 'sessionId']), 'Raw CDP response');
  if (!Number.isSafeInteger(record.id) || (record.id as number) < 1) {
    throw new Error('Raw CDP response id must be a positive safe integer.');
  }
  const id = record.id as number;
  const hasResult = hasOwn(record, 'result');
  const hasError = hasOwn(record, 'error');
  if (hasResult === hasError) {
    throw new Error('Raw CDP response must contain exactly one result or error object.');
  }
  const sessionId = parseOptionalSessionId(record);

  if (hasResult) {
    if (!isRecord(record.result)) {
      throw new Error('Raw CDP response result must be an object.');
    }
    return {
      id,
      kind: 'success-response',
      result: record.result,
      ...(sessionId === undefined ? {} : { sessionId }),
    };
  }

  if (
    !isRecord(record.error) ||
    !Number.isSafeInteger(record.error.code) ||
    typeof record.error.message !== 'string'
  ) {
    throw new Error('Raw CDP response error must contain an integer code and string message.');
  }
  return {
    error: record.error as ParsedErrorResponse['error'],
    id,
    kind: 'error-response',
    ...(sessionId === undefined ? {} : { sessionId }),
  };
}

function parseEvent(record: Readonly<Record<string, unknown>>): ParsedEvent {
  assertOnlyKeys(record, new Set(['method', 'params', 'sessionId']), 'Raw CDP event');
  if (!isValidProtocolString(record.method)) {
    throw new Error('Raw CDP event method must be a non-empty string without control characters.');
  }
  let params: Readonly<Record<string, unknown>> = {};
  if (hasOwn(record, 'params') && record.params !== undefined) {
    if (!isRecord(record.params)) {
      throw new Error('Raw CDP event params must be an object.');
    }
    params = record.params;
  }
  const sessionId = parseOptionalSessionId(record);
  return {
    event: Object.freeze({
      method: record.method,
      params,
      ...(sessionId === undefined ? {} : { sessionId }),
    }),
    kind: 'event',
  };
}

export class RawCdpClient {
  readonly closed: Promise<RawCdpCloseReceipt>;

  readonly #eventListeners = new Set<EventListener>();
  readonly #identity: RawCdpIdentity;
  readonly #onDiagnostic?: (diagnostic: RawCdpDiagnostic) => void;
  readonly #pending = new Map<number, PendingCommand>();
  readonly #resolveClosed: (receipt: RawCdpCloseReceipt) => void;
  readonly #socket: RawCdpRootSocket;
  #cleanupPendingCount = 0;
  #closeRequested = false;
  #closeSettled = false;
  #inboundQueue = Promise.resolve();
  #nextCommandId = 1;
  #operationalPendingCount = 0;
  #remoteCloseExpected = false;

  readonly #handleError = (): void => {
    this.#failProtocol(new Error('Raw CDP root WebSocket reported an error.'));
  };

  readonly #handleMessage = (event: RawCdpSocketEvent): void => {
    if (this.#closeRequested || this.#closeSettled) {
      return;
    }
    this.#inboundQueue = this.#inboundQueue
      .then(() => this.#consumeInbound(event.data))
      .catch((error: unknown) => {
        this.#failProtocol(toError(error, 'Raw CDP inbound processing failed.'));
      });
  };

  readonly #handleClose = (event: RawCdpSocketEvent): void => {
    if (this.#closeSettled) {
      return;
    }
    const wasRequested = this.#closeRequested;
    this.#closeRequested = true;
    if (!wasRequested && !this.#remoteCloseExpected) {
      this.#emitDiagnostic('protocol-failure', 'Raw CDP root WebSocket closed unexpectedly.');
    }

    this.#closeSettled = true;
    this.#removeSocketListeners();
    this.#eventListeners.clear();
    const code = Number.isSafeInteger(event.code) ? (event.code as number) : 0;
    const reason = typeof event.reason === 'string' ? event.reason : '';
    const closeError = new Error(
      `Raw CDP transport ${this.#identity.transportId} closed (${code}: ${reason}).`
    );
    for (const pending of this.#pending.values()) {
      pending.reject(closeError);
    }
    this.#pending.clear();
    this.#operationalPendingCount = 0;
    this.#cleanupPendingCount = 0;

    this.#resolveClosed(
      Object.freeze({
        ...this.#identity,
        code,
        reason,
        schemaVersion: 1,
      })
    );
  };

  constructor({ identity, onDiagnostic, socket }: RawCdpClientOptions) {
    assertIdentity(identity);
    if (socket.readyState !== OPEN_SOCKET_STATE) {
      throw new Error('Raw CDP root WebSocket must already be open.');
    }
    this.#identity = Object.freeze({ ...identity });
    this.#onDiagnostic = onDiagnostic;
    this.#socket = socket;

    let resolveClosed!: (receipt: RawCdpCloseReceipt) => void;
    this.closed = new Promise<RawCdpCloseReceipt>((resolve) => {
      resolveClosed = resolve;
    });
    this.#resolveClosed = resolveClosed;

    socket.addEventListener('message', this.#handleMessage);
    socket.addEventListener('error', this.#handleError);
    socket.addEventListener('close', this.#handleClose);
  }

  sendCommand(command: RawCdpCommand): Promise<RawCdpCommandReceipt> {
    return this.#send('operational', command);
  }

  sendCommandBatch(commands: readonly RawCdpCommand[]): readonly Promise<RawCdpCommandReceipt>[] {
    if (!Array.isArray(commands) || commands.length === 0) {
      throw new Error('Raw CDP operational command batch must be a non-empty array.');
    }
    if (
      commands.length > MAX_CDP_OPERATIONAL_COMMANDS ||
      this.#operationalPendingCount + commands.length > MAX_CDP_OPERATIONAL_COMMANDS
    ) {
      throw new Error('Raw CDP operational command capacity exceeded.');
    }
    if (
      this.#closeRequested ||
      this.#closeSettled ||
      this.#socket.readyState !== OPEN_SOCKET_STATE
    ) {
      throw new Error(`Raw CDP transport ${this.#identity.transportId} is closed.`);
    }

    const normalized = commands.map((command) => normalizeCommand(command));
    const range = reserveRawCdpCommandRange(this.#nextCommandId, normalized.length);
    const prepared = normalized.map((command, index) => {
      const id = range.firstCommandId + index;
      const outbound = {
        id,
        method: command.method,
        ...(command.params === undefined ? {} : { params: command.params }),
        ...(command.sessionId === undefined ? {} : { sessionId: command.sessionId }),
      };
      let serialized: string;
      try {
        serialized = JSON.stringify(outbound);
      } catch {
        throw new Error('Raw CDP outbound command is not JSON serializable.');
      }
      if (utf8ByteLength(serialized) > MAX_CDP_MESSAGE_BYTES) {
        throw new Error('Raw CDP outbound command exceeds its byte limit.');
      }
      return { command, id, serialized };
    });

    const pendingBatch: PendingCommand[] = [];
    const promises = prepared.map(({ command, id }) => {
      let resolve!: (receipt: RawCdpCommandReceipt) => void;
      let reject!: (error: Error) => void;
      const promise = new Promise<RawCdpCommandReceipt>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      const pending: PendingCommand = {
        id,
        kind: 'operational',
        method: command.method,
        reject,
        resolve,
        ...(command.sessionId === undefined ? {} : { sessionId: command.sessionId }),
      };
      pendingBatch.push(pending);
      return promise;
    });

    this.#nextCommandId = range.nextCommandId;
    for (const pending of pendingBatch) {
      this.#pending.set(pending.id, pending);
      this.#incrementPending('operational');
    }

    let sentCount = 0;
    try {
      for (const { serialized } of prepared) {
        this.#socket.send(serialized);
        sentCount += 1;
      }
    } catch (error: unknown) {
      const failure = new RawCdpBatchSendError(
        error,
        this.#identity,
        prepared.slice(0, sentCount).map(({ serialized }) => freezeSentCommand(serialized))
      );
      for (const pending of pendingBatch) {
        this.#releasePending(pending);
        pending.reject(failure);
      }
    }
    return Object.freeze(promises);
  }

  sendCleanupCommand(command: RawCdpCommand): Promise<RawCdpCommandReceipt> {
    return this.#send('cleanup', command);
  }

  onEvent(listener: EventListener): () => void {
    if (this.#closeRequested || this.#closeSettled) {
      throw new Error(`Raw CDP transport ${this.#identity.transportId} is closed.`);
    }
    if (this.#eventListeners.size >= MAX_CDP_EVENT_LISTENERS) {
      throw new Error('Raw CDP event listener capacity exceeded.');
    }
    this.#eventListeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) {
        return;
      }
      subscribed = false;
      this.#eventListeners.delete(listener);
    };
  }

  close(): void {
    if (this.#closeRequested || this.#closeSettled) {
      return;
    }
    this.#closeRequested = true;
    this.#socket.close();
  }

  expectRemoteClose(): void {
    if (this.#closeRequested || this.#closeSettled) {
      throw new Error(`Raw CDP transport ${this.#identity.transportId} is closed.`);
    }
    this.#remoteCloseExpected = true;
  }

  #send(kind: CommandKind, value: unknown): Promise<RawCdpCommandReceipt> {
    try {
      if (
        this.#closeRequested ||
        this.#closeSettled ||
        this.#socket.readyState !== OPEN_SOCKET_STATE
      ) {
        throw new Error(`Raw CDP transport ${this.#identity.transportId} is closed.`);
      }
      if (kind === 'operational' && this.#operationalPendingCount >= MAX_CDP_OPERATIONAL_COMMANDS) {
        throw new Error('Raw CDP operational command capacity exceeded.');
      }
      if (kind === 'cleanup' && this.#cleanupPendingCount >= MAX_CDP_CLEANUP_COMMANDS) {
        throw new Error('Raw CDP cleanup command capacity exceeded.');
      }

      const command = normalizeCommand(value);
      const range = reserveRawCdpCommandRange(this.#nextCommandId, 1);
      const id = range.firstCommandId;
      const outbound = {
        id,
        method: command.method,
        ...(command.params === undefined ? {} : { params: command.params }),
        ...(command.sessionId === undefined ? {} : { sessionId: command.sessionId }),
      };
      let serialized: string;
      try {
        serialized = JSON.stringify(outbound);
      } catch {
        throw new Error('Raw CDP outbound command is not JSON serializable.');
      }
      if (utf8ByteLength(serialized) > MAX_CDP_MESSAGE_BYTES) {
        throw new Error('Raw CDP outbound command exceeds its byte limit.');
      }

      let resolve!: (receipt: RawCdpCommandReceipt) => void;
      let reject!: (error: Error) => void;
      const result = new Promise<RawCdpCommandReceipt>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      const pending: PendingCommand = {
        id,
        kind,
        method: command.method,
        reject,
        resolve,
        ...(command.sessionId === undefined ? {} : { sessionId: command.sessionId }),
      };
      this.#pending.set(id, pending);
      this.#incrementPending(kind);
      try {
        this.#socket.send(serialized);
        this.#nextCommandId = range.nextCommandId;
      } catch (error: unknown) {
        this.#releasePending(pending);
        reject(toError(error, 'Raw CDP root WebSocket send failed.'));
      }
      return result;
    } catch (error: unknown) {
      return Promise.reject(toError(error, 'Raw CDP command failed.'));
    }
  }

  async #consumeInbound(data: unknown): Promise<void> {
    if (this.#closeRequested || this.#closeSettled) {
      return;
    }
    const message = parseInboundMessage(data);
    if (message.kind === 'event') {
      for (const listener of [...this.#eventListeners]) {
        await listener(message.event);
      }
      return;
    }
    this.#settleResponse(message);
  }

  #settleResponse(response: ParsedErrorResponse | ParsedSuccessResponse): void {
    const pending = this.#pending.get(response.id);
    if (pending === undefined) {
      const kind = response.id < this.#nextCommandId ? 'stale-response' : 'unknown-response';
      this.#emitDiagnostic(
        kind,
        `Raw CDP ${kind === 'stale-response' ? 'stale' : 'unknown'} response id ${response.id}.`,
        response.id
      );
      return;
    }
    if (pending.sessionId !== response.sessionId) {
      this.#emitDiagnostic(
        'response-session-mismatch',
        `Raw CDP response id ${response.id} crossed its command session.`,
        response.id
      );
      return;
    }

    this.#releasePending(pending);
    if (response.kind === 'error-response') {
      pending.reject(
        new Error(
          `Raw CDP command ${pending.method} (${response.id}) failed: ${response.error.message} (${response.error.code}).`
        )
      );
      return;
    }
    pending.resolve(
      Object.freeze({
        ...this.#identity,
        schemaVersion: 1,
        id: response.id,
        method: pending.method,
        result: response.result,
        ...(pending.sessionId === undefined ? {} : { sessionId: pending.sessionId }),
      })
    );
  }

  #incrementPending(kind: CommandKind): void {
    if (kind === 'operational') {
      this.#operationalPendingCount += 1;
    } else {
      this.#cleanupPendingCount += 1;
    }
  }

  #releasePending(pending: PendingCommand): void {
    if (!this.#pending.delete(pending.id)) {
      return;
    }
    if (pending.kind === 'operational') {
      this.#operationalPendingCount -= 1;
    } else {
      this.#cleanupPendingCount -= 1;
    }
  }

  #emitDiagnostic(kind: RawCdpDiagnosticKind, message: string, responseId?: number): void {
    const diagnostic = Object.freeze({
      ...this.#identity,
      kind,
      message,
      ...(responseId === undefined ? {} : { responseId }),
      schemaVersion: 1 as const,
    });
    try {
      this.#onDiagnostic?.(diagnostic);
    } catch {
      // Diagnostics must never prevent protocol cleanup.
    }
  }

  #failProtocol(error: Error): void {
    if (this.#closeRequested || this.#closeSettled) {
      return;
    }
    this.#emitDiagnostic('protocol-failure', error.message);
    this.close();
  }

  #removeSocketListeners(): void {
    this.#socket.removeEventListener('message', this.#handleMessage);
    this.#socket.removeEventListener('error', this.#handleError);
    this.#socket.removeEventListener('close', this.#handleClose);
  }
}
