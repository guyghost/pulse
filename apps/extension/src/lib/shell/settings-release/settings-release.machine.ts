import { setup } from 'xstate';

export type SettingsReleaseMachineEvent =
  | { type: 'ENVELOPE_ABSENT' }
  | { type: 'PENDING_FOUND' }
  | { type: 'SCAN_ADMISSION_FOUND' }
  | { type: 'OLD_CATALOG_SCAN_ADMISSION_FOUND' }
  | { type: 'OLD_CATALOG_OUTBOX_OR_CONFIRMED_FOUND' }
  | { type: 'OUTBOX_FOUND' }
  | { type: 'CONFIRMED_FOUND' }
  | { type: 'BOOT_PROOF_FAILED' }
  | { type: 'MIGRATION_PROVED' }
  | { type: 'MIGRATION_FAILED' }
  | { type: 'RECOVERY_SETTLED' }
  | { type: 'OLD_CATALOG_RECOVERY_SETTLED' }
  | { type: 'RECOVERY_AMBIGUOUS' }
  | { type: 'SCAN_RECOVERY_SETTLED' }
  | { type: 'SCAN_RECOVERY_UNKNOWN' }
  | { type: 'OLD_SCAN_RESULT_RETIRED_OR_NOT_FOUND' }
  | { type: 'OLD_SCAN_RESULT_UNKNOWN' }
  | { type: 'CURRENT_CATALOG_OUTBOX_PROVED' }
  | { type: 'CATALOG_MIGRATION_AMBIGUOUS' }
  | { type: 'ALARM_AND_STORAGE_PROVED' }
  | { type: 'ALARM_PROVED_WITH_OUTBOX' }
  | { type: 'RECONCILIATION_FAILED' }
  | { type: 'MUTATION_ADMITTED' }
  | { type: 'AUTO_SCAN_FIRED' }
  | { type: 'READ_REQUESTED' }
  | { type: 'DUPLICATE_REQUEST' }
  | { type: 'READY_PROOF_FAILED' }
  | { type: 'IDENTITY_RESERVED' }
  | { type: 'RESERVATION_NOT_COMMITTED' }
  | { type: 'RESERVATION_AMBIGUOUS' }
  | { type: 'IDENTITY_EXHAUSTED' }
  | { type: 'PREPARE_PROVED' }
  | { type: 'POST_RESERVATION_SETTLEMENT_PROVED' }
  | { type: 'PREPARE_AMBIGUOUS' }
  | { type: 'EFFECT_AND_PERMISSION_PROVED' }
  | { type: 'EFFECT_OR_PERMISSION_FAILED' }
  | { type: 'COMMIT_PROVED' }
  | { type: 'COMMIT_REJECTED_WITH_PENDING_READBACK' }
  | { type: 'COMMIT_AMBIGUOUS' }
  | { type: 'COMPENSATION_PROVED' }
  | { type: 'COMPENSATION_AMBIGUOUS' }
  | { type: 'OUTBOX_ATTEMPT_PROVED_AND_CLEARED' }
  | { type: 'OUTBOX_TRANSPORT_OR_CLEAR_AMBIGUOUS' }
  | { type: 'SCAN_ADMITTED' }
  | { type: 'SCAN_SKIPPED' }
  | { type: 'ALARM_REPAIRED' }
  | { type: 'SCAN_PROOF_AMBIGUOUS' }
  | { type: 'SCAN_ADMISSION_TIMEOUT' }
  | { type: 'EXPLICIT_RETRY_REQUESTED' };

export const settingsReleaseMachine = setup({
  types: { events: {} as SettingsReleaseMachineEvent },
}).createMachine({
  id: 'settings-release-compatibility',
  initial: 'booting',
  states: {
    booting: {
      on: {
        ENVELOPE_ABSENT: 'migrating',
        PENDING_FOUND: 'recovering',
        OLD_CATALOG_SCAN_ADMISSION_FOUND: 'retiringScanAdmission',
        SCAN_ADMISSION_FOUND: 'recoveringScan',
        OLD_CATALOG_OUTBOX_OR_CONFIRMED_FOUND: 'catalogMigrating',
        OUTBOX_FOUND: 'broadcasting',
        CONFIRMED_FOUND: 'reconciling',
        BOOT_PROOF_FAILED: 'blocked',
      },
    },
    migrating: {
      on: { MIGRATION_PROVED: 'reconciling', MIGRATION_FAILED: 'blocked' },
    },
    recovering: {
      on: {
        RECOVERY_SETTLED: 'broadcasting',
        OLD_CATALOG_RECOVERY_SETTLED: 'catalogMigrating',
        RECOVERY_AMBIGUOUS: 'blocked',
      },
    },
    recoveringScan: {
      on: { SCAN_RECOVERY_SETTLED: 'reconciling', SCAN_RECOVERY_UNKNOWN: 'blocked' },
    },
    retiringScanAdmission: {
      on: {
        OLD_SCAN_RESULT_RETIRED_OR_NOT_FOUND: 'catalogMigrating',
        OLD_SCAN_RESULT_UNKNOWN: 'blocked',
      },
    },
    catalogMigrating: {
      on: {
        CURRENT_CATALOG_OUTBOX_PROVED: 'reconciling',
        CATALOG_MIGRATION_AMBIGUOUS: 'blocked',
      },
    },
    reconciling: {
      on: {
        ALARM_AND_STORAGE_PROVED: 'ready',
        ALARM_PROVED_WITH_OUTBOX: 'broadcasting',
        RECONCILIATION_FAILED: 'blocked',
      },
    },
    ready: {
      on: {
        MUTATION_ADMITTED: 'reserving',
        AUTO_SCAN_FIRED: 'admittingScan',
        READ_REQUESTED: 'ready',
        DUPLICATE_REQUEST: 'ready',
        READY_PROOF_FAILED: 'blocked',
      },
    },
    reserving: {
      on: {
        IDENTITY_RESERVED: 'preparing',
        RESERVATION_NOT_COMMITTED: 'ready',
        RESERVATION_AMBIGUOUS: 'blocked',
        IDENTITY_EXHAUSTED: 'blocked',
      },
    },
    preparing: {
      on: {
        PREPARE_PROVED: 'applyingEffect',
        POST_RESERVATION_SETTLEMENT_PROVED: 'broadcasting',
        PREPARE_AMBIGUOUS: 'blocked',
      },
    },
    applyingEffect: {
      on: {
        EFFECT_AND_PERMISSION_PROVED: 'settling',
        EFFECT_OR_PERMISSION_FAILED: 'compensating',
      },
    },
    settling: {
      on: {
        COMMIT_PROVED: 'broadcasting',
        COMMIT_REJECTED_WITH_PENDING_READBACK: 'recovering',
        COMMIT_AMBIGUOUS: 'blocked',
      },
    },
    compensating: {
      on: { COMPENSATION_PROVED: 'broadcasting', COMPENSATION_AMBIGUOUS: 'blocked' },
    },
    broadcasting: {
      on: {
        OUTBOX_ATTEMPT_PROVED_AND_CLEARED: 'reconciling',
        OUTBOX_TRANSPORT_OR_CLEAR_AMBIGUOUS: 'blocked',
      },
    },
    admittingScan: {
      on: {
        SCAN_ADMITTED: 'ready',
        SCAN_SKIPPED: 'ready',
        ALARM_REPAIRED: 'ready',
        SCAN_PROOF_AMBIGUOUS: 'blocked',
        SCAN_ADMISSION_TIMEOUT: 'blocked',
      },
    },
    blocked: { on: { EXPLICIT_RETRY_REQUESTED: 'booting' } },
  },
});
