import { createHash } from 'node:crypto';

const RESTART_RECEIPT_KEYS = [
  'schemaVersion',
  'processGeneration',
  'rawLeaseEpoch',
  'playwrightEpoch',
  'restartGeneration',
  'workerUrl',
  'authoritySha256',
  'bootstrapSha256',
  'receiptSha256',
] as const;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_CANONICAL_URL_BYTES = 4_096;

export interface RestartReceiptV1 {
  readonly schemaVersion: 1;
  readonly processGeneration: number;
  readonly rawLeaseEpoch: number;
  readonly playwrightEpoch: number;
  readonly restartGeneration: number;
  readonly workerUrl: string;
  readonly authoritySha256: string;
  readonly bootstrapSha256: string;
  readonly receiptSha256: string;
}

export interface ParseRestartReceiptV1Options {
  readonly expectedCurrentReceipt?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSafeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${field} must be a non-negative safe integer.`);
  }
  return value as number;
}

function parseSha256(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new TypeError(`${field} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function parseWorkerUrl(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    /[\0\r\n]/u.test(value) ||
    new TextEncoder().encode(value).byteLength > MAX_CANONICAL_URL_BYTES
  ) {
    throw new TypeError('workerUrl must be a bounded canonical URL string.');
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError('workerUrl must be an absolute URL.');
  }
  if (parsed.protocol !== 'chrome-extension:' || parsed.href !== value) {
    throw new TypeError('workerUrl must be an exact canonical chrome-extension URL.');
  }
  return value;
}

function canonicalRestartPreimage(receipt: Omit<RestartReceiptV1, 'receiptSha256'>): string {
  return JSON.stringify({
    authoritySha256: receipt.authoritySha256,
    bootstrapSha256: receipt.bootstrapSha256,
    playwrightEpoch: receipt.playwrightEpoch,
    processGeneration: receipt.processGeneration,
    rawLeaseEpoch: receipt.rawLeaseEpoch,
    restartGeneration: receipt.restartGeneration,
    schemaVersion: receipt.schemaVersion,
    workerUrl: receipt.workerUrl,
  });
}

function receiptDigest(receipt: Omit<RestartReceiptV1, 'receiptSha256'>): string {
  return createHash('sha256').update(canonicalRestartPreimage(receipt), 'utf8').digest('hex');
}

function normalizeRestartReceiptV1(value: unknown): RestartReceiptV1 {
  if (!isRecord(value)) {
    throw new TypeError('RestartReceiptV1 must be an object.');
  }
  const keys = Object.keys(value).sort();
  const expectedKeys = [...RESTART_RECEIPT_KEYS].sort();
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new TypeError('RestartReceiptV1 contains missing or additional fields.');
  }
  if (value.schemaVersion !== 1) {
    throw new TypeError('RestartReceiptV1.schemaVersion must equal 1.');
  }

  const preimage = {
    schemaVersion: 1 as const,
    processGeneration: parseSafeInteger(value.processGeneration, 'processGeneration'),
    rawLeaseEpoch: parseSafeInteger(value.rawLeaseEpoch, 'rawLeaseEpoch'),
    playwrightEpoch: parseSafeInteger(value.playwrightEpoch, 'playwrightEpoch'),
    restartGeneration: parseSafeInteger(value.restartGeneration, 'restartGeneration'),
    workerUrl: parseWorkerUrl(value.workerUrl),
    authoritySha256: parseSha256(value.authoritySha256, 'authoritySha256'),
    bootstrapSha256: parseSha256(value.bootstrapSha256, 'bootstrapSha256'),
  };
  const parsed: RestartReceiptV1 = {
    ...preimage,
    receiptSha256: parseSha256(value.receiptSha256, 'receiptSha256'),
  };
  if (receiptDigest(preimage) !== parsed.receiptSha256) {
    throw new TypeError('RestartReceiptV1 self-hash mismatch.');
  }
  return Object.freeze(parsed);
}

function receiptsEqual(left: RestartReceiptV1, right: RestartReceiptV1): boolean {
  return RESTART_RECEIPT_KEYS.every((key) => left[key] === right[key]);
}

export function parseRestartReceiptV1(
  value: unknown,
  options: ParseRestartReceiptV1Options = {}
): RestartReceiptV1 {
  const parsed = normalizeRestartReceiptV1(value);
  if (options.expectedCurrentReceipt !== undefined) {
    const current = normalizeRestartReceiptV1(options.expectedCurrentReceipt);
    if (!receiptsEqual(parsed, current)) {
      throw new TypeError('RestartReceiptV1 is stale or does not match current authority.');
    }
  }
  return parsed;
}
