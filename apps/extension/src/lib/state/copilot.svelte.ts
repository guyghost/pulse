import {
  COPILOT_MISSION_FIELD_ALLOWLIST,
  COPILOT_PROFILE_FIELD_ALLOWLIST,
  type CopilotMissionField,
  type CopilotOperationKind,
  type CopilotProfileField,
  type PremiumEntitlementStateValue,
} from '@pulse/domain';

import type { UserProfile } from '$lib/core/types/profile';
import type {
  CopilotDeletionReceipt,
  CopilotDossierProjection,
  CopilotEntitlement,
  CopilotError,
  CopilotJobSnapshot,
} from '$lib/shell/copilot/contracts';
import { isCopilotRolloutEnabled } from '$lib/shell/copilot/config';
import { sendMessage, type BridgeMessage } from '$lib/shell/messaging/bridge';
import { validateMessage } from '$lib/shell/messaging/schemas';

const DEFAULT_MISSION_FIELDS: readonly CopilotMissionField[] = [
  'title',
  'description',
  'stack',
  'displayedTjm',
];
const DEFAULT_PROFILE_FIELDS: readonly CopilotProfileField[] = [
  'jobTitle',
  'seniority',
  'keywords',
  'tjmBounds',
];
const POLLING_STATUSES = new Set<CopilotJobSnapshot['status']>([
  'checkpointed',
  'queued',
  'running',
  'cancelling',
]);
const DELETABLE_JOB_STATUSES = new Set<CopilotJobSnapshot['status']>([
  'accepted',
  'rejected',
  'failed',
  'cancelled',
]);

export type CopilotAccessState =
  'loading' | 'disabled' | 'unlinked' | 'free' | 'active' | 'expired' | 'revoked' | 'error';

export interface CopilotEvidenceOption {
  id: string;
  label: string;
  excerpt: string;
}

export interface CopilotStoreDependencies {
  rolloutEnabled: boolean;
  send(message: BridgeMessage): Promise<unknown>;
  randomUUID(): string;
  setTimer(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimer(timer: ReturnType<typeof setTimeout>): void;
  pollIntervalMs: number;
}

const DEFAULT_DEPENDENCIES: CopilotStoreDependencies = {
  rolloutEnabled: isCopilotRolloutEnabled(),
  send: (message) => sendMessage(message),
  randomUUID: () => crypto.randomUUID(),
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: (timer) => clearTimeout(timer),
  pollIntervalMs: 2_500,
};

function localError(code: CopilotError['code'], message: string, retryable = false): CopilotError {
  return { code, message, retryable };
}

function evidenceOptions(profile: UserProfile | null): CopilotEvidenceOption[] {
  if (!profile) {
    return [];
  }
  return profile.experiences
    .filter((experience) => experience.title.trim() && experience.description.trim())
    .map((experience) => ({
      id: experience.id,
      label: [experience.title, experience.company].filter(Boolean).join(' · '),
      excerpt: experience.description.trim().slice(0, 240),
    }));
}

export function createCopilotStore(overrides: Partial<CopilotStoreDependencies> = {}) {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  let missionId = $state<string | null>(null);
  let accessState = $state<CopilotAccessState>('loading');
  let entitlement = $state<CopilotEntitlement | null>(null);
  let dossier = $state<CopilotDossierProjection | null>(null);
  let dossierReadState = $state<'idle' | 'loading' | 'ok' | 'not_found' | 'error'>('idle');
  let job = $state<CopilotJobSnapshot | null>(null);
  let deletionReceipt = $state<CopilotDeletionReceipt | null>(null);
  let error = $state<CopilotError | null>(null);
  let action = $state<
    | 'linking'
    | 'syncing'
    | 'creating'
    | 'refreshing'
    | 'cancelling'
    | 'reviewing'
    | 'deleting'
    | null
  >(null);
  let missionFields = $state<CopilotMissionField[]>([...DEFAULT_MISSION_FIELDS]);
  let profileFields = $state<CopilotProfileField[]>([...DEFAULT_PROFILE_FIELDS]);
  let selectedEvidenceIds = $state<string[]>([]);
  let availableEvidence = $state<CopilotEvidenceOption[]>([]);
  let consentConfirmed = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;

  function stopPolling(): void {
    if (timer !== null) {
      dependencies.clearTimer(timer);
    }
    timer = null;
  }

  function protocolFailure(): CopilotError {
    return localError('PROTOCOL_ERROR', 'Réponse Copilot non conforme.');
  }

  async function request(
    message: BridgeMessage,
    expectedType: BridgeMessage['type']
  ): Promise<BridgeMessage> {
    let raw: unknown;
    try {
      raw = await dependencies.send(message);
    } catch {
      throw localError('NETWORK_ERROR', 'Connexion au service worker impossible.', true);
    }
    const validation = validateMessage(raw);
    if (!validation.valid || validation.message.type !== expectedType) {
      throw protocolFailure();
    }
    return validation.message as BridgeMessage;
  }

  function rememberError(cause: unknown): void {
    error =
      typeof cause === 'object' &&
      cause !== null &&
      'code' in cause &&
      'message' in cause &&
      'retryable' in cause
        ? (cause as CopilotError)
        : protocolFailure();
  }

  async function loadEvidence(expectedGeneration: number): Promise<void> {
    try {
      const response = await request({ type: 'GET_PROFILE' }, 'PROFILE_RESULT');
      if (generation !== expectedGeneration || response.type !== 'PROFILE_RESULT') {
        return;
      }
      availableEvidence = evidenceOptions(response.payload);
      selectedEvidenceIds = selectedEvidenceIds.filter((id) =>
        availableEvidence.some((option) => option.id === id)
      );
    } catch {
      if (generation === expectedGeneration) {
        availableEvidence = [];
      }
    }
  }

  function projectedAccessState(state: PremiumEntitlementStateValue): CopilotAccessState {
    return state === 'linking' || state === 'checking' ? 'loading' : state;
  }

  function applyEntitlement(next: CopilotEntitlement, state: PremiumEntitlementStateValue): void {
    entitlement = next;
    accessState = projectedAccessState(state);
    error = null;
  }

  function applyJob(next: CopilotJobSnapshot | null, expectedMissionId: string): void {
    if (missionId !== expectedMissionId) {
      return;
    }
    if (next && next.missionId !== expectedMissionId) {
      rememberError(protocolFailure());
      return;
    }
    job = next;
    if (next) {
      missionFields = [...next.selection.missionFields];
      profileFields = [...next.selection.profileFields];
      selectedEvidenceIds = [...next.selection.evidenceIds];
      consentConfirmed = false;
    }
    if (next?.error) {
      error = next.error;
    }
    schedulePolling();
  }

  function applyDossier(
    next: CopilotDossierProjection | null,
    expectedMissionId: string,
    outcome: 'ok' | 'not_found'
  ): void {
    if (missionId !== expectedMissionId) {
      return;
    }
    if (next && next.missionId !== expectedMissionId) {
      dossierReadState = 'error';
      rememberError(protocolFailure());
      return;
    }
    dossier = next;
    dossierReadState = outcome;
    if (next && job === null) {
      missionFields = [...next.consent.missionFields];
      profileFields = [...next.consent.profileFields];
      selectedEvidenceIds = [...next.consent.evidenceIds];
    }
  }

  function schedulePolling(): void {
    stopPolling();
    const expectedMissionId = missionId;
    if (!expectedMissionId || !job || !POLLING_STATUSES.has(job.status)) {
      return;
    }
    timer = dependencies.setTimer(() => {
      timer = null;
      if (missionId !== expectedMissionId) {
        return;
      }
      void refreshJob(true);
    }, dependencies.pollIntervalMs);
  }

  async function syncEntitlement(): Promise<boolean> {
    action = 'syncing';
    const requestId = dependencies.randomUUID();
    try {
      const response = await request(
        { type: 'COPILOT_SYNC_ENTITLEMENT', payload: { requestId } },
        'COPILOT_ENTITLEMENT_RESULT'
      );
      if (
        response.type !== 'COPILOT_ENTITLEMENT_RESULT' ||
        response.payload.requestId !== requestId
      ) {
        throw protocolFailure();
      }
      if (response.payload.outcome === 'error' || !response.payload.entitlement) {
        error = response.payload.error;
        accessState = projectedAccessState(response.payload.state);
        entitlement = null;
        return false;
      }
      applyEntitlement(response.payload.entitlement, response.payload.state);
      return true;
    } catch (cause) {
      rememberError(cause);
      accessState = 'error';
      return false;
    } finally {
      action = null;
    }
  }

  async function refreshJob(fromPoll = false): Promise<void> {
    const expectedMissionId = missionId;
    if (!expectedMissionId) {
      return;
    }
    if (!fromPoll) {
      action = 'refreshing';
    }
    const requestId = dependencies.randomUUID();
    try {
      const response = await request(
        { type: 'COPILOT_GET_JOB', payload: { requestId, missionId: expectedMissionId } },
        'COPILOT_GET_JOB_RESULT'
      );
      if (
        response.type !== 'COPILOT_GET_JOB_RESULT' ||
        response.payload.requestId !== requestId ||
        response.payload.missionId !== expectedMissionId
      ) {
        throw protocolFailure();
      }
      if (response.payload.outcome === 'not_found') {
        deletionReceipt = response.payload.deletionReceipt;
        applyJob(null, expectedMissionId);
      } else if (response.payload.outcome === 'error') {
        rememberError(response.payload.error);
        if (response.payload.error?.code === 'AUTH_REQUIRED') {
          accessState = 'unlinked';
        }
      } else {
        if (response.payload.outcome === 'local') {
          rememberError(response.payload.error);
        } else {
          error = null;
        }
        deletionReceipt = null;
        applyJob(response.payload.job, expectedMissionId);
        await refreshDossier();
      }
    } catch (cause) {
      rememberError(cause);
    } finally {
      if (!fromPoll) {
        action = null;
      }
      if (fromPoll) {
        schedulePolling();
      }
    }
  }

  async function refreshDossier(): Promise<void> {
    const expectedMissionId = missionId;
    if (!expectedMissionId) {
      return;
    }
    dossierReadState = 'loading';
    const requestId = dependencies.randomUUID();
    try {
      const response = await request(
        { type: 'COPILOT_GET_DOSSIER', payload: { requestId, missionId: expectedMissionId } },
        'COPILOT_GET_DOSSIER_RESULT'
      );
      if (
        response.type !== 'COPILOT_GET_DOSSIER_RESULT' ||
        response.payload.requestId !== requestId ||
        response.payload.missionId !== expectedMissionId
      ) {
        throw protocolFailure();
      }
      if (response.payload.outcome === 'error') {
        if (missionId !== expectedMissionId) {
          return;
        }
        dossierReadState = 'error';
        if (response.payload.error?.code !== 'AUTH_REQUIRED') {
          rememberError(response.payload.error);
        }
        return;
      }
      applyDossier(response.payload.dossier, expectedMissionId, response.payload.outcome);
    } catch (cause) {
      if (missionId !== expectedMissionId) {
        return;
      }
      dossierReadState = 'error';
      rememberError(cause);
    }
  }

  async function open(nextMissionId: string): Promise<void> {
    generation += 1;
    const expectedGeneration = generation;
    stopPolling();
    missionId = nextMissionId;
    job = null;
    dossier = null;
    dossierReadState = 'idle';
    deletionReceipt = null;
    error = null;
    entitlement = null;
    consentConfirmed = false;
    missionFields = [...DEFAULT_MISSION_FIELDS];
    profileFields = [...DEFAULT_PROFILE_FIELDS];
    selectedEvidenceIds = [];

    if (!dependencies.rolloutEnabled) {
      accessState = 'disabled';
      error = localError('ROLLOUT_DISABLED', "Le Copilot Premium n'est pas encore activé.");
      await Promise.all([loadEvidence(expectedGeneration), refreshDossier()]);
      if (generation === expectedGeneration) {
        await refreshJob();
      }
      return;
    }

    accessState = 'loading';
    await Promise.all([loadEvidence(expectedGeneration), syncEntitlement(), refreshDossier()]);
    if (generation !== expectedGeneration) {
      return;
    }
    await refreshJob();
  }

  function close(expectedMissionId?: string): void {
    if (expectedMissionId !== undefined && expectedMissionId !== missionId) {
      return;
    }
    generation += 1;
    stopPolling();
    missionId = null;
  }

  async function link(): Promise<void> {
    action = 'linking';
    const requestId = dependencies.randomUUID();
    try {
      const response = await request(
        { type: 'COPILOT_LINK', payload: { requestId } },
        'COPILOT_LINK_RESULT'
      );
      if (response.type !== 'COPILOT_LINK_RESULT' || response.payload.requestId !== requestId) {
        throw protocolFailure();
      }
      if (response.payload.outcome === 'error') {
        rememberError(response.payload.error);
        accessState = response.payload.error?.code === 'AUTH_CANCELLED' ? 'unlinked' : 'error';
        return;
      }
      await syncEntitlement();
      if (missionId && accessState !== 'unlinked' && accessState !== 'error') {
        await refreshJob();
      }
    } catch (cause) {
      rememberError(cause);
      accessState = 'error';
    } finally {
      action = null;
    }
  }

  async function createJob(kind: CopilotOperationKind): Promise<void> {
    const expectedMissionId = missionId;
    if (
      !expectedMissionId ||
      !dependencies.rolloutEnabled ||
      accessState !== 'active' ||
      !consentConfirmed
    ) {
      return;
    }
    action = 'creating';
    const requestId = dependencies.randomUUID();
    try {
      const response = await request(
        {
          type: 'COPILOT_CREATE_JOB',
          payload: {
            requestId,
            missionId: expectedMissionId,
            kind,
            missionFields: [...missionFields],
            profileFields: [...profileFields],
            evidenceIds: [...selectedEvidenceIds],
          },
        },
        'COPILOT_CREATE_JOB_RESULT'
      );
      if (
        response.type !== 'COPILOT_CREATE_JOB_RESULT' ||
        response.payload.requestId !== requestId ||
        response.payload.missionId !== expectedMissionId
      ) {
        throw protocolFailure();
      }
      if (response.payload.outcome !== 'ok' || !response.payload.job) {
        const creationError = response.payload.error;
        rememberError(creationError);
        if (creationError?.retryable && missionId === expectedMissionId) {
          await refreshJob(true);
          if (missionId === expectedMissionId) {
            error = creationError;
          }
        }
        return;
      }
      error = null;
      deletionReceipt = null;
      applyJob(response.payload.job, expectedMissionId);
      await refreshDossier();
    } catch (cause) {
      rememberError(cause);
    } finally {
      action = null;
    }
  }

  async function cancelJob(): Promise<void> {
    const expectedMissionId = missionId;
    const expectedJobId = job?.jobId;
    if (!expectedMissionId || !expectedJobId) {
      return;
    }
    action = 'cancelling';
    const requestId = dependencies.randomUUID();
    try {
      const response = await request(
        {
          type: 'COPILOT_CANCEL_JOB',
          payload: { requestId, missionId: expectedMissionId, jobId: expectedJobId },
        },
        'COPILOT_CANCEL_JOB_RESULT'
      );
      if (
        response.type !== 'COPILOT_CANCEL_JOB_RESULT' ||
        response.payload.requestId !== requestId ||
        response.payload.missionId !== expectedMissionId
      ) {
        throw protocolFailure();
      }
      if (response.payload.outcome !== 'ok' || !response.payload.job) {
        rememberError(response.payload.error);
        return;
      }
      applyJob(response.payload.job, expectedMissionId);
      await refreshDossier();
    } catch (cause) {
      rememberError(cause);
    } finally {
      action = null;
    }
  }

  async function reviewJob(decision: 'accept' | 'reject'): Promise<void> {
    const expectedMissionId = missionId;
    const expectedJobId = job?.jobId;
    if (!expectedMissionId || !expectedJobId || job?.status !== 'review') {
      return;
    }
    action = 'reviewing';
    const requestId = dependencies.randomUUID();
    try {
      const response = await request(
        {
          type: 'COPILOT_REVIEW_JOB',
          payload: { requestId, missionId: expectedMissionId, jobId: expectedJobId, decision },
        },
        'COPILOT_REVIEW_JOB_RESULT'
      );
      if (
        response.type !== 'COPILOT_REVIEW_JOB_RESULT' ||
        response.payload.requestId !== requestId ||
        response.payload.missionId !== expectedMissionId
      ) {
        throw protocolFailure();
      }
      if (response.payload.outcome !== 'ok' || !response.payload.job) {
        rememberError(response.payload.error);
        return;
      }
      applyJob(response.payload.job, expectedMissionId);
      await refreshDossier();
    } catch (cause) {
      rememberError(cause);
    } finally {
      action = null;
    }
  }

  async function deleteDossier(): Promise<void> {
    const expectedMissionId = missionId;
    if (!expectedMissionId || !canDeleteDossier()) {
      return;
    }
    action = 'deleting';
    const requestId = dependencies.randomUUID();
    try {
      const response = await request(
        { type: 'COPILOT_DELETE_DOSSIER', payload: { requestId, missionId: expectedMissionId } },
        'COPILOT_DELETE_DOSSIER_RESULT'
      );
      if (
        response.type !== 'COPILOT_DELETE_DOSSIER_RESULT' ||
        response.payload.requestId !== requestId ||
        response.payload.missionId !== expectedMissionId
      ) {
        throw protocolFailure();
      }
      if (response.payload.outcome !== 'deleted') {
        rememberError(response.payload.error);
        return;
      }
      deletionReceipt = response.payload.receipt;
      job = null;
      dossier = null;
      dossierReadState = 'not_found';
      error = null;
      stopPolling();
    } catch (cause) {
      rememberError(cause);
    } finally {
      action = null;
    }
  }

  function updateSelection<T>(values: T[], value: T, selected: boolean): T[] {
    if (!selected) {
      return values.filter((item) => item !== value);
    }
    return values.includes(value) ? [...values] : [...values, value];
  }

  function canDeleteDossier(): boolean {
    if (dossierReadState === 'ok') {
      return (
        dossier !== null &&
        (dossier.state === 'ready' || dossier.state === 'deletionFailed') &&
        dossier.activeJob === null
      );
    }
    if (dossierReadState === 'idle' || dossierReadState === 'loading') {
      return false;
    }
    return job !== null && DELETABLE_JOB_STATUSES.has(job.status);
  }

  return {
    get missionId() {
      return missionId;
    },
    get accessState() {
      return accessState;
    },
    get entitlement() {
      return entitlement;
    },
    get dossier() {
      return dossier;
    },
    get dossierReadState() {
      return dossierReadState;
    },
    get job() {
      return job;
    },
    get deletionReceipt() {
      return deletionReceipt;
    },
    get error() {
      return error;
    },
    get action() {
      return action;
    },
    get missionFields() {
      return missionFields;
    },
    get profileFields() {
      return profileFields;
    },
    get selectedEvidenceIds() {
      return selectedEvidenceIds;
    },
    get availableEvidence() {
      return availableEvidence;
    },
    get consentConfirmed() {
      return consentConfirmed;
    },
    get rolloutEnabled() {
      return dependencies.rolloutEnabled;
    },
    get canDeleteDossier() {
      return canDeleteDossier();
    },
    get missionFieldOptions() {
      return COPILOT_MISSION_FIELD_ALLOWLIST;
    },
    get profileFieldOptions() {
      return COPILOT_PROFILE_FIELD_ALLOWLIST;
    },
    open,
    close,
    link,
    syncEntitlement,
    refreshJob,
    refreshDossier,
    createJob,
    cancelJob,
    reviewJob,
    deleteDossier,
    setConsentConfirmed(value: boolean) {
      consentConfirmed = value;
    },
    toggleMissionField(field: CopilotMissionField, selected: boolean) {
      missionFields = updateSelection(missionFields, field, selected);
      consentConfirmed = false;
    },
    toggleProfileField(field: CopilotProfileField, selected: boolean) {
      profileFields = updateSelection(profileFields, field, selected);
      consentConfirmed = false;
    },
    toggleEvidence(evidenceId: string, selected: boolean) {
      selectedEvidenceIds = updateSelection(selectedEvidenceIds, evidenceId, selected);
      consentConfirmed = false;
    },
  };
}

export type CopilotStore = ReturnType<typeof createCopilotStore>;
