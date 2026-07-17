import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { parseRestartReceiptV1 } from '../../mv3/harness/contracts';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const WORKER_URL = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/service-worker-loader.js';

interface RestartReceiptPreimage {
  schemaVersion: 1;
  processGeneration: number;
  rawLeaseEpoch: number;
  playwrightEpoch: number;
  restartGeneration: number;
  workerUrl: string;
  authoritySha256: string;
  bootstrapSha256: string;
}

interface TestRestartReceipt extends RestartReceiptPreimage {
  receiptSha256: string;
}

function canonicalRestartPreimage(value: RestartReceiptPreimage): string {
  return JSON.stringify({
    authoritySha256: value.authoritySha256,
    bootstrapSha256: value.bootstrapSha256,
    playwrightEpoch: value.playwrightEpoch,
    processGeneration: value.processGeneration,
    rawLeaseEpoch: value.rawLeaseEpoch,
    restartGeneration: value.restartGeneration,
    schemaVersion: value.schemaVersion,
    workerUrl: value.workerUrl,
  });
}

function buildReceipt(overrides: Partial<RestartReceiptPreimage> = {}): TestRestartReceipt {
  const preimage: RestartReceiptPreimage = {
    schemaVersion: 1,
    processGeneration: 7,
    rawLeaseEpoch: 11,
    playwrightEpoch: 12,
    restartGeneration: 1,
    workerUrl: WORKER_URL,
    authoritySha256: SHA_A,
    bootstrapSha256: SHA_B,
    ...overrides,
  };

  return {
    ...preimage,
    receiptSha256: createHash('sha256')
      .update(canonicalRestartPreimage(preimage), 'utf8')
      .digest('hex'),
  };
}

describe('RestartReceiptV1 contract', () => {
  it('parses an exact self-hashed receipt into a detached deeply frozen DTO', () => {
    const source = buildReceipt();

    const parsed = parseRestartReceiptV1(source);

    expect(parsed).toEqual(source);
    expect(parsed).not.toBe(source);
    expect(parsed.receiptSha256).toBe(
      createHash('sha256').update(canonicalRestartPreimage(source), 'utf8').digest('hex')
    );
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(() =>
      Object.defineProperty(parsed, 'workerUrl', {
        value: 'chrome-extension://mutated/service-worker-loader.js',
      })
    ).toThrow(TypeError);

    source.workerUrl = 'chrome-extension://source-mutated/service-worker-loader.js';
    expect(parsed.workerUrl).toBe(WORKER_URL);
  });

  it('rejects a field mutation that keeps the previous self-hash', () => {
    const receipt = buildReceipt();
    const mutated = {
      ...receipt,
      bootstrapSha256: 'c'.repeat(64),
    };

    expect(() => parseRestartReceiptV1(mutated)).toThrow();
  });

  it('rejects a self-consistent stale receipt against the current private receipt', () => {
    const stale = buildReceipt({
      rawLeaseEpoch: 9,
      playwrightEpoch: 10,
      restartGeneration: 0,
    });
    const current = buildReceipt();

    expect(() => parseRestartReceiptV1(stale, { expectedCurrentReceipt: current })).toThrow();
    expect(parseRestartReceiptV1(current, { expectedCurrentReceipt: current })).toEqual(current);
  });

  it('rejects extra fields, unsafe integers and non-lowercase hashes', () => {
    expect(() => parseRestartReceiptV1({ ...buildReceipt(), endpoint: 'private' })).toThrow();
    expect(() =>
      parseRestartReceiptV1(buildReceipt({ processGeneration: Number.MAX_SAFE_INTEGER + 1 }))
    ).toThrow();
    expect(() =>
      parseRestartReceiptV1(buildReceipt({ authoritySha256: SHA_A.toUpperCase() }))
    ).toThrow();
  });
});
