import { sha256Jcs } from './playwright-authority';
import type { RawReleaseCommandLedgerEntry } from './raw-worker-owner';

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const BOOTSTRAP_PROOF_KEYS = [
  'schemaVersion',
  'processGeneration',
  'leaseEpoch',
  'transportId',
  'receiptSha256',
  'operationalCommandCount',
  'operationalLedgerSha256',
] as const;
const BOOTSTRAP_ACK_KEYS = [...BOOTSTRAP_PROOF_KEYS, 'retained'] as const;

export interface RawOperationalLedgerAuthorityV1 {
  readonly schemaVersion: 1;
  readonly processGeneration: number;
  readonly leaseEpoch: number;
  readonly transportId: string;
  readonly operationalCommandCount: number;
  readonly operationalLedgerSha256: string;
}

export interface RawBootstrapProvedV1 extends RawOperationalLedgerAuthorityV1 {
  readonly receiptSha256: string;
}

export interface RawBootstrapRetentionAckV1 extends RawBootstrapProvedV1 {
  readonly retained: true;
}

interface RawOperationalLedgerSource {
  readonly processGeneration: number;
  readonly leaseEpoch: number;
  readonly transportId: string;
  readonly commandLedger: readonly RawReleaseCommandLedgerEntry[];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[]
): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isCanonicalSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256_PATTERN.test(value);
}

export function createRawOperationalLedgerAuthorityV1(
  source: RawOperationalLedgerSource
): RawOperationalLedgerAuthorityV1 {
  const operationalCommands = source.commandLedger.filter((entry) => entry.kind === 'operational');
  const preimage = {
    schemaVersion: 1 as const,
    processGeneration: source.processGeneration,
    leaseEpoch: source.leaseEpoch,
    transportId: source.transportId,
    operationalCommandCount: operationalCommands.length,
    operationalCommands,
  };
  return Object.freeze({
    schemaVersion: 1,
    processGeneration: source.processGeneration,
    leaseEpoch: source.leaseEpoch,
    transportId: source.transportId,
    operationalCommandCount: operationalCommands.length,
    operationalLedgerSha256: sha256Jcs(preimage),
  });
}

export function createRawBootstrapProvedV1(
  authority: RawOperationalLedgerAuthorityV1,
  receiptSha256: string
): RawBootstrapProvedV1 {
  if (
    authority.operationalCommandCount < 1 ||
    !isCanonicalSha256(authority.operationalLedgerSha256) ||
    !isCanonicalSha256(receiptSha256)
  ) {
    throw new Error('Raw bootstrap proof source is invalid.');
  }
  return Object.freeze({
    schemaVersion: 1,
    processGeneration: authority.processGeneration,
    leaseEpoch: authority.leaseEpoch,
    transportId: authority.transportId,
    receiptSha256,
    operationalCommandCount: authority.operationalCommandCount,
    operationalLedgerSha256: authority.operationalLedgerSha256,
  });
}

export function parseRawBootstrapProvedV1(value: unknown): RawBootstrapProvedV1 | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, BOOTSTRAP_PROOF_KEYS) ||
    value.schemaVersion !== 1 ||
    !isPositiveSafeInteger(value.processGeneration) ||
    !isPositiveSafeInteger(value.leaseEpoch) ||
    typeof value.transportId !== 'string' ||
    value.transportId.length === 0 ||
    !isCanonicalSha256(value.receiptSha256) ||
    !isPositiveSafeInteger(value.operationalCommandCount) ||
    !isCanonicalSha256(value.operationalLedgerSha256)
  ) {
    return null;
  }
  return Object.freeze({
    schemaVersion: 1,
    processGeneration: value.processGeneration,
    leaseEpoch: value.leaseEpoch,
    transportId: value.transportId,
    receiptSha256: value.receiptSha256,
    operationalCommandCount: value.operationalCommandCount,
    operationalLedgerSha256: value.operationalLedgerSha256,
  });
}

export function createRawBootstrapRetentionAckV1(
  proof: RawBootstrapProvedV1
): RawBootstrapRetentionAckV1 {
  return Object.freeze({ ...proof, retained: true });
}

export function isRawBootstrapRetentionAckV1(
  value: unknown,
  expectedProof: RawBootstrapProvedV1
): value is RawBootstrapRetentionAckV1 {
  if (!isRecord(value) || !hasExactKeys(value, BOOTSTRAP_ACK_KEYS) || value.retained !== true) {
    return false;
  }
  const proof = parseRawBootstrapProvedV1({
    schemaVersion: value.schemaVersion,
    processGeneration: value.processGeneration,
    leaseEpoch: value.leaseEpoch,
    transportId: value.transportId,
    receiptSha256: value.receiptSha256,
    operationalCommandCount: value.operationalCommandCount,
    operationalLedgerSha256: value.operationalLedgerSha256,
  });
  return proof !== null && sha256Jcs(proof) === sha256Jcs(expectedProof);
}
