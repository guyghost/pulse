import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as trackingCore from '../../../src/lib/core/tracking/index';

const DATA_EPOCH = '11111111-1111-4111-8111-111111111111';
const MUTATION_ID = '22222222-2222-4222-8222-222222222222';

type CanonicalizeTrackingCommand = (command: unknown) => string | null;
type IsTrackingCommandDigest = (value: unknown) => boolean;

function publicFunction<T>(name: string): T | null {
  const candidate = (trackingCore as unknown as Record<string, unknown>)[name];
  expect(candidate, `${name} doit être exportée par l'entrée Core tracking`).toBeTypeOf('function');
  return typeof candidate === 'function' ? (candidate as T) : null;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalize(command: unknown): string | null {
  const fn = publicFunction<CanonicalizeTrackingCommand>('canonicalizeTrackingCommandV2');
  return fn ? fn(command) : null;
}

describe('canonical command digest v2', () => {
  it.each([
    {
      name: 'transition/null',
      command: {
        dataEpoch: DATA_EPOCH,
        mutationId: MUTATION_ID,
        missionId: 'mission-1',
        intent: 'transition',
        status: 'selected',
        note: null,
      },
      canonical:
        '[2,"11111111-1111-4111-8111-111111111111","transition","mission-1","selected",null]',
      digest: '3859a05e023fd89e6eb8c42bf2069c950a45bb5f86f872948491abca2b61912c',
    },
    {
      name: 'Unicode décomposé normalisé NFC',
      command: {
        dataEpoch: DATA_EPOCH,
        mutationId: MUTATION_ID,
        missionId: 'mission-e\u0301',
        intent: 'transition',
        status: 'selected',
        note: 'cafe\u0301',
      },
      canonical:
        '[2,"11111111-1111-4111-8111-111111111111","transition","mission-é","selected","café"]',
      digest: '0d2f3269f4b3d70a1d37d32eafb87c245625c50a39f281d146159604f38c4069',
    },
    {
      name: 'date avec offset convertie en UTC',
      command: {
        dataEpoch: DATA_EPOCH,
        mutationId: MUTATION_ID,
        missionId: 'mission-1',
        intent: 'details',
        nextActionAt: '2026-07-15T10:30:00+02:00',
      },
      canonical:
        '[2,"11111111-1111-4111-8111-111111111111","details","mission-1","2026-07-15T08:30:00.000Z"]',
      digest: '0ef55b59988a854410a60082ff6d4bcda4e8746165742395f5b3660534e39e17',
    },
    {
      name: 'details null',
      command: {
        dataEpoch: DATA_EPOCH,
        mutationId: MUTATION_ID,
        missionId: 'mission-1',
        intent: 'details',
        nextActionAt: null,
      },
      canonical: '[2,"11111111-1111-4111-8111-111111111111","details","mission-1",null]',
      digest: 'b2d12bf5d004e0fa98a0fb72ebc5b34c23198a26eb150fcdc57273120531484d',
    },
  ])('épingle le vecteur immuable $name', ({ command, canonical, digest }) => {
    const serialized = canonicalize(command);

    expect(serialized).toBe(canonical);
    expect(serialized === null ? null : sha256(serialized)).toBe(digest);
  });

  it('produit la même représentation pour les chaînes NFC composées et décomposées', () => {
    const decomposed = canonicalize({
      dataEpoch: DATA_EPOCH,
      mutationId: MUTATION_ID,
      missionId: 'mission-e\u0301',
      intent: 'transition',
      status: 'selected',
      note: 'cafe\u0301',
    });
    const composed = canonicalize({
      dataEpoch: DATA_EPOCH,
      mutationId: MUTATION_ID,
      missionId: 'mission-é',
      intent: 'transition',
      status: 'selected',
      note: 'café',
    });

    expect(decomposed).toBe(composed);
  });

  it('normalise undefined comme null pour details', () => {
    const missing = canonicalize({
      dataEpoch: DATA_EPOCH,
      mutationId: MUTATION_ID,
      missionId: 'mission-1',
      intent: 'details',
    });
    const explicitNull = canonicalize({
      dataEpoch: DATA_EPOCH,
      mutationId: MUTATION_ID,
      missionId: 'mission-1',
      intent: 'details',
      nextActionAt: null,
    });

    expect(missing).toBe(explicitNull);
  });

  it('rejette les dates calendaires impossibles et les années hors format ISO canonique', () => {
    expect(
      canonicalize({
        dataEpoch: DATA_EPOCH,
        mutationId: MUTATION_ID,
        missionId: 'mission-1',
        intent: 'details',
        nextActionAt: '2026-02-30T10:00:00Z',
      })
    ).toBeNull();
    expect(
      canonicalize({
        dataEpoch: DATA_EPOCH,
        mutationId: MUTATION_ID,
        missionId: 'mission-1',
        intent: 'details',
        nextActionAt: '10000-01-01T00:00:00Z',
      })
    ).toBeNull();
  });

  it('sérialise restore en JCS indépendamment de l’ordre des clés', () => {
    const previousTrackingCanonicalOrder = {
      missionId: 'mission-1',
      currentStatus: 'selected',
      history: [
        { from: null, to: 'detected', timestamp: 1_000, note: null },
        { from: 'detected', to: 'selected', timestamp: 2_000, note: 'Choisie' },
      ],
      generatedAssetIds: ['asset-1'],
      userRating: 4,
      notes: 'Prioritaire',
      nextActionAt: '2026-07-20T08:00:00.000Z',
    };
    const previousTrackingPermutedOrder = {
      nextActionAt: '2026-07-20T08:00:00.000Z',
      notes: 'Prioritaire',
      userRating: 4,
      generatedAssetIds: ['asset-1'],
      history: [
        { note: null, timestamp: 1_000, to: 'detected', from: null },
        { note: 'Choisie', timestamp: 2_000, to: 'selected', from: 'detected' },
      ],
      currentStatus: 'selected',
      missionId: 'mission-1',
    };
    const base = {
      dataEpoch: DATA_EPOCH,
      mutationId: MUTATION_ID,
      missionId: 'mission-1',
      intent: 'restore',
      expectedCurrentRevision: 7,
      expectedCurrentMutationId: '33333333-3333-4333-8333-333333333333',
    };

    const canonical = canonicalize({ ...base, previousTracking: previousTrackingCanonicalOrder });
    const permuted = canonicalize({ ...base, previousTracking: previousTrackingPermutedOrder });

    expect(permuted).toBe(canonical);
    expect(permuted === null ? null : sha256(permuted)).toBe(
      canonical === null ? null : sha256(canonical)
    );
  });

  it('rejette les digests uppercase ou de longueur différente de 64', () => {
    const isDigest = publicFunction<IsTrackingCommandDigest>('isTrackingCommandDigestV2');
    if (!isDigest) {
      return;
    }

    expect(isDigest('A'.repeat(64))).toBe(false);
    expect(isDigest('a'.repeat(63))).toBe(false);
    expect(isDigest('a'.repeat(65))).toBe(false);
    expect(isDigest('a'.repeat(64))).toBe(true);
  });
});
