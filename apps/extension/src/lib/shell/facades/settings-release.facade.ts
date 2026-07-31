import type { AppSettings } from '$lib/core/types/app-settings';
import { CANONICAL_INCLUDED_CONNECTOR_IDS } from '$lib/shell/connectors/build-config';
import { sendMessage, subscribeMessages, type BridgeMessage } from '$lib/shell/messaging/bridge';
import { validateMessage } from '$lib/shell/messaging/schemas';
import {
  captureSettingsReleaseData,
  decodeSettingsReleaseSnapshot,
  mergeSettingsReleaseSnapshot,
  type SettingsReleaseMutationIntent,
  type SettingsReleaseMutationResult,
  type SettingsReleaseSnapshot,
} from '$lib/shell/settings-release/settings-release.contract';

let accepted: SettingsReleaseSnapshot | null = null;
let subscribed = false;
const snapshotListeners = new Set<(snapshot: SettingsReleaseSnapshot) => void>();

export class SettingsReleaseMutationError extends Error {
  constructor(readonly result: SettingsReleaseMutationResult) {
    super(`Settings mutation was not committed: ${result.status}.`);
    this.name = 'SettingsReleaseMutationError';
  }
}

function validatedMessage(raw: unknown, expectedType: string): { type: string; payload?: unknown } {
  const captured = captureSettingsReleaseData(raw);
  if (captured === null) {
    throw new Error('Settings bridge payload is not detached data.');
  }
  const validation = validateMessage(captured);
  if (!validation.valid || validation.message.type !== expectedType) {
    throw new Error(`Invalid Settings bridge response for ${expectedType}.`);
  }
  return validation.message;
}

function parseReadResponse(raw: unknown) {
  return validatedMessage(raw, 'SETTINGS_RELEASE_RESULT')
    .payload as import('$lib/shell/settings-release/settings-release.contract').SettingsReleaseReadResult;
}

function parseMutationResponse(raw: unknown): SettingsReleaseMutationResult {
  return validatedMessage(raw, 'SETTINGS_RELEASE_MUTATION_RESULT')
    .payload as SettingsReleaseMutationResult;
}

function acceptSnapshot(snapshot: SettingsReleaseSnapshot): SettingsReleaseSnapshot {
  const decoded = decodeSettingsReleaseSnapshot(snapshot, CANONICAL_INCLUDED_CONNECTOR_IDS);
  if (!decoded) {
    throw new Error('Settings snapshot is not strict current-catalogue data.');
  }
  const merged = mergeSettingsReleaseSnapshot(accepted, decoded);
  if (merged.status === 'content_conflict') {
    throw new Error('Settings snapshot content conflicts at an equal revision/generation.');
  }
  accepted = merged.snapshot;
  if (merged.status === 'accepted') {
    for (const listener of snapshotListeners) {
      listener(structuredClone(merged.snapshot));
    }
  }
  return structuredClone(merged.snapshot);
}

function ensureSubscription(): void {
  if (subscribed) {
    return;
  }
  subscribed = true;
  subscribeMessages((rawMessage) => {
    try {
      const message = validatedMessage(rawMessage, 'SETTINGS_RELEASE_UPDATED') as {
        type: 'SETTINGS_RELEASE_UPDATED';
        payload: { snapshot: SettingsReleaseSnapshot; commandId: string; broadcastId: string };
      };
      try {
        acceptSnapshot(message.payload.snapshot);
      } catch {
        // A conflicting equal tuple is never projected. The next explicit GET
        // remains the recovery boundary for this panel.
      }
    } catch {
      // Unknown or hostile broadcasts never enter the tuple merge.
    }
  });
}

export async function getSettingsReleaseSnapshot(): Promise<SettingsReleaseSnapshot> {
  ensureSubscription();
  const result = parseReadResponse(await sendMessage({ type: 'GET_SETTINGS_RELEASE' }));
  if (result.status !== 'confirmed') {
    throw new Error('Settings release snapshot unavailable.');
  }
  return acceptSnapshot(result.snapshot);
}

export function peekSettingsReleaseSnapshot(): SettingsReleaseSnapshot | null {
  return accepted ? structuredClone(accepted) : null;
}

export function subscribeSettingsReleaseSnapshots(
  listener: (snapshot: SettingsReleaseSnapshot) => void
): () => void {
  ensureSubscription();
  snapshotListeners.add(listener);
  if (accepted) {
    listener(structuredClone(accepted));
  }
  return () => snapshotListeners.delete(listener);
}

export async function mutateSettingsRelease(
  buildIntent: (snapshot: SettingsReleaseSnapshot) => SettingsReleaseMutationIntent
): Promise<SettingsReleaseMutationResult> {
  const base = accepted ?? (await getSettingsReleaseSnapshot());
  const capturedIntent = captureSettingsReleaseData(buildIntent(structuredClone(base)));
  if (capturedIntent === null) {
    throw new Error('Settings mutation intent is not detached data.');
  }
  const validation = validateMessage({
    type: 'MUTATE_SETTINGS_RELEASE',
    payload: capturedIntent,
  });
  if (!validation.valid || validation.message.type !== 'MUTATE_SETTINGS_RELEASE') {
    throw new Error('Settings mutation intent is not strict protocol data.');
  }
  type MutationMessage = Extract<BridgeMessage, { type: 'MUTATE_SETTINGS_RELEASE' }>;
  const detachedMessage = validation.message as MutationMessage;
  const intent = detachedMessage.payload;
  const immutableMessageBytes = JSON.stringify(detachedMessage);
  const messageForSend = (): MutationMessage =>
    JSON.parse(immutableMessageBytes) as MutationMessage;
  let raw: unknown;
  try {
    raw = await sendMessage(messageForSend());
  } catch {
    const retry = validatedMessage(
      await sendMessage({ type: 'RETRY_SETTINGS_RELEASE' }),
      'SETTINGS_RELEASE_RETRY_RESULT'
    ).payload as {
      status: 'retry_accepted' | 'retry_already_queued' | 'retry_not_applicable';
      snapshot: null;
    };
    if (!retry || retry.snapshot !== null) {
      throw new Error('Settings retry control failed.');
    }
    await getSettingsReleaseSnapshot();
    raw = await sendMessage(messageForSend());
  }
  const result = parseMutationResponse(raw);
  const correlatedRequestId =
    result.status === 'settled'
      ? result.outcome.requestId
      : result.status === 'transport_rejected'
        ? result.correlationId
        : result.requestId;
  if (correlatedRequestId !== intent.requestId) {
    throw new Error('Settings mutation correlation mismatch.');
  }
  if (
    result.status === 'settled' &&
    (result.outcome.kind !== intent.kind ||
      result.outcome.settledRevision !== result.outcome.snapshot.revision ||
      result.outcome.settledGeneration !== result.outcome.snapshot.generation)
  ) {
    throw new Error('Settings mutation settlement is inconsistent.');
  }
  if (result.status === 'settled') {
    acceptSnapshot(result.outcome.snapshot);
  } else if (result.status === 'not_admitted') {
    acceptSnapshot(result.snapshot);
  }
  return result;
}

export async function saveSettingsRelease(settings: AppSettings): Promise<SettingsReleaseSnapshot> {
  const result = await mutateSettingsRelease((snapshot) => ({
    kind: 'save_settings',
    requestId: crypto.randomUUID(),
    baseRevision: snapshot.revision,
    settings,
  }));
  if (result.status === 'not_admitted' && result.reason === 'already_confirmed') {
    return structuredClone(accepted ?? result.snapshot);
  }
  if (result.status !== 'settled' || result.outcome.status !== 'committed') {
    throw new SettingsReleaseMutationError(result);
  }
  return structuredClone(accepted ?? result.outcome.snapshot);
}

export async function setOnboardingConsentRelease(
  targetConsent: boolean
): Promise<SettingsReleaseSnapshot> {
  const result = await mutateSettingsRelease((snapshot) =>
    targetConsent
      ? {
          kind: 'set_consent',
          requestId: crypto.randomUUID(),
          baseRevision: snapshot.revision,
          targetConsent: true,
        }
      : {
          kind: 'clear_consent',
          requestId: crypto.randomUUID(),
          baseRevision: snapshot.revision,
          targetConsent: false,
        }
  );
  if (result.status === 'not_admitted' && result.reason === 'already_confirmed') {
    return structuredClone(accepted ?? result.snapshot);
  }
  if (result.status !== 'settled' || result.outcome.status !== 'committed') {
    throw new SettingsReleaseMutationError(result);
  }
  return structuredClone(accepted ?? result.outcome.snapshot);
}

export function resetSettingsReleaseFacadeForTests(): void {
  if (import.meta.env.MODE !== 'test') {
    throw new Error('Test-only facade reset.');
  }
  accepted = null;
  subscribed = false;
  snapshotListeners.clear();
}
