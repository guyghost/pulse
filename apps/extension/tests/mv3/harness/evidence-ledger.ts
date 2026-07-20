import { createHash } from 'node:crypto';

type EvidenceChannel = 'diagnostic' | 'protocolCommand' | 'nestedCdp';
type AuthorityMapName =
  'registration' | 'version' | 'target' | 'session' | 'executionContext' | 'attachment';
type PendingCommandKind = 'operational' | 'cleanup';

interface StructureLimit {
  readonly maxEntries: number;
  readonly maxEntryJcsBytes: number;
  readonly maxTotalJcsBytes: number;
}

export const MV3_LEDGER_LIMITS = Object.freeze({
  evidence: Object.freeze({
    maxItems: 4_096,
    maxItemJcsBytes: 65_536,
    maxTotalJcsBytes: 4_194_304,
  }),
  maps: Object.freeze({
    registration: Object.freeze({
      maxEntries: 64,
      maxEntryJcsBytes: 4_096,
      maxTotalJcsBytes: 262_144,
    }),
    version: Object.freeze({
      maxEntries: 256,
      maxEntryJcsBytes: 4_096,
      maxTotalJcsBytes: 1_048_576,
    }),
    target: Object.freeze({
      maxEntries: 1_024,
      maxEntryJcsBytes: 4_096,
      maxTotalJcsBytes: 4_194_304,
    }),
    session: Object.freeze({
      maxEntries: 1_024,
      maxEntryJcsBytes: 4_096,
      maxTotalJcsBytes: 4_194_304,
    }),
    executionContext: Object.freeze({
      maxEntries: 4_096,
      maxEntryJcsBytes: 2_048,
      maxTotalJcsBytes: 8_388_608,
    }),
    attachment: Object.freeze({
      maxEntries: 1_024,
      maxEntryJcsBytes: 8_192,
      maxTotalJcsBytes: 8_388_608,
    }),
  }),
  pendingCommands: Object.freeze({
    maxTotal: 256,
    maxOperational: 224,
    reservedCleanup: 32,
    maxEntryJcsBytes: 2_048,
    maxTotalJcsBytes: 524_288,
  }),
});

export interface EvidenceOverflowEvent {
  readonly type: 'EVIDENCE_OVERFLOW_RECORDED';
  readonly structure: string;
}

export type LedgerDecision =
  { readonly accepted: true } | { readonly accepted: false; readonly event: EvidenceOverflowEvent };

export interface PendingCommandInput {
  readonly commandId: string;
  readonly kind: PendingCommandKind;
  readonly method: string;
}

interface BoundedState {
  observedCount: number;
  observedJcsBytes: number;
  retainedCount: number;
  retainedJcsBytes: number;
  overflowCount: number;
  chainSha256: string;
}

interface MapState extends BoundedState {
  readonly entries: Map<string, { readonly jcsBytes: number }>;
}

interface PendingCommandState {
  readonly entries: Map<string, { readonly kind: PendingCommandKind; readonly jcsBytes: number }>;
  operationalCount: number;
  cleanupCount: number;
  totalJcsBytes: number;
  cleanupSerialized: boolean;
  chainSha256: string;
}

const ZERO_HASH = '0'.repeat(64);
const MAX_ID_UTF8_BYTES = 512;

function createBoundedState(): BoundedState {
  return {
    observedCount: 0,
    observedJcsBytes: 0,
    retainedCount: 0,
    retainedJcsBytes: 0,
    overflowCount: 0,
    chainSha256: ZERO_HASH,
  };
}

function createMapState(): MapState {
  return { ...createBoundedState(), entries: new Map() };
}

function canonicalize(value: unknown, ancestors = new Set<object>()): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Evidence numbers must be finite.');
    }
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new TypeError(`Unsupported evidence value: ${typeof value}.`);
  }
  if (ancestors.has(value)) {
    throw new TypeError('Cyclic evidence is forbidden.');
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalize(item, ancestors)).join(',')}]`;
    }
    const record = value as Record<string, unknown>;
    const prototype = Object.getPrototypeOf(record);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Evidence objects must be plain records.');
    }
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key], ancestors)}`)
      .join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function advanceHash(previousHex: string, itemJcs: string, itemBytes: number): string {
  const length = new Uint8Array(8);
  new DataView(length.buffer).setBigUint64(0, BigInt(itemBytes), false);
  const itemDigest = createHash('sha256').update(itemJcs, 'utf8').digest();
  return createHash('sha256')
    .update(Buffer.from(previousHex, 'hex'))
    .update(length)
    .update(itemDigest)
    .digest('hex');
}

function overflow(structure: string): LedgerDecision {
  return {
    accepted: false,
    event: { type: 'EVIDENCE_OVERFLOW_RECORDED', structure },
  };
}

function snapshotBounded(state: BoundedState) {
  return Object.freeze({
    observedCount: state.observedCount,
    observedJcsBytes: state.observedJcsBytes,
    retainedCount: state.retainedCount,
    retainedJcsBytes: state.retainedJcsBytes,
    overflowCount: state.overflowCount,
    chainSha256: state.chainSha256,
  });
}

export function createEvidenceLedger() {
  const accumulators: Record<EvidenceChannel, BoundedState> = {
    diagnostic: createBoundedState(),
    protocolCommand: createBoundedState(),
    nestedCdp: createBoundedState(),
  };
  const maps: Record<AuthorityMapName, MapState> = {
    registration: createMapState(),
    version: createMapState(),
    target: createMapState(),
    session: createMapState(),
    executionContext: createMapState(),
    attachment: createMapState(),
  };
  const pending: PendingCommandState = {
    entries: new Map(),
    operationalCount: 0,
    cleanupCount: 0,
    totalJcsBytes: 0,
    cleanupSerialized: false,
    chainSha256: ZERO_HASH,
  };
  let verdict: 'eligible' | 'blocked' = 'eligible';
  let lifecycleDirective: 'failed_releasing' | null = null;

  function block(): void {
    verdict = 'blocked';
  }

  function failRelease(): void {
    block();
    lifecycleDirective = 'failed_releasing';
  }

  function appendEvidence(channel: EvidenceChannel, value: unknown): LedgerDecision {
    const state = accumulators[channel];
    const jcs = canonicalize(value);
    const bytes = utf8Bytes(jcs);
    state.observedCount += 1;
    state.observedJcsBytes += bytes;
    state.chainSha256 = advanceHash(state.chainSha256, jcs, bytes);
    const exceedsLimit =
      bytes > MV3_LEDGER_LIMITS.evidence.maxItemJcsBytes ||
      state.retainedCount >= MV3_LEDGER_LIMITS.evidence.maxItems ||
      state.retainedJcsBytes + bytes > MV3_LEDGER_LIMITS.evidence.maxTotalJcsBytes;
    if (exceedsLimit) {
      state.overflowCount += 1;
      block();
      return overflow(channel);
    }
    state.retainedCount += 1;
    state.retainedJcsBytes += bytes;
    return { accepted: true };
  }

  function setAuthorityEntry(
    mapName: AuthorityMapName,
    key: string,
    value: unknown
  ): LedgerDecision {
    if (key.length === 0 || /[\0\r\n]/u.test(key) || utf8Bytes(key) > MAX_ID_UTF8_BYTES) {
      failRelease();
      return overflow(mapName);
    }
    const state = maps[mapName];
    const jcs = canonicalize({ key, value });
    const bytes = utf8Bytes(jcs);
    state.observedCount += 1;
    state.observedJcsBytes += bytes;
    state.chainSha256 = advanceHash(state.chainSha256, jcs, bytes);
    const previous = state.entries.get(key);
    const projectedEntries = previous === undefined ? state.entries.size + 1 : state.entries.size;
    const projectedBytes = state.retainedJcsBytes - (previous?.jcsBytes ?? 0) + bytes;
    const limit: StructureLimit = MV3_LEDGER_LIMITS.maps[mapName];
    if (
      bytes > limit.maxEntryJcsBytes ||
      projectedEntries > limit.maxEntries ||
      projectedBytes > limit.maxTotalJcsBytes
    ) {
      state.overflowCount += 1;
      failRelease();
      return overflow(mapName);
    }
    state.entries.set(key, { jcsBytes: bytes });
    state.retainedCount = state.entries.size;
    state.retainedJcsBytes = projectedBytes;
    return { accepted: true };
  }

  function reservePendingCommand(command: PendingCommandInput): LedgerDecision {
    const jcs = canonicalize(command);
    const bytes = utf8Bytes(jcs);
    const operationalLimitReached =
      command.kind === 'operational' &&
      pending.operationalCount >= MV3_LEDGER_LIMITS.pendingCommands.maxOperational;
    const cleanupLimitReached =
      command.kind === 'cleanup' &&
      (pending.cleanupCount >= MV3_LEDGER_LIMITS.pendingCommands.reservedCleanup ||
        (pending.cleanupSerialized && pending.cleanupCount >= 1));
    const exceedsLimit =
      command.commandId.length === 0 ||
      /[\0\r\n]/u.test(command.commandId) ||
      utf8Bytes(command.commandId) > MAX_ID_UTF8_BYTES ||
      pending.entries.has(command.commandId) ||
      bytes > MV3_LEDGER_LIMITS.pendingCommands.maxEntryJcsBytes ||
      pending.entries.size >= MV3_LEDGER_LIMITS.pendingCommands.maxTotal ||
      pending.totalJcsBytes + bytes > MV3_LEDGER_LIMITS.pendingCommands.maxTotalJcsBytes ||
      operationalLimitReached ||
      cleanupLimitReached;

    pending.chainSha256 = advanceHash(pending.chainSha256, jcs, bytes);
    if (exceedsLimit) {
      pending.cleanupSerialized = true;
      failRelease();
      return overflow('pendingCommands');
    }
    pending.entries.set(command.commandId, { kind: command.kind, jcsBytes: bytes });
    pending.totalJcsBytes += bytes;
    if (command.kind === 'operational') {
      pending.operationalCount += 1;
    } else {
      pending.cleanupCount += 1;
    }
    return { accepted: true };
  }

  function releasePendingCommand(commandId: string): boolean {
    const retained = pending.entries.get(commandId);
    if (retained === undefined) {
      return false;
    }
    pending.entries.delete(commandId);
    pending.totalJcsBytes -= retained.jcsBytes;
    if (retained.kind === 'operational') {
      pending.operationalCount -= 1;
    } else {
      pending.cleanupCount -= 1;
    }
    return true;
  }

  function snapshot() {
    return Object.freeze({
      verdict,
      lifecycleDirective,
      accumulators: Object.freeze({
        diagnostic: snapshotBounded(accumulators.diagnostic),
        protocolCommand: snapshotBounded(accumulators.protocolCommand),
        nestedCdp: snapshotBounded(accumulators.nestedCdp),
      }),
      maps: Object.freeze({
        registration: snapshotBounded(maps.registration),
        version: snapshotBounded(maps.version),
        target: snapshotBounded(maps.target),
        session: snapshotBounded(maps.session),
        executionContext: snapshotBounded(maps.executionContext),
        attachment: snapshotBounded(maps.attachment),
      }),
      pendingCommands: Object.freeze({
        operationalCount: pending.operationalCount,
        cleanupCount: pending.cleanupCount,
        totalCount: pending.entries.size,
        totalJcsBytes: pending.totalJcsBytes,
        cleanupSerialized: pending.cleanupSerialized,
        chainSha256: pending.chainSha256,
      }),
    });
  }

  return Object.freeze({
    appendEvidence,
    setAuthorityEntry,
    reservePendingCommand,
    releasePendingCommand,
    snapshot,
  });
}
