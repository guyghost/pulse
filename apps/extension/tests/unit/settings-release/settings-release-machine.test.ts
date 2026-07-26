import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';

import { settingsReleaseMachine } from '../../../src/lib/shell/settings-release/settings-release.machine';

describe('settings release XState model', () => {
  it('does not admit a mutation before boot proofs complete', () => {
    const actor = createActor(settingsReleaseMachine).start();
    actor.send({ type: 'MUTATION_ADMITTED' });
    expect(actor.getSnapshot().value).toBe('booting');
    actor.send({ type: 'ENVELOPE_ABSENT' });
    expect(actor.getSnapshot().value).toBe('migrating');
    actor.send({ type: 'MIGRATION_PROVED' });
    expect(actor.getSnapshot().value).toBe('reconciling');
    actor.send({ type: 'ALARM_AND_STORAGE_PROVED' });
    expect(actor.getSnapshot().value).toBe('ready');
  });

  it('serializes reserve, prepare, effect proof, settlement and broadcast', () => {
    const actor = createActor(settingsReleaseMachine).start();
    actor.send({ type: 'CONFIRMED_FOUND' });
    actor.send({ type: 'ALARM_AND_STORAGE_PROVED' });
    actor.send({ type: 'MUTATION_ADMITTED' });
    actor.send({ type: 'IDENTITY_RESERVED' });
    actor.send({ type: 'PREPARE_PROVED' });
    actor.send({ type: 'EFFECT_AND_PERMISSION_PROVED' });
    actor.send({ type: 'COMMIT_PROVED' });
    expect(actor.getSnapshot().value).toBe('broadcasting');
    actor.send({ type: 'OUTBOX_ATTEMPT_PROVED_AND_CLEARED' });
    expect(actor.getSnapshot().value).toBe('reconciling');
  });

  it('reserves retry control while blocked', () => {
    const actor = createActor(settingsReleaseMachine).start();
    actor.send({ type: 'BOOT_PROOF_FAILED' });
    expect(actor.getSnapshot().value).toBe('blocked');
    actor.send({ type: 'EXPLICIT_RETRY_REQUESTED' });
    expect(actor.getSnapshot().value).toBe('booting');
  });

  it.each([
    {
      enter: [{ type: 'PENDING_FOUND' as const }],
      fail: { type: 'RECOVERY_AMBIGUOUS' as const },
    },
    {
      enter: [{ type: 'SCAN_ADMISSION_FOUND' as const }],
      fail: { type: 'SCAN_RECOVERY_UNKNOWN' as const },
    },
    {
      enter: [{ type: 'OLD_CATALOG_OUTBOX_OR_CONFIRMED_FOUND' as const }],
      fail: { type: 'CATALOG_MIGRATION_AMBIGUOUS' as const },
    },
    {
      enter: [{ type: 'CONFIRMED_FOUND' as const }, { type: 'ALARM_AND_STORAGE_PROVED' as const }],
      fail: { type: 'READY_PROOF_FAILED' as const },
    },
  ])('makes every runtime proof failure explicitly blocked and retryable', ({ enter, fail }) => {
    const actor = createActor(settingsReleaseMachine).start();
    for (const event of enter) {
      actor.send(event);
    }
    actor.send(fail);
    expect(actor.getSnapshot().value).toBe('blocked');
    actor.send({ type: 'EXPLICIT_RETRY_REQUESTED' });
    expect(actor.getSnapshot().value).toBe('booting');
  });
});
