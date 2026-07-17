import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute } from 'node:path';
import { performance } from 'node:perf_hooks';

export interface DevToolsEndpointIdentity {
  readonly browserPath: string;
  readonly endpointSha256: string;
  readonly port: number;
  readonly processGeneration: number;
  readonly profileRealPath: string;
  readonly webSocketUrl: string;
}

interface ParseDevToolsActivePortOptions {
  readonly processGeneration: number;
  readonly profileRealPath: string;
}

export type ReadDevToolsEndpointFileOptions = ParseDevToolsActivePortOptions;

export interface WaitForDevToolsEndpointOptions extends ReadDevToolsEndpointFileOptions {
  readonly childExited: Promise<unknown>;
  readonly endpointPath: string;
  readonly pollIntervalMs: number;
  readonly timeoutMs: number;
}

const browserPathPattern =
  /^\/devtools\/browser\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

class EndpointChangedDuringCaptureError extends Error {
  readonly code = 'DEVTOOLS_ENDPOINT_CHANGED';
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function assertOptions(options: ParseDevToolsActivePortOptions): void {
  if (!Number.isSafeInteger(options.processGeneration) || options.processGeneration < 0) {
    throw new Error('DevTools endpoint process generation must be a non-negative safe integer.');
  }
  if (
    !isAbsolute(options.profileRealPath) ||
    options.profileRealPath.length === 0 ||
    options.profileRealPath.includes('\u0000') ||
    options.profileRealPath.includes('\r') ||
    options.profileRealPath.includes('\n')
  ) {
    throw new Error('DevTools endpoint profile path must be absolute and control-free.');
  }
}

export function parseDevToolsActivePort(
  raw: string,
  options: ParseDevToolsActivePortOptions
): DevToolsEndpointIdentity {
  assertOptions(options);
  if (Buffer.byteLength(raw, 'utf8') > 512 || raw.includes('\r') || raw.includes('\u0000')) {
    throw new Error('DevToolsActivePort bytes are oversized or contain forbidden controls.');
  }

  const match = /^([1-9][0-9]{0,4})\n([^\n]+)\n?$/u.exec(raw);
  if (!match) {
    throw new Error('DevToolsActivePort must contain exactly two canonical LF-terminated lines.');
  }

  const portText = match[1]!;
  const browserPath = match[2]!;
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535 || String(port) !== portText) {
    throw new Error('DevToolsActivePort port is not canonical.');
  }
  if (!browserPathPattern.test(browserPath)) {
    throw new Error('DevToolsActivePort browser path is not canonical.');
  }

  const webSocketUrl = `ws://127.0.0.1:${port}${browserPath}`;
  const endpointSha256 = sha256(
    JSON.stringify({
      domain: 'missionpulse.mv3-devtools-endpoint.v1',
      processGeneration: options.processGeneration,
      profileRealPath: options.profileRealPath,
      port,
      browserPath,
    })
  );

  return Object.freeze({
    browserPath,
    endpointSha256,
    port,
    processGeneration: options.processGeneration,
    profileRealPath: options.profileRealPath,
    webSocketUrl,
  });
}

export async function readDevToolsEndpointFile(
  endpointPath: string,
  options: ReadDevToolsEndpointFileOptions
): Promise<DevToolsEndpointIdentity> {
  assertOptions(options);
  if (!isAbsolute(endpointPath) || basename(endpointPath) !== 'DevToolsActivePort') {
    throw new Error('DevToolsActivePort must use the exact absolute profile path.');
  }

  const parentRealPath = await realpath(dirname(endpointPath)).catch(() => undefined);
  if (parentRealPath !== options.profileRealPath) {
    throw new Error('DevToolsActivePort parent does not match the frozen real profile path.');
  }

  let handle;
  try {
    handle = await open(endpointPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    throw new Error('DevToolsActivePort is not a regular no-follow file.', { cause: error });
  }

  try {
    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw new Error('DevToolsActivePort is not a regular no-follow file.');
    }
    if (stat.size > 512) {
      throw new Error('DevToolsActivePort exceeds 512 bytes.');
    }
    const raw = await handle.readFile({ encoding: 'utf8' });
    if (Buffer.byteLength(raw, 'utf8') !== stat.size) {
      throw new EndpointChangedDuringCaptureError(
        'DevToolsActivePort changed while it was being captured.'
      );
    }
    return parseDevToolsActivePort(raw, options);
  } finally {
    await handle.close();
  }
}

function errorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    if ('code' in current && typeof current.code === 'string') {
      return current.code;
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return undefined;
}

function wait(delayMs: number): Promise<{ readonly kind: 'poll' }> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(Object.freeze({ kind: 'poll' as const })), delayMs)
  );
}

export async function waitForDevToolsEndpoint(
  options: WaitForDevToolsEndpointOptions
): Promise<DevToolsEndpointIdentity> {
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1) {
    throw new Error('DevTools endpoint timeout must be a positive safe integer.');
  }
  if (!Number.isSafeInteger(options.pollIntervalMs) || options.pollIntervalMs < 1) {
    throw new Error('DevTools endpoint poll interval must be a positive safe integer.');
  }

  const deadline = performance.now() + options.timeoutMs;
  const childExit = options.childExited.then(
    () => Object.freeze({ kind: 'child-exit' as const }),
    () => Object.freeze({ kind: 'child-exit' as const })
  );

  while (performance.now() < deadline) {
    const read = readDevToolsEndpointFile(options.endpointPath, options).then(
      (endpoint) => Object.freeze({ endpoint, kind: 'endpoint' as const }),
      (error: unknown) => Object.freeze({ error, kind: 'read-error' as const })
    );
    const outcome = await Promise.race([read, childExit]);
    if (outcome.kind === 'child-exit') {
      throw new Error('Owned Chromium exited before DevTools endpoint admission.');
    }
    if (outcome.kind === 'endpoint') {
      return outcome.endpoint;
    }
    const code = errorCode(outcome.error);
    if (code !== 'ENOENT' && code !== 'DEVTOOLS_ENDPOINT_CHANGED') {
      throw outcome.error;
    }

    const remaining = deadline - performance.now();
    if (remaining <= 0) {
      break;
    }
    const pause = await Promise.race([
      wait(Math.min(options.pollIntervalMs, Math.ceil(remaining))),
      childExit,
    ]);
    if (pause.kind === 'child-exit') {
      throw new Error('Owned Chromium exited before DevTools endpoint admission.');
    }
  }
  throw new Error('Timed out waiting for DevTools endpoint admission.');
}
