import { describe, expect, it } from 'vitest';
import {
  TRACKING_ASSET_IDS_MAX_ITEMS,
  TRACKING_ENVELOPE_MAX_BYTES,
  TRACKING_HISTORY_MAX_ITEMS,
  TRACKING_LEDGER_MAX_BYTES,
  TRACKING_MISSION_ID_MAX_CHARS,
  TRACKING_NOTES_MAX_CHARS,
  TRACKING_NOTE_MAX_CHARS,
  TRACKING_RECORD_MAX_BYTES,
  canonicalTrackingJsonV2,
  canonicalizeTrackingCommandV2,
  createTrackingMutationErrorV2,
  isCanonicalMissionTrackingV2,
  isPersistedTrackingEnvelopeV2,
  isPersistedTrackingMutationV2,
  isSerializedTrackingMutationErrorV2,
  isTrackingCommandDigestV2,
  isTrackingControlIdentityV2,
  isTrackingUndoTokenV2,
  isValidTrackingSettlementV2,
  normalizeMissionTrackingV2,
  trackingSerializedBytesV2,
  type TrackingControlIdentityV2,
  type TrackingSettlementV2,
} from '../../../src/lib/core/tracking/index';
import { canonicalTrackingIsoV2 } from '../../../src/lib/core/tracking/v2-contract';
import { normalizeTrackingMutationCommandV2 } from '../../../src/lib/core/tracking/command-digest';

const DATA_EPOCH = '11111111-1111-4111-8111-111111111111';
const LETTER_EPOCH = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MUTATION_ID = '22222222-2222-4222-8222-222222222222';
const PREVIOUS_MUTATION_ID = '33333333-3333-4333-8333-333333333333';
const WORKER_EPOCH = '44444444-4444-4444-8444-444444444444';
const DIGEST = 'a'.repeat(64);

function tracking(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    missionId: 'mission-1',
    currentStatus: 'detected',
    history: [{ from: null, to: 'detected', timestamp: 1_000, note: null }],
    generatedAssetIds: [],
    userRating: null,
    notes: '',
    nextActionAt: null,
    ...overrides,
  };
}

function envelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 2,
    dataEpoch: DATA_EPOCH,
    missionId: 'mission-1',
    kind: 'record',
    tracking: tracking(),
    revision: 1,
    lastMutationId: MUTATION_ID,
    lastMutationIntent: 'transition',
    committedAt: 2_000,
    undoBase: {
      previousTracking: null,
      expectedCurrentRevision: 1,
      expectedCurrentMutationId: MUTATION_ID,
    },
    ...overrides,
  };
}

function ledger(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 2,
    dataEpoch: DATA_EPOCH,
    mutationId: MUTATION_ID,
    missionId: 'mission-1',
    intent: 'transition',
    commandDigest: DIGEST,
    phase: 'prepared',
    ownerWorkerEpoch: WORKER_EPOCH,
    baseRevision: 1,
    baseLastMutationId: PREVIOUS_MUTATION_ID,
    committedRevision: null,
    failureCode: null,
    createdAt: 1_500,
    settledAt: null,
    ...overrides,
  };
}

function detailsCommand(nextActionAt: string | null = null): Record<string, unknown> {
  return {
    dataEpoch: DATA_EPOCH,
    mutationId: MUTATION_ID,
    missionId: 'mission-1',
    intent: 'details',
    nextActionAt,
  };
}

function transitionCommand(note: string | null): Record<string, unknown> {
  return {
    dataEpoch: DATA_EPOCH,
    mutationId: MUTATION_ID,
    missionId: 'mission-1',
    intent: 'transition',
    status: 'selected',
    note,
  };
}

function restoreCommand(previousTracking: unknown): Record<string, unknown> {
  return {
    dataEpoch: DATA_EPOCH,
    mutationId: MUTATION_ID,
    missionId: 'mission-1',
    intent: 'restore',
    previousTracking,
    expectedCurrentRevision: 1,
    expectedCurrentMutationId: PREVIOUS_MUTATION_ID,
  };
}

function undoToken(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 2,
    dataEpoch: DATA_EPOCH,
    missionId: 'mission-1',
    previousTracking: tracking(),
    expectedCurrentRevision: 1,
    expectedCurrentMutationId: MUTATION_ID,
    ...overrides,
  };
}

function controlIdentity(): TrackingControlIdentityV2 {
  return {
    dataEpoch: DATA_EPOCH,
    missionId: 'mission-1',
    mutationId: MUTATION_ID,
    intent: 'transition',
    commandDigest: DIGEST,
  };
}

function notCommittedSettlement(identity: TrackingControlIdentityV2): TrackingSettlementV2 {
  return {
    version: 2,
    ...identity,
    deduplicated: true,
    outcome: 'not_committed',
    canonical: null,
    committedRevision: null,
    undo: null,
    failure: createTrackingMutationErrorV2(identity, 'TRANSPORT_ERROR'),
    broadcastRequired: false,
  };
}

function getHostileProxy<T extends object>(target: T, onRead: () => void): T {
  return new Proxy(target, {
    get() {
      onRead();
      throw new TypeError('hostile get');
    },
  });
}

function alternatingHistory(length: number): Record<string, unknown>[] {
  return Array.from({ length }, (_, index) => {
    const to = index % 2 === 0 ? 'detected' : 'archived';
    const from = index === 0 ? null : index % 2 === 0 ? 'archived' : 'detected';
    return { from, to, timestamp: index + 1, note: '' };
  });
}

function recordAtByteSize(targetBytes: number): Record<string, unknown> {
  const history = alternatingHistory(TRACKING_HISTORY_MAX_ITEMS);
  const value = tracking({ currentStatus: 'archived', history });
  const initialBytes = trackingSerializedBytesV2(value);
  if (initialBytes === null || initialBytes > targetBytes) {
    throw new Error('La fixture de taille ne peut pas atteindre la cible.');
  }
  let remaining = targetBytes - initialBytes;
  for (const transition of history) {
    const multibyteChars = Math.min(TRACKING_NOTE_MAX_CHARS, Math.floor(remaining / 2));
    const asciiChars =
      multibyteChars < TRACKING_NOTE_MAX_CHARS && remaining - multibyteChars * 2 > 0 ? 1 : 0;
    transition.note = `${'é'.repeat(multibyteChars)}${'a'.repeat(asciiChars)}`;
    remaining -= multibyteChars * 2 + asciiChars;
    if (remaining === 0) {
      break;
    }
  }
  if (remaining !== 0 || trackingSerializedBytesV2(value) !== targetBytes) {
    throw new Error('La fixture UTF-8 n’atteint pas exactement la cible.');
  }
  return value;
}

describe('tracking v2 strict object boundary', () => {
  it('rejette une propriété requise héritée et un prototype personnalisé', () => {
    const inherited = Object.create({ dataEpoch: DATA_EPOCH, admin: true }) as Record<
      string,
      unknown
    >;
    Object.assign(inherited, {
      mutationId: MUTATION_ID,
      missionId: 'mission-1',
      intent: 'details',
      nextActionAt: null,
    });

    expect(canonicalizeTrackingCommandV2(inherited)).toBeNull();
  });

  it('rejette les clés étrangères non énumérables, symboles et propres', () => {
    const nonEnumerable = detailsCommand();
    Object.defineProperty(nonEnumerable, 'admin', { value: true, enumerable: false });
    const symbol = detailsCommand();
    Object.defineProperty(symbol, Symbol('admin'), { value: true, enumerable: true });
    const enumerable = { ...detailsCommand(), admin: true };

    expect(canonicalizeTrackingCommandV2(nonEnumerable)).toBeNull();
    expect(canonicalizeTrackingCommandV2(symbol)).toBeNull();
    expect(canonicalizeTrackingCommandV2(enumerable)).toBeNull();
  });

  it('rejette un getter sans jamais l’exécuter', () => {
    let reads = 0;
    const command = detailsCommand();
    Object.defineProperty(command, 'dataEpoch', {
      enumerable: true,
      get() {
        reads += 1;
        return DATA_EPOCH;
      },
    });

    expect(canonicalizeTrackingCommandV2(command)).toBeNull();
    expect(reads).toBe(0);
  });

  it('accepte un objet JSON plat à prototype null', () => {
    const command = Object.assign(Object.create(null) as Record<string, unknown>, detailsCommand());

    expect(canonicalizeTrackingCommandV2(command)).toContain('"details"');
  });
});

describe('tracking v2 strict dense array boundary', () => {
  it.each([
    ['history', { from: null, to: 'detected', timestamp: 1_000, note: null }],
    ['generatedAssetIds', 'asset-1'],
  ] as const)('rejette un getter d’index %s sans jamais le lire', (field, item) => {
    let reads = 0;
    const hostile = new Array<unknown>(1);
    Object.defineProperty(hostile, '0', {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1;
        return item;
      },
    });

    expect(normalizeMissionTrackingV2(tracking({ [field]: hostile }))).toBeNull();
    expect(reads).toBe(0);
  });

  it('rejette un getter d’index avant JCS et dans un snapshot restore sans le lire', () => {
    let jcsReads = 0;
    const hostileJcs = new Array<unknown>(1);
    Object.defineProperty(hostileJcs, '0', {
      configurable: true,
      enumerable: true,
      get() {
        jcsReads += 1;
        return 'secret';
      },
    });

    let restoreReads = 0;
    const hostileHistory = new Array<unknown>(1);
    Object.defineProperty(hostileHistory, '0', {
      configurable: true,
      enumerable: true,
      get() {
        restoreReads += 1;
        return { from: null, to: 'detected', timestamp: 1_000, note: null };
      },
    });

    expect(canonicalTrackingJsonV2(hostileJcs)).toBeNull();
    expect(
      canonicalizeTrackingCommandV2(restoreCommand(tracking({ history: hostileHistory })))
    ).toBeNull();
    expect(jcsReads).toBe(0);
    expect(restoreReads).toBe(0);
  });

  it('rejette Symbol, propriété nommée, non énumérable et accesseur étrangers', () => {
    const symbolHistory = alternatingHistory(1);
    Object.defineProperty(symbolHistory, Symbol('admin'), { value: true, enumerable: true });

    const namedAssets = ['asset-1'];
    Object.defineProperty(namedAssets, 'admin', { value: true, enumerable: true });

    const hiddenHistory = alternatingHistory(1);
    Object.defineProperty(hiddenHistory, 'admin', { value: true, enumerable: false });

    let accessorReads = 0;
    const accessorAssets = ['asset-1'];
    Object.defineProperty(accessorAssets, 'admin', {
      enumerable: true,
      get() {
        accessorReads += 1;
        return true;
      },
    });

    expect(normalizeMissionTrackingV2(tracking({ history: symbolHistory }))).toBeNull();
    expect(normalizeMissionTrackingV2(tracking({ generatedAssetIds: namedAssets }))).toBeNull();
    expect(normalizeMissionTrackingV2(tracking({ history: hiddenHistory }))).toBeNull();
    expect(normalizeMissionTrackingV2(tracking({ generatedAssetIds: accessorAssets }))).toBeNull();
    expect(canonicalTrackingJsonV2(namedAssets)).toBeNull();
    expect(accessorReads).toBe(0);
  });

  it('rejette sous-classe et prototypes personnalisés/null sans lever', () => {
    class TrackingArray<T> extends Array<T> {}

    const subclassHistory = new TrackingArray<Record<string, unknown>>();
    subclassHistory.push({ from: null, to: 'detected', timestamp: 1_000, note: null });
    const nullPrototypeHistory = alternatingHistory(1);
    Object.setPrototypeOf(nullPrototypeHistory, null);
    const customPrototypeAssets = ['asset-1'];
    Object.setPrototypeOf(customPrototypeAssets, { admin: true });

    expect(normalizeMissionTrackingV2(tracking({ history: subclassHistory }))).toBeNull();
    expect(() =>
      normalizeMissionTrackingV2(tracking({ history: nullPrototypeHistory }))
    ).not.toThrow();
    expect(normalizeMissionTrackingV2(tracking({ history: nullPrototypeHistory }))).toBeNull();
    expect(
      normalizeMissionTrackingV2(tracking({ generatedAssetIds: customPrototypeAssets }))
    ).toBeNull();
    expect(() => canonicalTrackingJsonV2(nullPrototypeHistory)).not.toThrow();
    expect(canonicalTrackingJsonV2(nullPrototypeHistory)).toBeNull();
  });

  it('échoue fermé sur les Proxy hostiles ou révoqués sans lever', () => {
    const throwingProxy = new Proxy(alternatingHistory(1), {
      ownKeys() {
        throw new TypeError('hostile ownKeys');
      },
    });
    const revoked = Proxy.revocable(['asset-1'], {});
    revoked.revoke();

    expect(() => normalizeMissionTrackingV2(tracking({ history: throwingProxy }))).not.toThrow();
    expect(normalizeMissionTrackingV2(tracking({ history: throwingProxy }))).toBeNull();
    expect(() =>
      normalizeMissionTrackingV2(tracking({ generatedAssetIds: revoked.proxy }))
    ).not.toThrow();
    expect(normalizeMissionTrackingV2(tracking({ generatedAssetIds: revoked.proxy }))).toBeNull();
    expect(() => canonicalTrackingJsonV2(revoked.proxy)).not.toThrow();
    expect(canonicalTrackingJsonV2(revoked.proxy)).toBeNull();
  });

  it.each([0, 1, 2])(
    'rejette explicitement un trou à l’index %i dans history, assets et restore',
    (holeIndex) => {
      const sparseHistory = alternatingHistory(3);
      delete sparseHistory[holeIndex];
      const sparseAssets = ['asset-1', 'asset-2', 'asset-3'];
      delete sparseAssets[holeIndex];

      expect(normalizeMissionTrackingV2(tracking({ history: sparseHistory }))).toBeNull();
      expect(normalizeMissionTrackingV2(tracking({ generatedAssetIds: sparseAssets }))).toBeNull();
      expect(
        canonicalizeTrackingCommandV2(restoreCommand(tracking({ history: sparseHistory })))
      ).toBeNull();
      expect(
        canonicalizeTrackingCommandV2(restoreCommand(tracking({ generatedAssetIds: sparseAssets })))
      ).toBeNull();
    }
  );

  it('rejette un tableau JCS creux au lieu de le normaliser implicitement en null', () => {
    expect(canonicalTrackingJsonV2(new Array<unknown>(1))).toBeNull();
  });

  it('rejette une valeur undefined propre qui ne fait pas partie du domaine JSON', () => {
    expect(canonicalTrackingJsonV2([undefined])).toBeNull();
  });
});

describe('tracking v2 recursive descriptor snapshot boundary', () => {
  const transition = { from: null, to: 'detected', timestamp: 1_000, note: null };

  it.each([
    [
      'JCS',
      (value: unknown) => canonicalTrackingJsonV2(value),
      () => canonicalTrackingJsonV2(transition),
    ],
    [
      'history',
      (value: unknown) => normalizeMissionTrackingV2(tracking({ history: [value] })),
      () => normalizeMissionTrackingV2(tracking()),
    ],
    [
      'restore',
      (value: unknown) =>
        canonicalizeTrackingCommandV2(
          restoreCommand(tracking({ history: [value], currentStatus: 'detected' }))
        ),
      () => canonicalizeTrackingCommandV2(restoreCommand(tracking())),
    ],
  ] as const)(
    'capture un Proxy transition get-hostile pour %s sans appeler get',
    (_name, invoke, expected) => {
      let reads = 0;
      const proxy = getHostileProxy(transition, () => {
        reads += 1;
      });
      let result: unknown;

      expect(() => {
        result = invoke(proxy);
      }).not.toThrow();
      expect(result).toEqual(expected());
      expect(reads).toBe(0);
    }
  );

  it.each([
    [
      'JCS',
      (value: unknown) => canonicalTrackingJsonV2(value),
      () => canonicalTrackingJsonV2(tracking()),
    ],
    [
      'normalizer',
      (value: unknown) => normalizeMissionTrackingV2(value),
      () => normalizeMissionTrackingV2(tracking()),
    ],
    [
      'restore',
      (value: unknown) => canonicalizeTrackingCommandV2(restoreCommand(value)),
      () => canonicalizeTrackingCommandV2(restoreCommand(tracking())),
    ],
  ] as const)(
    'capture un Proxy snapshot tracking get-hostile pour %s sans appeler get',
    (_name, invoke, expected) => {
      let reads = 0;
      const proxy = getHostileProxy(tracking(), () => {
        reads += 1;
      });
      let result: unknown;

      expect(() => {
        result = invoke(proxy);
      }).not.toThrow();
      expect(result).toEqual(expected());
      expect(reads).toBe(0);
    }
  );

  it('capture la commande restore elle-même depuis ses data descriptors', () => {
    const target = restoreCommand(tracking());
    let reads = 0;
    const proxy = getHostileProxy(target, () => {
      reads += 1;
    });
    let result: string | null | undefined;

    expect(() => {
      result = canonicalizeTrackingCommandV2(proxy);
    }).not.toThrow();
    expect(result).toBe(canonicalizeTrackingCommandV2(target));
    expect(reads).toBe(0);
  });

  it.each([
    {
      name: 'envelope',
      target: () => envelope(),
      validate: (value: unknown) => isPersistedTrackingEnvelopeV2(value),
    },
    {
      name: 'ledger',
      target: () => ledger(),
      validate: (value: unknown) => isPersistedTrackingMutationV2(value),
    },
    {
      name: 'Undo',
      target: () => undoToken(),
      validate: (value: unknown) => isTrackingUndoTokenV2(value),
    },
    {
      name: 'identity',
      target: () => controlIdentity(),
      validate: (value: unknown) => isTrackingControlIdentityV2(value),
    },
    {
      name: 'error',
      target: () => createTrackingMutationErrorV2(controlIdentity(), 'TRANSPORT_ERROR'),
      validate: (value: unknown) => isSerializedTrackingMutationErrorV2(value, controlIdentity()),
    },
    {
      name: 'settlement',
      target: () => notCommittedSettlement(controlIdentity()),
      validate: (value: unknown) => isValidTrackingSettlementV2(value, controlIdentity(), null),
    },
  ])('valide un Proxy $name depuis sa capture sans appeler get', ({ target, validate }) => {
    let reads = 0;
    const proxy = getHostileProxy(target(), () => {
      reads += 1;
    });
    let result = false;

    expect(() => {
      result = validate(proxy);
    }).not.toThrow();
    expect(result).toBe(true);
    expect(reads).toBe(0);
  });

  it('capture également le snapshot tracking imbriqué dans Undo', () => {
    let reads = 0;
    const previousTracking = getHostileProxy(tracking(), () => {
      reads += 1;
    });
    let result = false;

    expect(() => {
      result = isTrackingUndoTokenV2(undoToken({ previousTracking }));
    }).not.toThrow();
    expect(result).toBe(true);
    expect(reads).toBe(0);
  });

  it.each([
    {
      name: 'tracking racine',
      create: (onDescriptor: () => number) =>
        new Proxy(tracking({ notes: 'café' }), {
          getOwnPropertyDescriptor(target, key) {
            const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
            if (key !== 'notes' || descriptor === undefined || !('value' in descriptor)) {
              return descriptor;
            }
            const descriptorRead = onDescriptor();
            return {
              ...descriptor,
              value: descriptorRead === 1 ? 'cafe\u0301' : 'café',
            };
          },
        }),
    },
    {
      name: 'transition imbriquée',
      create: (onDescriptor: () => number) => {
        const transitionProxy = new Proxy(
          { from: null, to: 'detected', timestamp: 1_000, note: 'café' },
          {
            getOwnPropertyDescriptor(target, key) {
              const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
              if (key !== 'note' || descriptor === undefined || !('value' in descriptor)) {
                return descriptor;
              }
              const descriptorRead = onDescriptor();
              return {
                ...descriptor,
                value: descriptorRead === 1 ? 'cafe\u0301' : 'café',
              };
            },
          }
        );
        return tracking({ history: [transitionProxy] });
      },
    },
  ])(
    'capture une seule fois les descripteurs de $name avant de refuser le non-NFC',
    ({ create }) => {
      let descriptorReads = 0;
      const value = create(() => {
        descriptorReads += 1;
        return descriptorReads;
      });

      expect(isCanonicalMissionTrackingV2(value)).toBe(false);
      expect(descriptorReads).toBe(1);
    }
  );

  it.each([
    [
      'prototype',
      () =>
        new Proxy(transition, {
          getPrototypeOf() {
            throw new TypeError('hostile prototype');
          },
        }),
    ],
    [
      'ownKeys',
      () =>
        new Proxy(transition, {
          ownKeys() {
            throw new TypeError('hostile ownKeys');
          },
        }),
    ],
    [
      'descriptor',
      () =>
        new Proxy(transition, {
          getOwnPropertyDescriptor() {
            throw new TypeError('hostile descriptor');
          },
        }),
    ],
    [
      'revoked',
      () => {
        const revocable = Proxy.revocable(transition, {});
        revocable.revoke();
        return revocable.proxy;
      },
    ],
  ] as const)('échoue fermé sur un objet imbriqué dont %s lève', (_name, createProxy) => {
    const proxy = createProxy();
    let normalized: unknown;
    let serialized: unknown;
    let restored: unknown;

    expect(() => {
      normalized = normalizeMissionTrackingV2(tracking({ history: [proxy] }));
      serialized = canonicalTrackingJsonV2(proxy);
      restored = canonicalizeTrackingCommandV2(
        restoreCommand(tracking({ history: [proxy], currentStatus: 'detected' }))
      );
    }).not.toThrow();
    expect(normalized).toBeNull();
    expect(serialized).toBeNull();
    expect(restored).toBeNull();
  });

  it('préserve les objets et arrays plain, frozen et à prototype null', () => {
    const frozenTransition = Object.freeze({ ...transition });
    const frozenTracking = Object.freeze({
      ...tracking(),
      history: Object.freeze([frozenTransition]),
      generatedAssetIds: Object.freeze(['asset-1']),
    });
    const nullTransition = Object.assign(
      Object.create(null) as Record<string, unknown>,
      transition
    );
    const nullTracking = Object.assign(
      Object.create(null) as Record<string, unknown>,
      tracking({ history: [nullTransition] })
    );

    expect(normalizeMissionTrackingV2(frozenTracking)).not.toBeNull();
    expect(canonicalizeTrackingCommandV2(restoreCommand(frozenTracking))).not.toBeNull();
    expect(normalizeMissionTrackingV2(nullTracking)).not.toBeNull();
    expect(canonicalizeTrackingCommandV2(restoreCommand(nullTracking))).not.toBeNull();
  });
});

describe('tracking v2 canonical Unicode boundary', () => {
  it.each([
    ['missionId', tracking({ missionId: 'mission-e\u0301' })],
    ['notes', tracking({ notes: 'priorite\u0301' })],
    ['asset id', tracking({ generatedAssetIds: ['asset-e\u0301'] })],
    [
      'history note',
      tracking({
        history: [{ from: null, to: 'detected', timestamp: 1_000, note: 'cafe\u0301' }],
      }),
    ],
  ])(
    'rejette un snapshot non-NFC dans %s tout en permettant une copie normalisée',
    (_name, value) => {
      expect(isCanonicalMissionTrackingV2(value)).toBe(false);
      expect(normalizeMissionTrackingV2(value)).not.toBeNull();
    }
  );

  it('rejette les deux lone surrogates mais conserve une paire astrale valide en JCS', () => {
    expect(canonicalTrackingJsonV2('\ud800')).toBeNull();
    expect(canonicalTrackingJsonV2('\udfff')).toBeNull();
    expect(canonicalTrackingJsonV2('mission-😀')).toBe('"mission-😀"');
    expect(canonicalizeTrackingCommandV2(transitionCommand('\ud800'))).toBeNull();
    expect(canonicalizeTrackingCommandV2(transitionCommand('\udfff'))).toBeNull();
    expect(canonicalizeTrackingCommandV2(transitionCommand('Très bien 😀'))).not.toBeNull();
  });

  it('rejette les surrogates isolés dès la normalisation de commande pré-Tx A', () => {
    expect(
      normalizeTrackingMutationCommandV2({
        ...transitionCommand(null),
        missionId: 'mission-\ud800',
      })
    ).toBeNull();
    expect(normalizeTrackingMutationCommandV2(transitionCommand('\udfff'))).toBeNull();
  });

  it('applique les mêmes garanties Unicode au snapshot restore', () => {
    expect(canonicalizeTrackingCommandV2(restoreCommand(tracking({ notes: '\ud800' })))).toBeNull();
    expect(
      canonicalizeTrackingCommandV2(restoreCommand(tracking({ notes: 'cafe\u0301 😀' })))
    ).toContain('café 😀');
  });
});

describe('tracking v2 durable token invariants', () => {
  it('réserve le couple mutation/intent nul à la révision legacy 1 sans Undo', () => {
    const legacy = envelope({
      revision: 1,
      lastMutationId: null,
      lastMutationIntent: null,
      undoBase: null,
    });
    const impossible = envelope({
      revision: 999,
      lastMutationId: null,
      lastMutationIntent: null,
      undoBase: null,
    });

    expect(isPersistedTrackingEnvelopeV2(legacy)).toBe(true);
    expect(isPersistedTrackingEnvelopeV2(envelope())).toBe(true);
    expect(isPersistedTrackingEnvelopeV2(impossible)).toBe(false);
  });

  it('lie baseRevision zéro à un lastMutationId nul et autorise la base legacy 1/null', () => {
    expect(
      isPersistedTrackingMutationV2(ledger({ baseRevision: 0, baseLastMutationId: null }))
    ).toBe(true);
    expect(
      isPersistedTrackingMutationV2(
        ledger({ baseRevision: 0, baseLastMutationId: PREVIOUS_MUTATION_ID })
      )
    ).toBe(false);
    expect(
      isPersistedTrackingMutationV2(ledger({ baseRevision: 1, baseLastMutationId: null }))
    ).toBe(true);
    expect(
      isPersistedTrackingMutationV2(ledger({ baseRevision: 2, baseLastMutationId: null }))
    ).toBe(false);
  });

  it('rejette un ledger dont le mutationId est déjà le dernier commit de sa base', () => {
    expect(
      isPersistedTrackingMutationV2(ledger({ baseRevision: 1, baseLastMutationId: MUTATION_ID }))
    ).toBe(false);
  });
});

describe('tracking v2 normative limits', () => {
  it('épingle UUID/digest lowercase et missionId 256/257', () => {
    expect(isTrackingCommandDigestV2(DIGEST)).toBe(true);
    expect(isTrackingCommandDigestV2(DIGEST.toUpperCase())).toBe(false);
    expect(
      canonicalizeTrackingCommandV2({
        ...detailsCommand(),
        dataEpoch: LETTER_EPOCH.toUpperCase(),
      })
    ).toBeNull();
    expect(
      canonicalizeTrackingCommandV2({
        ...detailsCommand(),
        missionId: 'm'.repeat(TRACKING_MISSION_ID_MAX_CHARS),
      })
    ).not.toBeNull();
    expect(
      canonicalizeTrackingCommandV2({
        ...detailsCommand(),
        missionId: 'm'.repeat(TRACKING_MISSION_ID_MAX_CHARS + 1),
      })
    ).toBeNull();
  });

  it('épingle note 2048/2049 et notes 10000/10001', () => {
    expect(
      canonicalizeTrackingCommandV2(transitionCommand('n'.repeat(TRACKING_NOTE_MAX_CHARS)))
    ).not.toBeNull();
    expect(
      canonicalizeTrackingCommandV2(transitionCommand('n'.repeat(TRACKING_NOTE_MAX_CHARS + 1)))
    ).toBeNull();
    expect(
      isCanonicalMissionTrackingV2(tracking({ notes: 'n'.repeat(TRACKING_NOTES_MAX_CHARS) }))
    ).toBe(true);
    expect(
      isCanonicalMissionTrackingV2(tracking({ notes: 'n'.repeat(TRACKING_NOTES_MAX_CHARS + 1) }))
    ).toBe(false);
  });

  it('épingle history 200/201 et assets 100/101', () => {
    expect(
      isCanonicalMissionTrackingV2(
        tracking({
          currentStatus: 'archived',
          history: alternatingHistory(TRACKING_HISTORY_MAX_ITEMS),
        })
      )
    ).toBe(true);
    expect(
      isCanonicalMissionTrackingV2(
        tracking({
          currentStatus: 'detected',
          history: alternatingHistory(TRACKING_HISTORY_MAX_ITEMS + 1),
        })
      )
    ).toBe(false);
    expect(
      isCanonicalMissionTrackingV2(
        tracking({
          generatedAssetIds: Array.from(
            { length: TRACKING_ASSET_IDS_MAX_ITEMS },
            (_, index) => `asset-${index}`
          ),
        })
      )
    ).toBe(true);
    expect(
      isCanonicalMissionTrackingV2(
        tracking({
          generatedAssetIds: Array.from(
            { length: TRACKING_ASSET_IDS_MAX_ITEMS + 1 },
            (_, index) => `asset-${index}`
          ),
        })
      )
    ).toBe(false);
  });

  it('épingle le calcul UTF-8 record à max et max + 1 avec des caractères multioctets', () => {
    const atMax = recordAtByteSize(TRACKING_RECORD_MAX_BYTES);
    const overMax = recordAtByteSize(TRACKING_RECORD_MAX_BYTES + 1);

    expect(trackingSerializedBytesV2(atMax)).toBe(TRACKING_RECORD_MAX_BYTES);
    expect(isCanonicalMissionTrackingV2(atMax)).toBe(true);
    expect(trackingSerializedBytesV2(overMax)).toBe(TRACKING_RECORD_MAX_BYTES + 1);
    expect(isCanonicalMissionTrackingV2(overMax)).toBe(false);
  });

  it('épingle les caps UTF-8 envelope et ledger même s’ils gardent une marge sur les sous-schémas', () => {
    const exactEnvelope = { payload: 'é'.repeat((TRACKING_ENVELOPE_MAX_BYTES - 14) / 2) };
    const exactLedger = { payload: 'é'.repeat((TRACKING_LEDGER_MAX_BYTES - 14) / 2) };

    expect(trackingSerializedBytesV2(exactEnvelope)).toBe(TRACKING_ENVELOPE_MAX_BYTES);
    expect(trackingSerializedBytesV2({ payload: `${exactEnvelope.payload}a` })).toBe(
      TRACKING_ENVELOPE_MAX_BYTES + 1
    );
    expect(trackingSerializedBytesV2(exactLedger)).toBe(TRACKING_LEDGER_MAX_BYTES);
    expect(trackingSerializedBytesV2({ payload: `${exactLedger.payload}a` })).toBe(
      TRACKING_LEDGER_MAX_BYTES + 1
    );
  });

  it('rejette histoire non contiguë, transition interdite, temps décroissant, statut divergent et follow-up terminal', () => {
    expect(
      isCanonicalMissionTrackingV2(
        tracking({
          currentStatus: 'selected',
          history: [
            { from: null, to: 'detected', timestamp: 1_000, note: null },
            { from: 'archived', to: 'selected', timestamp: 2_000, note: null },
          ],
        })
      )
    ).toBe(false);
    expect(
      isCanonicalMissionTrackingV2(
        tracking({
          currentStatus: 'offer',
          history: [
            { from: null, to: 'detected', timestamp: 1_000, note: null },
            { from: 'detected', to: 'offer', timestamp: 2_000, note: null },
          ],
        })
      )
    ).toBe(false);
    expect(
      isCanonicalMissionTrackingV2(
        tracking({
          currentStatus: 'archived',
          history: [
            { from: null, to: 'detected', timestamp: 2_000, note: null },
            { from: 'detected', to: 'archived', timestamp: 1_000, note: null },
          ],
        })
      )
    ).toBe(false);
    expect(isCanonicalMissionTrackingV2(tracking({ currentStatus: 'selected' }))).toBe(false);
    expect(
      isCanonicalMissionTrackingV2(
        tracking({
          currentStatus: 'archived',
          history: [
            { from: null, to: 'detected', timestamp: 1_000, note: null },
            { from: 'detected', to: 'archived', timestamp: 2_000, note: null },
          ],
          nextActionAt: '2026-07-20T08:00:00.000Z',
        })
      )
    ).toBe(false);
  });

  it('épingle bissextiles, traversées de jour/année et offset maximal ±14:00', () => {
    expect(canonicalTrackingIsoV2('1900-02-29T00:00:00Z')).toBeNull();
    expect(canonicalTrackingIsoV2('2000-02-29T00:00:00Z')).toBe('2000-02-29T00:00:00.000Z');
    expect(canonicalTrackingIsoV2('2026-01-01T00:30:00+14:00')).toBe('2025-12-31T10:30:00.000Z');
    expect(canonicalTrackingIsoV2('2025-12-31T23:30:00-14:00')).toBe('2026-01-01T13:30:00.000Z');
    expect(canonicalTrackingIsoV2('2026-01-01T00:00:00+14:01')).toBeNull();
    expect(canonicalTrackingIsoV2('2026-01-01T00:00:00-15:00')).toBeNull();
  });
});
