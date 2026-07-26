import { describe, expect, it } from 'vitest';
import * as trackingCore from '../../../src/lib/core/tracking/index';

const DATA_EPOCH = '11111111-1111-4111-8111-111111111111';
const MUTATION_ID = '22222222-2222-4222-8222-222222222222';
const PREVIOUS_MUTATION_ID = '33333333-3333-4333-8333-333333333333';
const COMMITTED_AT = 1_721_036_000_000;

type Preflight = (command: unknown, canonical: unknown) => unknown;
type BuildPlan = (command: unknown, txABase: unknown, committedAt: number) => unknown;

function publicFunction<T>(name: string): T | null {
  const candidate = (trackingCore as unknown as Record<string, unknown>)[name];
  expect(candidate, `${name} doit être exportée par l'entrée Core tracking`).toBeTypeOf('function');
  return typeof candidate === 'function' ? (candidate as T) : null;
}

function preflight(command: unknown, canonical: unknown): unknown {
  const fn = publicFunction<Preflight>('preflightTrackingMutationV2');
  return fn ? fn(command, canonical) : null;
}

function buildPlan(command: unknown, txABase: unknown, committedAt = COMMITTED_AT): unknown {
  const fn = publicFunction<BuildPlan>('buildTrackingTransactionPlanV2');
  return fn ? fn(command, txABase, committedAt) : null;
}

function tracking(
  currentStatus: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const statusPath = [
    'detected',
    'selected',
    'application_prepared',
    'applied',
    'interview',
    'offer',
  ];
  const index = statusPath.indexOf(currentStatus);
  const statuses = index >= 0 ? statusPath.slice(0, index + 1) : ['detected', currentStatus];
  return {
    missionId: 'mission-1',
    currentStatus,
    history: statuses.map((to, position) => ({
      from: position === 0 ? null : statuses[position - 1],
      to,
      timestamp: (position + 1) * 1_000,
      note: null,
    })),
    generatedAssetIds: [],
    userRating: null,
    notes: '',
    nextActionAt: null,
    ...overrides,
  };
}

function envelope(
  revision: number,
  value: Record<string, unknown> | null,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    schemaVersion: 2,
    dataEpoch: DATA_EPOCH,
    missionId: 'mission-1',
    kind: value === null ? 'tombstone' : 'record',
    tracking: value,
    revision,
    lastMutationId: PREVIOUS_MUTATION_ID,
    lastMutationIntent: 'transition',
    committedAt: COMMITTED_AT - 10_000,
    undoBase: null,
    ...overrides,
  };
}

function transitionCommand(status: string, note: string | null = null): Record<string, unknown> {
  return {
    dataEpoch: DATA_EPOCH,
    mutationId: MUTATION_ID,
    missionId: 'mission-1',
    intent: 'transition',
    status,
    note,
  };
}

function detailsCommand(nextActionAt: string | null): Record<string, unknown> {
  return {
    dataEpoch: DATA_EPOCH,
    mutationId: MUTATION_ID,
    missionId: 'mission-1',
    intent: 'details',
    nextActionAt,
  };
}

describe('tracking transaction plan v2', () => {
  it('construit le candidat exclusivement depuis le snapshot Tx A', () => {
    const txABase = envelope(7, tracking('applied'));
    const result = buildPlan(transitionCommand('interview'), txABase);

    expect(result).toMatchObject({
      ok: true,
      actorBase: {
        dataEpoch: DATA_EPOCH,
        revision: 7,
        lastMutationId: PREVIOUS_MUTATION_ID,
      },
      candidate: {
        tracking: {
          currentStatus: 'interview',
          history: [
            { to: 'detected' },
            { to: 'selected' },
            { to: 'application_prepared' },
            { to: 'applied' },
            { from: 'applied', to: 'interview', timestamp: COMMITTED_AT, note: null },
          ],
        },
        committedAt: COMMITTED_AT,
      },
      envelope: { revision: 8, lastMutationId: MUTATION_ID },
    });
  });

  it('matérialise detected et la première transition dans une seule révision', () => {
    const command = transitionCommand('selected', 'Intéressante');

    expect(preflight(command, null)).toEqual({
      ok: true,
      txA: {
        actorBase: { dataEpoch: DATA_EPOCH, revision: 0, lastMutationId: null },
        command,
      },
    });
    expect(buildPlan(command, null)).toMatchObject({
      ok: true,
      candidate: {
        tracking: {
          missionId: 'mission-1',
          currentStatus: 'selected',
          history: [
            { from: null, to: 'detected', timestamp: COMMITTED_AT, note: null },
            {
              from: 'detected',
              to: 'selected',
              timestamp: COMMITTED_AT,
              note: 'Intéressante',
            },
          ],
        },
      },
      envelope: { revision: 1, kind: 'record' },
      undo: {
        version: 2,
        previousTracking: null,
        expectedCurrentRevision: 1,
        expectedCurrentMutationId: MUTATION_ID,
      },
    });
  });

  it('matérialise detected et les premiers détails dans une seule révision', () => {
    const nextActionAt = '2026-07-20T08:00:00.000Z';

    expect(buildPlan(detailsCommand(nextActionAt), null)).toMatchObject({
      ok: true,
      candidate: {
        tracking: {
          currentStatus: 'detected',
          history: [{ from: null, to: 'detected', timestamp: COMMITTED_AT, note: null }],
          nextActionAt,
        },
      },
      envelope: { revision: 1, kind: 'record' },
    });
  });

  it('applique statut terminal et suppression du follow-up atomiquement', () => {
    const base = envelope(9, tracking('offer', { nextActionAt: '2026-07-20T08:00:00.000Z' }));

    expect(buildPlan(transitionCommand('accepted'), base)).toMatchObject({
      ok: true,
      candidate: { tracking: { currentStatus: 'accepted', nextActionAt: null } },
      envelope: {
        revision: 10,
        tracking: { currentStatus: 'accepted', nextActionAt: null },
      },
    });
  });

  it('ne produit aucun plan Tx A pour transition, details ou restore invalides', () => {
    const current = envelope(4, tracking('detected'));
    const invalidRestore = {
      dataEpoch: DATA_EPOCH,
      mutationId: MUTATION_ID,
      missionId: 'mission-1',
      intent: 'restore',
      previousTracking: tracking('selected', { missionId: 'autre-mission' }),
      expectedCurrentRevision: 4,
      expectedCurrentMutationId: PREVIOUS_MUTATION_ID,
    };

    expect(preflight(transitionCommand('offer'), current)).toEqual({
      ok: false,
      code: 'INVALID_TRANSITION',
    });
    expect(preflight(detailsCommand('demain'), current)).toEqual({
      ok: false,
      code: 'INVALID_DETAILS',
    });
    expect(preflight(invalidRestore, current)).toEqual({
      ok: false,
      code: 'INVALID_RESTORE',
    });
  });

  it('crée une nouvelle révision même si le candidat details est byte-equal', () => {
    const nextActionAt = '2026-07-20T08:00:00.000Z';
    const previous = tracking('selected', { nextActionAt });

    expect(buildPlan(detailsCommand(nextActionAt), envelope(12, previous))).toMatchObject({
      ok: true,
      candidate: { tracking: previous },
      envelope: { revision: 13, tracking: previous },
      undo: { previousTracking: previous, expectedCurrentRevision: 13 },
    });
  });

  it('rejette l’overflow de révision avant toute écriture', () => {
    const base = envelope(Number.MAX_SAFE_INTEGER, tracking('selected'));

    expect(preflight(detailsCommand(null), base)).toEqual({
      ok: false,
      code: 'PERSIST_FAILED',
    });
    expect(buildPlan(detailsCommand(null), base)).toEqual({
      ok: false,
      code: 'PERSIST_FAILED',
    });
  });

  it('détache profondément candidat, enveloppe et Undo du snapshot Tx A', () => {
    const baseTracking = tracking('selected', {
      generatedAssetIds: ['asset-1'],
      notes: 'Avant',
    });
    const base = envelope(12, baseTracking);
    const result = buildPlan(detailsCommand('2026-07-20T08:00:00.000Z'), base) as {
      ok: true;
      candidate: { tracking: Record<string, unknown> };
      envelope: Record<string, unknown>;
      undo: { previousTracking: Record<string, unknown> };
    };
    expect(result.ok).toBe(true);

    baseTracking.notes = 'Entrée mutée';
    (baseTracking.history as Record<string, unknown>[])[0].note = 'Historique muté';
    (baseTracking.generatedAssetIds as string[]).push('asset-2');

    expect(result.candidate.tracking.notes).toBe('Avant');
    expect((result.candidate.tracking.history as Record<string, unknown>[])[0].note).toBeNull();
    expect(result.candidate.tracking.generatedAssetIds).toEqual(['asset-1']);
    expect(result.undo.previousTracking.notes).toBe('Avant');

    result.candidate.tracking.notes = 'Sortie mutée';
    (result.candidate.tracking.history as Record<string, unknown>[])[0].note = 'Sortie historique';
    (result.candidate.tracking.generatedAssetIds as string[]).push('asset-output');

    expect(baseTracking.notes).toBe('Entrée mutée');
    expect((baseTracking.history as Record<string, unknown>[])[0].note).toBe('Historique muté');
    expect(baseTracking.generatedAssetIds).toEqual(['asset-1', 'asset-2']);
    expect((result.envelope.tracking as Record<string, unknown>).notes).toBe('Avant');
    expect(result.undo.previousTracking.notes).toBe('Avant');
  });

  it('restaure vers tombstone puis recrée de façon monotone avec un nouveau CAS', () => {
    const current = tracking('selected');
    const currentEnvelope = envelope(2, current, {
      lastMutationId: PREVIOUS_MUTATION_ID,
      undoBase: {
        previousTracking: null,
        expectedCurrentRevision: 2,
        expectedCurrentMutationId: PREVIOUS_MUTATION_ID,
      },
    });
    const removeCommand = {
      dataEpoch: DATA_EPOCH,
      mutationId: MUTATION_ID,
      missionId: 'mission-1',
      intent: 'restore',
      previousTracking: null,
      expectedCurrentRevision: 2,
      expectedCurrentMutationId: PREVIOUS_MUTATION_ID,
    };
    const removed = buildPlan(removeCommand, currentEnvelope) as {
      ok: true;
      envelope: Record<string, unknown>;
    };

    expect(removed).toMatchObject({
      ok: true,
      envelope: { kind: 'tombstone', tracking: null, revision: 3 },
    });

    const recreateMutationId = '55555555-5555-4555-8555-555555555555';
    const recreateCommand = {
      dataEpoch: DATA_EPOCH,
      mutationId: recreateMutationId,
      missionId: 'mission-1',
      intent: 'restore',
      previousTracking: current,
      expectedCurrentRevision: 3,
      expectedCurrentMutationId: MUTATION_ID,
    };
    const recreated = buildPlan(recreateCommand, removed.envelope);

    expect(recreated).toMatchObject({
      ok: true,
      envelope: {
        kind: 'record',
        tracking: current,
        revision: 4,
        lastMutationId: recreateMutationId,
      },
    });
  });
});
