import { z } from 'zod';

import type { AppSettings } from '../../core/types/app-settings';

export const SETTINGS_RELEASE_ENVELOPE_KEY = 'missionpulse_settings_release_v1' as const;
export const SETTINGS_RELEASE_LEGACY_KEYS = ['settings', 'onboarding_completed'] as const;
export const SETTINGS_RELEASE_OUTCOME_LIMIT = 64;
export const SETTINGS_RELEASE_QUEUE_LIMIT = 32;
export const SETTINGS_RELEASE_STARTUP_QUEUE_LIMIT = 8;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const safeCounter = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positiveCounter = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

export type AutoScanExpectation =
  { name: 'auto-scan'; absent: true } | { name: 'auto-scan'; periodInMinutes: number };

export interface SettingsReleaseSnapshot {
  settings: AppSettings;
  onboardingCompleted: boolean;
  revision: number;
  generation: number;
}

export type SettingsReleaseMutationKind = 'save_settings' | 'set_consent' | 'clear_consent';

export type SettingsReleaseOutcome = {
  commandId: string;
  requestId: string;
  intentDigest: string;
  kind: SettingsReleaseMutationKind;
  settledRevision: number;
  settledGeneration: number;
  snapshot: SettingsReleaseSnapshot;
} & (
  | { status: 'committed'; reason: 'committed' | 'recovered_candidate' }
  | {
      status: 'not_committed';
      reason: 'permission_missing' | 'permission_unknown' | 'storage_failed' | 'recovered_previous';
    }
  | { status: 'compensated'; reason: 'permission_lost' | 'effect_compensated' }
);

export interface SettingsReleasePending {
  commandId: string;
  requestId: string;
  intentDigest: string;
  kind: SettingsReleaseMutationKind;
  baseRevision: number;
  previous: { settings: AppSettings; onboardingCompleted: boolean };
  candidate: { settings: AppSettings; onboardingCompleted: boolean };
  previousAlarm: AutoScanExpectation;
  candidateAlarm: AutoScanExpectation;
  phase: 'reserved' | 'prepared' | 'effect_proved' | 'compensating';
  compensationReason: null | 'effect_compensated' | 'permission_lost' | 'recovered_previous';
}

export interface SettingsReleaseEnvelopeV1 {
  version: 1;
  installId: string;
  nextIdentity: number;
  revision: number;
  generation: number;
  scanAckThrough: number;
  catalogFingerprint: string;
  legacyRetirement: 'pending_removal' | 'retired';
  confirmed: { settings: AppSettings; onboardingCompleted: boolean };
  pending: SettingsReleasePending | null;
  outcomes: SettingsReleaseOutcome[];
  outbox: null | {
    broadcastId: string;
    commandId: string;
    reason: 'mutation_settlement' | 'catalog_migration';
    snapshot: SettingsReleaseSnapshot;
  };
  scanAdmission: null | {
    identity: number;
    token: string;
    snapshot: SettingsReleaseSnapshot;
    snapshotDigest: string;
    phase: 'reserved' | 'accepted';
    result: null | { status: 'accepted'; operationId: `missionpulse-scan:${string}:${number}` };
  };
}

export type SettingsReleaseMutationIntent =
  | { kind: 'save_settings'; requestId: string; baseRevision: number; settings: AppSettings }
  | {
      kind: 'set_consent';
      requestId: string;
      baseRevision: number;
      targetConsent: true;
    }
  | {
      kind: 'clear_consent';
      requestId: string;
      baseRevision: number;
      targetConsent: false;
    };

export type SettingsReleaseMutationResult =
  | { status: 'settled'; outcome: SettingsReleaseOutcome }
  | {
      status: 'not_admitted';
      requestId: string;
      commandId: null;
      reason:
        | 'already_confirmed'
        | 'conflict'
        | 'permission_missing'
        | 'permission_unknown'
        | 'storage_failed';
      snapshot: SettingsReleaseSnapshot;
    }
  | {
      status: 'blocked';
      requestId: string;
      commandId: string | null;
      reason:
        | 'identity_exhausted'
        | 'request_identity_conflict'
        | 'actor_blocked'
        | 'storage_ambiguous'
        | 'effect_ambiguous'
        | 'broadcast_ambiguous'
        | 'scan_admission_unknown';
      snapshot: null;
    }
  | SettingsReleaseQueueRejection;

export type SettingsReleaseReadResult =
  | { status: 'confirmed'; snapshot: SettingsReleaseSnapshot }
  | {
      status: 'unavailable';
      reason: 'actor_blocked' | 'storage_ambiguous';
      snapshot: null;
    }
  | SettingsReleaseQueueRejection;

export interface SettingsReleaseQueueRejection {
  status: 'transport_rejected';
  reason: 'queue_full';
  commandType: 'mutation' | 'read' | 'auto_scan_fire';
  correlationId: string | null;
  snapshot: null;
}

const SettingsSchema = z
  .object({
    scanIntervalMinutes: z.number().int().min(1).max(1440),
    enabledConnectors: z.array(z.string().min(1).max(120)).max(128),
    notifications: z.boolean(),
    autoScan: z.boolean(),
    maxSemanticPerScan: z.number().int().min(0).max(100),
    notificationScoreThreshold: z.number().int().min(0).max(100),
    respectRateLimits: z.boolean(),
    customDelayMs: z.number().int().min(0).max(60_000),
    theme: z.enum(['light', 'dark', 'system']),
  })
  .strict();

const LegacySettingsSchema = SettingsSchema.omit({ theme: true }).strict();

const SnapshotSchema = z
  .object({
    settings: SettingsSchema,
    onboardingCompleted: z.boolean(),
    revision: safeCounter,
    generation: safeCounter,
  })
  .strict();

const ConfirmedSchema = z
  .object({ settings: SettingsSchema, onboardingCompleted: z.boolean() })
  .strict();

const AlarmExpectationSchema = z.union([
  z.object({ name: z.literal('auto-scan'), absent: z.literal(true) }).strict(),
  z
    .object({
      name: z.literal('auto-scan'),
      periodInMinutes: z.number().int().min(1).max(1440),
    })
    .strict(),
]);

const OutcomeBaseSchema = z.object({
  commandId: z.string().min(1).max(180),
  requestId: z.string().regex(UUID_PATTERN),
  intentDigest: z.string().regex(SHA256_PATTERN),
  kind: z.enum(['save_settings', 'set_consent', 'clear_consent']),
  settledRevision: positiveCounter,
  settledGeneration: positiveCounter,
  snapshot: SnapshotSchema,
});

const OutcomeSchema = z.discriminatedUnion('status', [
  OutcomeBaseSchema.extend({
    status: z.literal('committed'),
    reason: z.enum(['committed', 'recovered_candidate']),
  }).strict(),
  OutcomeBaseSchema.extend({
    status: z.literal('not_committed'),
    reason: z.enum([
      'permission_missing',
      'permission_unknown',
      'storage_failed',
      'recovered_previous',
    ]),
  }).strict(),
  OutcomeBaseSchema.extend({
    status: z.literal('compensated'),
    reason: z.enum(['permission_lost', 'effect_compensated']),
  }).strict(),
]);

const PendingSchema = z
  .object({
    commandId: z.string().min(1).max(180),
    requestId: z.string().regex(UUID_PATTERN),
    intentDigest: z.string().regex(SHA256_PATTERN),
    kind: z.enum(['save_settings', 'set_consent', 'clear_consent']),
    baseRevision: safeCounter,
    previous: ConfirmedSchema,
    candidate: ConfirmedSchema,
    previousAlarm: AlarmExpectationSchema,
    candidateAlarm: AlarmExpectationSchema,
    phase: z.enum(['reserved', 'prepared', 'effect_proved', 'compensating']),
    compensationReason: z
      .enum(['effect_compensated', 'permission_lost', 'recovered_previous'])
      .nullable(),
  })
  .strict()
  .refine(
    (value) =>
      value.phase === 'compensating'
        ? value.compensationReason !== null
        : value.compensationReason === null,
    { message: 'compensation reason must match phase' }
  );

const OutboxSchema = z
  .object({
    broadcastId: z.string().min(1).max(220),
    commandId: z.string().min(1).max(180),
    reason: z.enum(['mutation_settlement', 'catalog_migration']),
    snapshot: SnapshotSchema,
  })
  .strict();

const ScanAdmissionSchema = z
  .object({
    identity: positiveCounter,
    token: z.string().min(1).max(180),
    snapshot: SnapshotSchema,
    snapshotDigest: z.string().regex(SHA256_PATTERN),
    phase: z.enum(['reserved', 'accepted']),
    result: z
      .object({
        status: z.literal('accepted'),
        operationId: z.string().min(1).max(220),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .refine((value) => (value.phase === 'reserved' ? value.result === null : value.result !== null), {
    message: 'scan result must match phase',
  });

const EnvelopeSchema = z
  .object({
    version: z.literal(1),
    installId: z.string().regex(UUID_PATTERN),
    nextIdentity: positiveCounter,
    revision: safeCounter,
    generation: safeCounter,
    scanAckThrough: safeCounter,
    catalogFingerprint: z.string().regex(SHA256_PATTERN),
    legacyRetirement: z.enum(['pending_removal', 'retired']),
    confirmed: ConfirmedSchema,
    pending: PendingSchema.nullable(),
    outcomes: z.array(OutcomeSchema).max(SETTINGS_RELEASE_OUTCOME_LIMIT),
    outbox: OutboxSchema.nullable(),
    scanAdmission: ScanAdmissionSchema.nullable(),
  })
  .strict();

export function captureSettingsReleaseData(
  value: unknown,
  seen = new Set<object>()
): unknown | null {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  if (typeof value !== 'object' || seen.has(value)) {
    return null;
  }
  seen.add(value);
  try {
    const proto = Object.getPrototypeOf(value);
    if (Array.isArray(value)) {
      if (proto !== Array.prototype) {
        return null;
      }
      const keys = Reflect.ownKeys(value);
      if (keys.some((key) => typeof key !== 'string')) {
        return null;
      }
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
      if (!lengthDescriptor || typeof lengthDescriptor.value !== 'number') {
        return null;
      }
      const expected = new Set([
        'length',
        ...Array.from({ length: value.length }, (_, i) => `${i}`),
      ]);
      if (keys.some((key) => !expected.has(key as string)) || keys.length !== expected.size) {
        return null;
      }
      const result: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, `${index}`);
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
          return null;
        }
        const captured = captureSettingsReleaseData(descriptor.value, seen);
        if (captured === null && descriptor.value !== null) {
          return null;
        }
        result.push(captured);
      }
      return result;
    }
    if (proto !== Object.prototype && proto !== null) {
      return null;
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== 'string')) {
      return null;
    }
    const result: Record<string, unknown> = {};
    for (const key of keys as string[]) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
        return null;
      }
      const captured = captureSettingsReleaseData(descriptor.value, seen);
      if (captured === null && descriptor.value !== null) {
        return null;
      }
      result[key] = captured;
    }
    return result;
  } catch {
    return null;
  } finally {
    seen.delete(value);
  }
}

function connectorOrderIsCanonical(ids: readonly string[], catalog: readonly string[]): boolean {
  if (new Set(ids).size !== ids.length) {
    return false;
  }
  const indexes = ids.map((id) => catalog.indexOf(id));
  return (
    indexes.every((index) => index >= 0) &&
    indexes.every((index, i) => i === 0 || indexes[i - 1] < index)
  );
}

export function normalizeReleaseSettings(
  raw: unknown,
  recognizedConnectorIds: readonly string[],
  includedConnectorIds: readonly string[]
): AppSettings | null {
  const detached = captureSettingsReleaseData(raw);
  const parsedNine = SettingsSchema.safeParse(detached);
  const parsedEight = LegacySettingsSchema.safeParse(detached);
  const settings = parsedNine.success
    ? parsedNine.data
    : parsedEight.success
      ? { ...parsedEight.data, theme: 'system' as const }
      : null;
  if (!settings || !connectorOrderIsCanonical(settings.enabledConnectors, recognizedConnectorIds)) {
    return null;
  }
  const included = new Set(includedConnectorIds);
  return {
    ...settings,
    enabledConnectors: includedConnectorIds.filter(
      (id) => included.has(id) && settings.enabledConnectors.includes(id)
    ),
  };
}

function validateNestedSettings(
  envelope: SettingsReleaseEnvelopeV1,
  recognizedConnectorIds: readonly string[],
  includedConnectorIds: readonly string[]
): boolean {
  const settingsValues: AppSettings[] = [envelope.confirmed.settings];
  if (envelope.pending) {
    settingsValues.push(envelope.pending.previous.settings, envelope.pending.candidate.settings);
  }
  for (const outcome of envelope.outcomes) {
    settingsValues.push(outcome.snapshot.settings);
  }
  if (envelope.outbox) {
    settingsValues.push(envelope.outbox.snapshot.settings);
  }
  if (envelope.scanAdmission) {
    settingsValues.push(envelope.scanAdmission.snapshot.settings);
  }
  return settingsValues.every((settings) => {
    const normalized = normalizeReleaseSettings(
      settings,
      recognizedConnectorIds,
      includedConnectorIds
    );
    return normalized !== null && sameSettings(normalized, settings);
  });
}

function commandIdentity(commandId: string, installId: string): number | null {
  const prefix = `settings-release:${installId}:`;
  if (!commandId.startsWith(prefix) || !commandId.endsWith(':command')) {
    return null;
  }
  const raw = commandId.slice(prefix.length, -':command'.length);
  if (!/^[1-9]\d*$/.test(raw)) {
    return null;
  }
  const identity = Number(raw);
  return Number.isSafeInteger(identity) && identity > 0 && String(identity) === raw
    ? identity
    : null;
}

function scanIdentity(token: string, installId: string): number | null {
  const prefix = `settings-release:${installId}:`;
  if (!token.startsWith(prefix) || !token.endsWith(':scan')) {
    return null;
  }
  const raw = token.slice(prefix.length, -':scan'.length);
  if (!/^[1-9]\d*$/.test(raw)) {
    return null;
  }
  const identity = Number(raw);
  return Number.isSafeInteger(identity) && identity > 0 && String(identity) === raw
    ? identity
    : null;
}

function sameConfirmed(
  left: { settings: AppSettings; onboardingCompleted: boolean },
  right: { settings: AppSettings; onboardingCompleted: boolean }
): boolean {
  return (
    left.onboardingCompleted === right.onboardingCompleted &&
    sameSettings(left.settings, right.settings)
  );
}

function validateEnvelopeRelations(envelope: SettingsReleaseEnvelopeV1): boolean {
  const commandIdentities: number[] = [];
  const requestIds: string[] = [];

  if (envelope.pending) {
    const pendingIdentity = commandIdentity(envelope.pending.commandId, envelope.installId);
    if (pendingIdentity === null) {
      return false;
    }
    commandIdentities.push(pendingIdentity);
    requestIds.push(envelope.pending.requestId);
    if (
      envelope.pending.baseRevision !== envelope.revision ||
      !sameConfirmed(envelope.pending.previous, envelope.confirmed)
    ) {
      return false;
    }
    if (envelope.pending.kind === 'save_settings') {
      if (
        envelope.pending.candidate.onboardingCompleted !==
        envelope.pending.previous.onboardingCompleted
      ) {
        return false;
      }
    } else if (
      !sameSettings(envelope.pending.candidate.settings, envelope.pending.previous.settings) ||
      envelope.pending.candidate.onboardingCompleted !== (envelope.pending.kind === 'set_consent')
    ) {
      return false;
    }
    if (
      JSON.stringify(envelope.pending.previousAlarm) !==
        JSON.stringify(expectedAutoScanAlarm(envelope.pending.previous)) ||
      JSON.stringify(envelope.pending.candidateAlarm) !==
        JSON.stringify(expectedAutoScanAlarm(envelope.pending.candidate))
    ) {
      return false;
    }
  }

  let lastRevision = -1;
  let lastGeneration = -1;
  for (const outcome of envelope.outcomes) {
    const identity = commandIdentity(outcome.commandId, envelope.installId);
    if (identity === null) {
      return false;
    }
    commandIdentities.push(identity);
    requestIds.push(outcome.requestId);
    if (
      outcome.settledRevision !== outcome.snapshot.revision ||
      outcome.settledGeneration !== outcome.snapshot.generation ||
      outcome.settledRevision > envelope.revision ||
      outcome.settledGeneration > envelope.generation ||
      outcome.settledRevision < lastRevision ||
      (outcome.settledRevision === lastRevision && outcome.settledGeneration <= lastGeneration)
    ) {
      return false;
    }
    lastRevision = outcome.settledRevision;
    lastGeneration = outcome.settledGeneration;
  }

  if (new Set(requestIds).size !== requestIds.length) {
    return false;
  }
  if (new Set(commandIdentities).size !== commandIdentities.length) {
    return false;
  }

  if (envelope.outbox) {
    const outbox = envelope.outbox;
    const identity = commandIdentity(outbox.commandId, envelope.installId);
    if (identity === null || outbox.broadcastId !== `${outbox.commandId}:broadcast`) {
      return false;
    }
    commandIdentities.push(identity);
    if (outbox.reason === 'mutation_settlement') {
      const matching = envelope.outcomes.find((outcome) => outcome.commandId === outbox.commandId);
      if (!matching || !sameSnapshot(matching.snapshot, outbox.snapshot)) {
        return false;
      }
    } else if (
      outbox.snapshot.revision !== envelope.revision ||
      outbox.snapshot.generation !== envelope.generation ||
      !sameConfirmed(outbox.snapshot, envelope.confirmed)
    ) {
      return false;
    }
  }

  if (envelope.scanAdmission) {
    const identity = scanIdentity(envelope.scanAdmission.token, envelope.installId);
    if (
      identity === null ||
      identity !== envelope.scanAdmission.identity ||
      identity <= envelope.scanAckThrough ||
      commandIdentities.includes(identity)
    ) {
      return false;
    }
    commandIdentities.push(identity);
    const expectedGeneration =
      envelope.scanAdmission.phase === 'reserved'
        ? envelope.generation - 1
        : envelope.generation - 2;
    if (
      envelope.scanAdmission.snapshot.revision !== envelope.revision ||
      envelope.scanAdmission.snapshot.generation !== expectedGeneration ||
      !sameConfirmed(envelope.scanAdmission.snapshot, envelope.confirmed)
    ) {
      return false;
    }
    if (
      envelope.scanAdmission.result &&
      envelope.scanAdmission.result.operationId !==
        `missionpulse-scan:${envelope.installId}:${identity}`
    ) {
      return false;
    }
  }

  if (commandIdentities.some((identity) => identity >= envelope.nextIdentity)) {
    return false;
  }
  if (envelope.scanAckThrough >= envelope.nextIdentity) {
    return false;
  }
  return true;
}

export function decodeSettingsReleaseEnvelope(
  raw: unknown,
  recognizedConnectorIds: readonly string[],
  includedConnectorIds: readonly string[]
): SettingsReleaseEnvelopeV1 | null {
  const detached = captureSettingsReleaseData(raw);
  const parsed = EnvelopeSchema.safeParse(detached);
  if (!parsed.success) {
    return null;
  }
  const envelope = parsed.data as SettingsReleaseEnvelopeV1;
  if ([envelope.pending, envelope.outbox, envelope.scanAdmission].filter(Boolean).length > 1) {
    return null;
  }
  if (!validateNestedSettings(envelope, recognizedConnectorIds, includedConnectorIds)) {
    return null;
  }
  if (!validateEnvelopeRelations(envelope)) {
    return null;
  }
  return structuredClone(envelope);
}

export function settingsReleaseSnapshot(
  envelope: SettingsReleaseEnvelopeV1
): SettingsReleaseSnapshot {
  return {
    settings: structuredClone(envelope.confirmed.settings),
    onboardingCompleted: envelope.confirmed.onboardingCompleted,
    revision: envelope.revision,
    generation: envelope.generation,
  };
}

export function decodeSettingsReleaseSnapshot(
  raw: unknown,
  includedConnectorIds: readonly string[]
): SettingsReleaseSnapshot | null {
  const detached = captureSettingsReleaseData(raw);
  const parsed = SnapshotSchema.safeParse(detached);
  if (!parsed.success) {
    return null;
  }
  const normalized = normalizeReleaseSettings(
    parsed.data.settings,
    includedConnectorIds,
    includedConnectorIds
  );
  if (!normalized || !sameSettings(normalized, parsed.data.settings)) {
    return null;
  }
  return structuredClone(parsed.data as SettingsReleaseSnapshot);
}

export function expectedAutoScanAlarm(state: {
  settings: AppSettings;
  onboardingCompleted: boolean;
}): AutoScanExpectation {
  return state.onboardingCompleted && state.settings.autoScan
    ? { name: 'auto-scan', periodInMinutes: state.settings.scanIntervalMinutes }
    : { name: 'auto-scan', absent: true };
}

export function compareSettingsReleaseTuple(
  left: Pick<SettingsReleaseSnapshot, 'revision' | 'generation'>,
  right: Pick<SettingsReleaseSnapshot, 'revision' | 'generation'>
): -1 | 0 | 1 {
  if (left.revision !== right.revision) {
    return left.revision < right.revision ? -1 : 1;
  }
  if (left.generation !== right.generation) {
    return left.generation < right.generation ? -1 : 1;
  }
  return 0;
}

export function sameSettings(left: AppSettings, right: AppSettings): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function sameSnapshot(
  left: SettingsReleaseSnapshot,
  right: SettingsReleaseSnapshot
): boolean {
  return (
    left.onboardingCompleted === right.onboardingCompleted &&
    left.revision === right.revision &&
    left.generation === right.generation &&
    sameSettings(left.settings, right.settings)
  );
}

export function mergeSettingsReleaseSnapshot(
  current: SettingsReleaseSnapshot | null,
  incoming: SettingsReleaseSnapshot
): {
  status: 'accepted' | 'duplicate' | 'rejected_older' | 'content_conflict';
  snapshot: SettingsReleaseSnapshot;
} {
  if (current === null) {
    return { status: 'accepted', snapshot: structuredClone(incoming) };
  }
  const order = compareSettingsReleaseTuple(incoming, current);
  if (order > 0) {
    return { status: 'accepted', snapshot: structuredClone(incoming) };
  }
  if (order < 0) {
    return { status: 'rejected_older', snapshot: structuredClone(current) };
  }
  return sameSnapshot(current, incoming)
    ? { status: 'duplicate', snapshot: structuredClone(current) }
    : { status: 'content_conflict', snapshot: structuredClone(current) };
}

async function sha256Utf8(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function settingsReleaseIntentDigest(
  intent: SettingsReleaseMutationIntent
): Promise<string> {
  const payload = [
    'missionpulse-settings-release-intent',
    1,
    intent.kind,
    intent.baseRevision,
    intent.kind === 'save_settings'
      ? [
          intent.settings.scanIntervalMinutes,
          intent.settings.enabledConnectors,
          intent.settings.notifications,
          intent.settings.autoScan,
          intent.settings.maxSemanticPerScan,
          intent.settings.notificationScoreThreshold,
          intent.settings.respectRateLimits,
          intent.settings.customDelayMs,
          intent.settings.theme,
        ]
      : intent.targetConsent,
  ];
  return sha256Utf8(JSON.stringify(payload));
}

export async function settingsReleaseScanDigest(
  snapshot: SettingsReleaseSnapshot
): Promise<string> {
  const { settings } = snapshot;
  return sha256Utf8(
    JSON.stringify([
      'missionpulse-settings-release-scan-snapshot',
      1,
      snapshot.revision,
      snapshot.generation,
      snapshot.onboardingCompleted,
      [
        settings.scanIntervalMinutes,
        settings.enabledConnectors,
        settings.notifications,
        settings.autoScan,
        settings.maxSemanticPerScan,
        settings.notificationScoreThreshold,
        settings.respectRateLimits,
        settings.customDelayMs,
        settings.theme,
      ],
    ])
  );
}

export async function connectorCatalogFingerprint(
  tuples: readonly (readonly [string, boolean, readonly string[]])[]
): Promise<string> {
  return sha256Utf8(
    JSON.stringify([
      'missionpulse-connector-catalog',
      1,
      tuples.map(([id, included, permissions]) => [id, included, [...permissions].sort()]),
    ])
  );
}

export function isReleaseUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function sameEnvelope(
  left: SettingsReleaseEnvelopeV1,
  right: SettingsReleaseEnvelopeV1
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
