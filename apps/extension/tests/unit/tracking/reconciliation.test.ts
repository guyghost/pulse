import { describe, expect, it } from 'vitest';
import * as trackingCore from '../../../src/lib/core/tracking/index';

const DATA_EPOCH = '11111111-1111-4111-8111-111111111111';
const OTHER_EPOCH = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MUTATION_ID = '22222222-2222-4222-8222-222222222222';
const NEWER_MUTATION_ID = '33333333-3333-4333-8333-333333333333';
const WORKER_EPOCH = '44444444-4444-4444-8444-444444444444';
const OTHER_MUTATION_ID = '66666666-6666-4666-8666-666666666666';
const DIGEST = 'a'.repeat(64);

type Classify = (observation: unknown) => unknown;
type ValidateSettlement = (
  settlement: unknown,
  identity: unknown,
  actorCanonical: unknown
) => boolean;
type Preflight = (command: unknown, canonical: unknown) => unknown;

function publicFunction<T>(name: string): T | null {
  const candidate = (trackingCore as unknown as Record<string, unknown>)[name];
  expect(candidate, `${name} doit être exportée par l'entrée Core tracking`).toBeTypeOf('function');
  return typeof candidate === 'function' ? (candidate as T) : null;
}

function classify(observation: unknown): unknown {
  const fn = publicFunction<Classify>('classifyTrackingReconciliationV2');
  return fn ? fn(observation) : null;
}

function validateSettlement(
  settlement: unknown,
  identity: unknown,
  actorCanonical: unknown = null
): boolean {
  const fn = publicFunction<ValidateSettlement>('isValidTrackingSettlementV2');
  return fn ? fn(settlement, identity, actorCanonical) : false;
}

function preflight(command: unknown, canonical: unknown): unknown {
  const fn = publicFunction<Preflight>('preflightTrackingMutationV2');
  return fn ? fn(command, canonical) : null;
}

function tracking(status: string, missionId = 'mission-1'): Record<string, unknown> {
  const statuses = status === 'detected' ? ['detected'] : ['detected', 'selected'];
  return {
    missionId,
    currentStatus: status,
    history: statuses.map((to, index) => ({
      from: index === 0 ? null : statuses[index - 1],
      to,
      timestamp: (index + 1) * 1_000,
      note: null,
    })),
    generatedAssetIds: [],
    userRating: null,
    notes: '',
    nextActionAt: null,
  };
}

function envelope(
  revision: number,
  lastMutationId: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const previousTracking = tracking('detected');
  return {
    schemaVersion: 2,
    dataEpoch: DATA_EPOCH,
    missionId: 'mission-1',
    kind: 'record',
    tracking: tracking('selected'),
    revision,
    lastMutationId,
    lastMutationIntent: 'transition',
    committedAt: 5_000 + revision,
    undoBase: {
      previousTracking,
      expectedCurrentRevision: revision,
      expectedCurrentMutationId: lastMutationId,
    },
    ...overrides,
  };
}

function identity(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    dataEpoch: DATA_EPOCH,
    missionId: 'mission-1',
    mutationId: MUTATION_ID,
    intent: 'transition',
    commandDigest: DIGEST,
    ...overrides,
  };
}

function ledger(phase: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 2,
    dataEpoch: DATA_EPOCH,
    mutationId: MUTATION_ID,
    missionId: 'mission-1',
    intent: 'transition',
    commandDigest: DIGEST,
    phase,
    ownerWorkerEpoch: WORKER_EPOCH,
    baseRevision: 1,
    baseLastMutationId: NEWER_MUTATION_ID,
    committedRevision: phase === 'committed' ? 2 : null,
    failureCode: phase === 'failed' ? 'PERSIST_FAILED' : null,
    createdAt: 4_000,
    settledAt: phase === 'prepared' ? null : 5_000,
    ...overrides,
  };
}

function observation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    identity: identity(),
    ledger: ledger('committed'),
    canonical: envelope(2, MUTATION_ID),
    currentWorkerEpoch: WORKER_EPOCH,
    registeredActive: false,
    readFailure: null,
    ...overrides,
  };
}

function settlementFrom(decision: unknown): Record<string, unknown> | null {
  if (typeof decision !== 'object' || decision === null || !('settlement' in decision)) {
    return null;
  }
  const settlement = (decision as { settlement: unknown }).settlement;
  return typeof settlement === 'object' && settlement !== null
    ? (settlement as Record<string, unknown>)
    : null;
}

describe('tracking reconciliation v2', () => {
  it('classe committed_current avec l’Undo canonique exact', () => {
    const canonical = envelope(2, MUTATION_ID);
    const decision = classify(observation({ canonical }));

    expect(decision).toEqual({
      kind: 'settlement',
      settlement: {
        version: 2,
        ...identity(),
        deduplicated: true,
        outcome: 'committed_current',
        canonical,
        committedRevision: 2,
        undo: {
          version: 2,
          dataEpoch: DATA_EPOCH,
          missionId: 'mission-1',
          previousTracking: tracking('detected'),
          expectedCurrentRevision: 2,
          expectedCurrentMutationId: MUTATION_ID,
        },
        failure: null,
        broadcastRequired: false,
      },
    });
  });

  it('classe committed_superseded quand la canonique est strictement plus récente', () => {
    const canonical = envelope(3, NEWER_MUTATION_ID, { undoBase: null });

    expect(classify(observation({ canonical }))).toMatchObject({
      kind: 'settlement',
      settlement: {
        outcome: 'committed_superseded',
        canonical,
        committedRevision: 2,
        undo: null,
        failure: null,
        broadcastRequired: false,
      },
    });
  });

  it('classe un ledger failed en not_committed exact', () => {
    expect(
      classify(
        observation({
          ledger: ledger('failed'),
          canonical: envelope(1, NEWER_MUTATION_ID, { undoBase: null }),
        })
      )
    ).toMatchObject({
      kind: 'settlement',
      settlement: {
        outcome: 'not_committed',
        committedRevision: null,
        undo: null,
        failure: {
          version: 2,
          code: 'PERSIST_FAILED',
          intent: 'transition',
          message: 'Impossible d’enregistrer le nouveau statut.',
          recoverable: true,
        },
        broadcastRequired: false,
      },
    });
  });

  it.each(['prepared', 'failed', 'rejected', 'cancelled', 'worker_restarted'])(
    'classe %s + canonique portant le même ID en inconsistent',
    (phase) => {
      const phaseOverrides: Record<string, unknown> =
        phase === 'prepared'
          ? {}
          : {
              failureCode:
                phase === 'failed'
                  ? 'PERSIST_FAILED'
                  : phase === 'rejected'
                    ? 'APPLICATION_BUSY'
                    : phase === 'cancelled'
                      ? 'CANCELLED'
                      : 'WORKER_RESTARTED',
              settledAt: 5_000,
            };
      expect(
        classify(
          observation({
            ledger: ledger(phase, phaseOverrides),
            canonical: envelope(2, MUTATION_ID),
            currentWorkerEpoch:
              phase === 'prepared' ? '55555555-5555-4555-8555-555555555555' : WORKER_EPOCH,
          })
        )
      ).toMatchObject({
        kind: 'settlement',
        settlement: { outcome: 'inconsistent', failure: { code: 'PROTOCOL_ERROR' } },
      });
    }
  );

  it('rejette une canonique sous le token de base ou égale avec un autre lastMutationId', () => {
    const baseLedger = ledger('failed', {
      baseRevision: 2,
      baseLastMutationId: NEWER_MUTATION_ID,
    });

    expect(
      classify(
        observation({
          ledger: baseLedger,
          canonical: envelope(1, NEWER_MUTATION_ID, { undoBase: null }),
        })
      )
    ).toMatchObject({
      settlement: { outcome: 'inconsistent', failure: { code: 'PROTOCOL_ERROR' } },
    });
    expect(
      classify(
        observation({
          ledger: baseLedger,
          canonical: envelope(2, OTHER_MUTATION_ID, { undoBase: null }),
        })
      )
    ).toMatchObject({
      settlement: { outcome: 'inconsistent', failure: { code: 'PROTOCOL_ERROR' } },
    });
  });

  it('refuse committed_superseded lorsque la canonique plus récente répète le même ID', () => {
    expect(
      classify(
        observation({
          canonical: envelope(3, MUTATION_ID, {
            undoBase: {
              previousTracking: tracking('selected'),
              expectedCurrentRevision: 3,
              expectedCurrentMutationId: MUTATION_ID,
            },
          }),
        })
      )
    ).toMatchObject({
      settlement: { outcome: 'inconsistent', failure: { code: 'PROTOCOL_ERROR' } },
    });
  });

  it('classe un conflit à révision égale en inconsistent/PROTOCOL_ERROR', () => {
    const canonical = envelope(2, NEWER_MUTATION_ID, { undoBase: null });

    expect(classify(observation({ canonical }))).toMatchObject({
      kind: 'settlement',
      settlement: {
        outcome: 'inconsistent',
        canonical,
        failure: {
          code: 'PROTOCOL_ERROR',
          message: 'La réponse du suivi est invalide. Rechargez le suivi avant de réessayer.',
          recoverable: true,
        },
      },
    });
  });

  it('rejette un ledger committed dont la révision ne suit pas exactement sa base', () => {
    expect(
      classify(
        observation({
          ledger: ledger('committed', { baseRevision: 7, committedRevision: 2 }),
        })
      )
    ).toMatchObject({
      kind: 'settlement',
      settlement: { outcome: 'inconsistent', failure: { code: 'PROTOCOL_ERROR' } },
    });
  });

  it('rejette un ledger committed qui réutilise le mutationId déjà committé par sa base', () => {
    expect(
      classify(
        observation({
          ledger: ledger('committed', { baseLastMutationId: MUTATION_ID }),
        })
      )
    ).toMatchObject({
      kind: 'settlement',
      settlement: { outcome: 'inconsistent', failure: { code: 'PROTOCOL_ERROR' } },
    });
  });

  it('rejette un failureCode incompatible avec l’intent durable', () => {
    expect(
      classify(
        observation({
          ledger: ledger('rejected', { failureCode: 'INVALID_DETAILS' }),
          canonical: envelope(1, NEWER_MUTATION_ID, { undoBase: null }),
        })
      )
    ).toMatchObject({
      kind: 'settlement',
      settlement: { outcome: 'inconsistent', failure: { code: 'PROTOCOL_ERROR' } },
    });
  });

  it('classe une lecture durable impossible en uncertain et conserve la canonique connue', () => {
    const canonical = envelope(1, NEWER_MUTATION_ID, { undoBase: null });

    expect(
      classify(
        observation({
          ledger: null,
          canonical,
          readFailure: 'PERSIST_FAILED',
        })
      )
    ).toMatchObject({
      kind: 'settlement',
      settlement: {
        outcome: 'uncertain',
        canonical,
        committedRevision: null,
        undo: null,
        failure: { code: 'PERSIST_FAILED' },
        broadcastRequired: false,
      },
    });
  });

  it.each([
    ['epoch', { dataEpoch: OTHER_EPOCH }],
    ['mission', { missionId: 'mission-2' }],
    ['intent', { intent: 'details' }],
    ['digest', { commandDigest: 'b'.repeat(64) }],
  ])('rejette une observation de ledger avec %s étranger', (_name, ledgerOverride) => {
    const foreignLedger = ledger('committed', ledgerOverride);

    expect(classify(observation({ ledger: foreignLedger }))).toMatchObject({
      kind: 'settlement',
      settlement: { outcome: 'inconsistent', failure: { code: 'PROTOCOL_ERROR' } },
    });
  });

  it('rejette un Undo record quand undoBase contient null', () => {
    const canonical = envelope(2, MUTATION_ID, {
      kind: 'tombstone',
      tracking: null,
      undoBase: {
        previousTracking: null,
        expectedCurrentRevision: 2,
        expectedCurrentMutationId: MUTATION_ID,
      },
    });
    const valid = settlementFrom(classify(observation({ canonical })));
    expect(valid).not.toBeNull();
    if (!valid) {
      return;
    }

    const forged = {
      ...valid,
      undo: {
        ...(valid.undo as Record<string, unknown>),
        previousTracking: tracking('detected'),
      },
    };

    expect(validateSettlement(forged, identity())).toBe(false);
  });

  it('rejette un Undo null quand undoBase contient un record', () => {
    const valid = settlementFrom(classify(observation()));
    expect(valid).not.toBeNull();
    if (!valid) {
      return;
    }

    const forged = {
      ...valid,
      undo: { ...(valid.undo as Record<string, unknown>), previousTracking: null },
    };

    expect(validateSettlement(forged, identity())).toBe(false);
  });

  it('détache le snapshot Undo du canonical.undoBase après reconciliation', () => {
    const current = settlementFrom(classify(observation()));
    expect(current).not.toBeNull();
    if (!current) {
      return;
    }
    const undo = current.undo as Record<string, unknown>;
    const canonical = current.canonical as Record<string, unknown>;
    const undoTracking = undo.previousTracking as Record<string, unknown>;
    const undoBase = canonical.undoBase as Record<string, unknown>;
    const canonicalTracking = undoBase.previousTracking as Record<string, unknown>;

    expect(undoTracking).not.toBe(canonicalTracking);
    undoTracking.notes = 'Undo muté';
    expect(canonicalTracking.notes).toBe('');
    canonicalTracking.notes = 'Canonique mutée';
    expect(undoTracking.notes).toBe('Undo muté');
  });

  it('refuse un settlement not_committed dont la canonique porte le même mutationId', () => {
    const failed = settlementFrom(
      classify(
        observation({
          ledger: ledger('failed'),
          canonical: envelope(1, NEWER_MUTATION_ID, { undoBase: null }),
        })
      )
    );
    expect(failed).not.toBeNull();
    if (!failed) {
      return;
    }

    const forged = { ...failed, canonical: envelope(2, MUTATION_ID) };
    expect(validateSettlement(forged, identity())).toBe(false);
  });

  it('rejette le CAS Undo devenu stale après une écriture suivante', () => {
    const restore = {
      dataEpoch: DATA_EPOCH,
      mutationId: NEWER_MUTATION_ID,
      missionId: 'mission-1',
      intent: 'restore',
      previousTracking: tracking('detected'),
      expectedCurrentRevision: 2,
      expectedCurrentMutationId: MUTATION_ID,
    };
    const newer = envelope(3, NEWER_MUTATION_ID, { undoBase: null });

    expect(preflight(restore, newer)).toEqual({ ok: false, code: 'STALE_UNDO' });
  });

  it('rejette le CAS Undo stale après tombstone puis recréation', () => {
    const restore = {
      dataEpoch: DATA_EPOCH,
      mutationId: '55555555-5555-4555-8555-555555555555',
      missionId: 'mission-1',
      intent: 'restore',
      previousTracking: null,
      expectedCurrentRevision: 2,
      expectedCurrentMutationId: MUTATION_ID,
    };
    const recreated = envelope(4, NEWER_MUTATION_ID, {
      undoBase: {
        previousTracking: null,
        expectedCurrentRevision: 4,
        expectedCurrentMutationId: NEWER_MUTATION_ID,
      },
    });

    expect(preflight(restore, recreated)).toEqual({ ok: false, code: 'STALE_UNDO' });
  });
});
