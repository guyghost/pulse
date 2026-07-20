import { sha256Jcs } from './canonical';

export interface ReleaseReadinessCommandDeliveryReceiptV1 {
  readonly schema: 'missionpulse.release-command-delivery';
  readonly version: 1;
  readonly deliveryId: string;
  readonly commandId: string;
  readonly actorId: string;
  readonly releaseId: string;
  readonly restartId: string;
  readonly durablyAcceptedAt: string;
  readonly receiptSha256: string;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function canonicalId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  );
}

function canonicalTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isSafeInteger(Date.parse(value)) &&
    new Date(Date.parse(value)).toISOString() === value
  );
}

export function computeReleaseCommandDeliveryReceiptSha256(
  receipt: Omit<ReleaseReadinessCommandDeliveryReceiptV1, 'receiptSha256'> & {
    readonly receiptSha256?: string;
  }
): string {
  const { receiptSha256: _digest, ...payload } = receipt;
  return sha256Jcs(payload);
}

export function parseReleaseCommandDeliveryReceipt(
  value: unknown
): ReleaseReadinessCommandDeliveryReceiptV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Release command delivery receipt must be an object.');
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join('\0') !==
      [
        'actorId',
        'commandId',
        'deliveryId',
        'durablyAcceptedAt',
        'receiptSha256',
        'releaseId',
        'restartId',
        'schema',
        'version',
      ]
        .sort()
        .join('\0') ||
    record.schema !== 'missionpulse.release-command-delivery' ||
    record.version !== 1 ||
    !canonicalId(record.deliveryId) ||
    !canonicalId(record.actorId) ||
    !canonicalId(record.releaseId) ||
    !canonicalId(record.restartId) ||
    typeof record.commandId !== 'string' ||
    record.commandId !== `scan:${record.actorId}:${record.restartId}` ||
    !canonicalTimestamp(record.durablyAcceptedAt) ||
    typeof record.receiptSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(record.receiptSha256) ||
    computeReleaseCommandDeliveryReceiptSha256(
      record as unknown as ReleaseReadinessCommandDeliveryReceiptV1
    ) !== record.receiptSha256
  ) {
    throw new Error('Release command delivery receipt is invalid.');
  }
  return clone(record as unknown as ReleaseReadinessCommandDeliveryReceiptV1);
}
