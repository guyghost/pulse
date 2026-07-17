import { sha256Hex } from './contracts';
import type { EvidenceIdentity } from './workflow-machine';

export const CAPTURE_SNAPSHOT_SCHEMA = 'missionpulse.connector-health-capture-snapshot';
export const CAPTURE_SNAPSHOT_VERSION = 1;
export const MAX_CAPTURE_SNAPSHOT_BYTES = 65_536;

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string
): void {
  const observed = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (observed.length !== wanted.length || observed.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has an unexpected shape.`);
  }
}

export function encodeConnectorHealthCaptureSnapshot(snapshot: unknown): Buffer {
  const bytes = Buffer.from(
    JSON.stringify({
      schema: CAPTURE_SNAPSHOT_SCHEMA,
      version: CAPTURE_SNAPSHOT_VERSION,
      snapshot,
    }),
    'utf8'
  );
  if (bytes.byteLength <= 0 || bytes.byteLength > MAX_CAPTURE_SNAPSHOT_BYTES) {
    throw new Error('Connector health capture snapshot is outside its byte bound.');
  }
  return bytes;
}

export function decodeConnectorHealthCaptureSnapshot(input: {
  bytes: Uint8Array;
  expectedSha256: string;
  expectedEvidence: Readonly<EvidenceIdentity>;
}): unknown {
  if (
    input.bytes.byteLength <= 0 ||
    input.bytes.byteLength > MAX_CAPTURE_SNAPSHOT_BYTES ||
    !/^[0-9a-f]{64}$/.test(input.expectedSha256)
  ) {
    throw new Error('Connector health capture snapshot size or digest is malformed.');
  }
  if (sha256Hex(input.bytes) !== input.expectedSha256) {
    throw new Error('Connector health capture snapshot digest mismatch.');
  }
  let text: string;
  let decoded: unknown;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(input.bytes);
    decoded = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error('Connector health capture snapshot JSON is malformed.', { cause: error });
  }
  const envelope = record(decoded, 'Connector health capture snapshot envelope');
  exactKeys(envelope, ['schema', 'version', 'snapshot'], 'Capture snapshot envelope');
  if (
    envelope.schema !== CAPTURE_SNAPSHOT_SCHEMA ||
    envelope.version !== CAPTURE_SNAPSHOT_VERSION ||
    JSON.stringify(envelope) !== text
  ) {
    throw new Error('Connector health capture snapshot envelope is non-canonical or unsupported.');
  }
  const snapshot = record(envelope.snapshot, 'Connector health persisted XState snapshot');
  const context = record(snapshot.context, 'Connector health capture snapshot context');
  exactKeys(context, ['evidence', 'artifact', 'terminal'], 'Capture snapshot context');
  const evidence = record(context.evidence, 'Connector health capture snapshot evidence');
  exactKeys(
    evidence,
    ['disposition', 'failureFingerprint', 'evidenceFileSha256'],
    'Capture snapshot evidence'
  );
  const children = record(snapshot.children, 'Connector health capture snapshot children');
  if (
    snapshot.status !== 'active' ||
    snapshot.value !== 'evidence_validated' ||
    Object.keys(children).length !== 0 ||
    context.artifact !== null ||
    context.terminal !== null ||
    evidence.disposition !== input.expectedEvidence.disposition ||
    evidence.failureFingerprint !== input.expectedEvidence.failureFingerprint ||
    evidence.evidenceFileSha256 !== input.expectedEvidence.evidenceFileSha256
  ) {
    throw new Error('Connector health capture snapshot evidence identity or state drifted.');
  }
  return snapshot;
}
