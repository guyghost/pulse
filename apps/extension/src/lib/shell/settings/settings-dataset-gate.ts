import { isUuidV4, readStrictJsonRecord } from '../../../models/settings-persistence.contract';
import type { DatasetEpochAuthority } from '../storage/dataset-epoch-authority';

export type SettingsDatasetGatePurpose =
  | 'pending_intent'
  | 'load'
  | 'reservation'
  | 'permission_check'
  | 'candidate_write'
  | 'recovery'
  | 'rebase'
  | 'abort'
  | 'reconcile'
  | 'system_alarm_repair';

export interface SettingsDatasetGateScope {
  dataEpoch: string;
  operationId: string;
  purpose: SettingsDatasetGatePurpose;
}

export interface SettingsDatasetGateCapabilityV1 {
  version: 1;
  kind: 'DATASET_EPOCH_SETTINGS_LEASE';
  dataEpoch: string;
  operationId: string;
  purpose: SettingsDatasetGatePurpose;
  leaseId: string;
  authorityRevision: number;
}

export interface SettingsAtomicCommitGatePort {
  runExclusive<T>(
    scope: SettingsDatasetGateScope,
    effect: (capability: SettingsDatasetGateCapabilityV1) => Promise<T>
  ): Promise<T>;
}

const PURPOSES = new Set<SettingsDatasetGatePurpose>([
  'pending_intent',
  'load',
  'reservation',
  'permission_check',
  'candidate_write',
  'recovery',
  'rebase',
  'abort',
  'reconcile',
  'system_alarm_repair',
]);

function parseScope(value: unknown): SettingsDatasetGateScope | null {
  const record = readStrictJsonRecord(value, ['dataEpoch', 'operationId', 'purpose']);
  return record !== null &&
    isUuidV4(record.dataEpoch) &&
    isUuidV4(record.operationId) &&
    typeof record.purpose === 'string' &&
    PURPOSES.has(record.purpose as SettingsDatasetGatePurpose)
    ? {
        dataEpoch: record.dataEpoch,
        operationId: record.operationId,
        purpose: record.purpose as SettingsDatasetGatePurpose,
      }
    : null;
}

export function createSettingsDatasetGate(
  authority: DatasetEpochAuthority
): SettingsAtomicCommitGatePort {
  return Object.freeze({
    runExclusive<T>(
      rawScope: SettingsDatasetGateScope,
      effect: (capability: SettingsDatasetGateCapabilityV1) => Promise<T>
    ): Promise<T> {
      const scope = parseScope(rawScope);
      if (scope === null || typeof effect !== 'function') {
        return Promise.reject(new Error('Invalid Settings DatasetEpoch gate request.'));
      }
      const lease = authority.issueLease({
        version: 2,
        operationId: scope.operationId,
        dataEpoch: scope.dataEpoch,
      });
      return authority.commit(lease, scope.operationId, () =>
        effect(
          Object.freeze({
            version: 1 as const,
            kind: 'DATASET_EPOCH_SETTINGS_LEASE' as const,
            dataEpoch: lease.dataEpoch,
            operationId: lease.operationId,
            purpose: scope.purpose,
            leaseId: lease.leaseId,
            authorityRevision: lease.authorityRevision,
          })
        )
      );
    },
  });
}
