import { createHash } from 'node:crypto';

import {
  RawCdpClient,
  type RawCdpDiagnostic,
  type RawCdpRootSocket,
  type RawCdpSocketEvent,
} from './raw-cdp-client';

const CANONICAL_ENDPOINT =
  /^ws:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/devtools\/browser\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export type RootWebSocketLike = RawCdpRootSocket;

export interface BrowserVersionReceipt {
  readonly protocolVersion: '1.3';
  readonly product: 'Chrome/149.0.7827.55';
  readonly revision: '@3188f8a607ae7e067593be8aab7f02d2451fec07';
  readonly userAgent: string;
  readonly jsVersion: '14.9.207.21';
}

export interface RawCdpLease {
  readonly browserVersion: BrowserVersionReceipt;
  readonly browserVersionSha256: string;
  readonly client: RawCdpClient;
  readonly diagnostics: readonly RawCdpDiagnostic[];
}

export interface OpenRawCdpLeaseOptions {
  readonly childExited: Promise<unknown>;
  readonly createSocket?: (endpointUrl: string) => RootWebSocketLike;
  readonly endpointUrl: string;
  readonly leaseEpoch: number;
  readonly openTimeoutMs: number;
  readonly processGeneration: number;
  readonly transportId: string;
}

function assertIdentity(options: OpenRawCdpLeaseOptions): void {
  if (
    !Number.isSafeInteger(options.processGeneration) ||
    options.processGeneration < 1 ||
    !Number.isSafeInteger(options.leaseEpoch) ||
    options.leaseEpoch < 1 ||
    options.transportId.length === 0 ||
    /[\0\r\n]/u.test(options.transportId)
  ) {
    throw new Error('Raw CDP lease identity is invalid.');
  }
  if (!Number.isSafeInteger(options.openTimeoutMs) || options.openTimeoutMs < 1) {
    throw new Error('Raw CDP lease timeout must be a positive safe integer.');
  }
  if (!CANONICAL_ENDPOINT.test(options.endpointUrl)) {
    throw new Error('Raw CDP endpoint is not a canonical private loopback capability.');
  }
}

function createNativeSocket(endpointUrl: string): RootWebSocketLike {
  return new WebSocket(endpointUrl) as unknown as RootWebSocketLike;
}

async function waitUntilOpen(
  socket: RootWebSocketLike,
  childExited: Promise<unknown>,
  timeoutMs: number
): Promise<void> {
  if (socket.readyState === 1) {
    return;
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let openListener!: (event: RawCdpSocketEvent) => void;
  let errorListener!: (event: RawCdpSocketEvent) => void;
  const opened = new Promise<'open'>((resolve, reject) => {
    openListener = () => resolve('open');
    errorListener = () => reject(new Error('Raw CDP WebSocket connection failed.'));
    socket.addEventListener('open', openListener);
    socket.addEventListener('error', errorListener);
  });
  try {
    const outcome = await Promise.race([
      opened,
      childExited.then(
        () => 'child-exit' as const,
        () => 'child-exit' as const
      ),
      new Promise<'timeout'>((resolve) => {
        timeout = setTimeout(() => resolve('timeout'), timeoutMs);
      }),
    ]);
    if (outcome === 'child-exit') {
      socket.close();
      throw new Error('Owned Chromium exited before raw CDP lease admission.');
    }
    if (outcome === 'timeout') {
      socket.close();
      throw new Error('Timed out opening the raw CDP lease.');
    }
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    socket.removeEventListener('open', openListener);
    socket.removeEventListener('error', errorListener);
  }
}

function parseBrowserVersion(value: Readonly<Record<string, unknown>>): BrowserVersionReceipt {
  const keys = Object.keys(value).sort();
  const expectedKeys = ['jsVersion', 'product', 'protocolVersion', 'revision', 'userAgent'];
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index]) ||
    value.protocolVersion !== '1.3' ||
    value.product !== 'Chrome/149.0.7827.55' ||
    value.revision !== '@3188f8a607ae7e067593be8aab7f02d2451fec07' ||
    typeof value.userAgent !== 'string' ||
    value.userAgent.length === 0 ||
    /[\0\r\n]/u.test(value.userAgent) ||
    value.jsVersion !== '14.9.207.21'
  ) {
    throw new Error('Raw CDP Browser.getVersion drifted from the pinned runtime.');
  }
  return Object.freeze({
    protocolVersion: '1.3',
    product: 'Chrome/149.0.7827.55',
    revision: '@3188f8a607ae7e067593be8aab7f02d2451fec07',
    userAgent: value.userAgent,
    jsVersion: '14.9.207.21',
  });
}

async function waitForVersion(
  client: RawCdpClient,
  childExited: Promise<unknown>,
  timeoutMs: number
): Promise<BrowserVersionReceipt> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const outcome = await Promise.race([
      client.sendCommand({ method: 'Browser.getVersion', params: {} }).then(
        (receipt) => ({ kind: 'version' as const, receipt }),
        (error: unknown) => Promise.reject(error)
      ),
      childExited.then(
        () => ({ kind: 'child-exit' as const }),
        () => ({ kind: 'child-exit' as const })
      ),
      new Promise<{ readonly kind: 'timeout' }>((resolve) => {
        timeout = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs);
      }),
    ]);
    if (outcome.kind === 'child-exit') {
      throw new Error('Owned Chromium exited before raw CDP version admission.');
    }
    if (outcome.kind === 'timeout') {
      throw new Error('Timed out admitting the raw CDP browser version.');
    }
    return parseBrowserVersion(outcome.receipt.result);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

export async function openRawCdpLease(options: OpenRawCdpLeaseOptions): Promise<RawCdpLease> {
  assertIdentity(options);
  const socket = (options.createSocket ?? createNativeSocket)(options.endpointUrl);
  await waitUntilOpen(socket, options.childExited, options.openTimeoutMs);
  const diagnostics: RawCdpDiagnostic[] = [];
  const client = new RawCdpClient({
    socket,
    identity: {
      processGeneration: options.processGeneration,
      leaseEpoch: options.leaseEpoch,
      transportId: options.transportId,
    },
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
  });
  try {
    const browserVersion = await waitForVersion(client, options.childExited, options.openTimeoutMs);
    const browserVersionSha256 = createHash('sha256')
      .update(
        JSON.stringify({
          jsVersion: browserVersion.jsVersion,
          product: browserVersion.product,
          protocolVersion: browserVersion.protocolVersion,
          revision: browserVersion.revision,
          userAgent: browserVersion.userAgent,
        }),
        'utf8'
      )
      .digest('hex');
    return Object.freeze({
      browserVersion,
      browserVersionSha256,
      client,
      get diagnostics() {
        return Object.freeze([...diagnostics]);
      },
    });
  } catch (error) {
    client.close();
    await client.closed.catch(() => undefined);
    throw error;
  }
}
