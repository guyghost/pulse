import {
  copilotCreditCost,
  copilotTjmFactIds,
  isReviewableCopilotResult,
  type CopilotConsentSelection,
  type CopilotTjmCoachFacts,
} from '@pulse/domain';

import { buildConsentedCopilotPayload } from '../../core/copilot/build-consented-payload';
import { buildTjmCoachFacts } from '../../core/copilot/build-tjm-coach-facts';
import type { Mission } from '../../core/types/mission';
import type { UserProfile } from '../../core/types/profile';
import type { TJMHistory } from '../../core/types/tjm';
import type { CopilotCheckpointRepository } from './checkpoints';
import { createCopilotEntitlementActor } from './entitlement-actor';
import { computeCopilotInputHash, copilotInputHashMaterial } from './input-hash';
import type {
  CopilotCreateApiInput,
  CopilotCreateCommand,
  CopilotDeleteResultPayload,
  CopilotDossierResultPayload,
  CopilotEntitlement,
  CopilotEntitlementResultPayload,
  CopilotError,
  CopilotJobCheckpoint,
  CopilotJobResultPayload,
  CopilotJobSnapshot,
  CopilotLinkResultPayload,
  CopilotRemoteJob,
  CopilotSessionCredential,
} from './contracts';
import type { CopilotSessionRepository } from './session';
import { CopilotTransportError, type CopilotTransport } from './transport';
import { CopilotCreateApiInputSchema } from './validation';

const NON_REPLACEABLE_JOB_STATES = new Set<CopilotJobCheckpoint['status']>([
  'checkpointed',
  'queued',
  'running',
  'uncertain',
  'review',
  'cancelling',
]);
const DELETABLE_JOB_STATES = new Set<CopilotJobCheckpoint['status']>([
  'accepted',
  'rejected',
  'failed',
  'cancelled',
]);

export interface CopilotIdentityPort {
  getRedirectURL(path: string): string;
  launchWebAuthFlow(details: { url: string; interactive: boolean }): Promise<string | undefined>;
}

export interface CopilotCoordinatorDependencies {
  rolloutEnabled: boolean;
  identity: CopilotIdentityPort;
  sessions: CopilotSessionRepository;
  checkpoints: CopilotCheckpointRepository;
  transport: CopilotTransport;
  getMissionById(missionId: string): Promise<Mission | null>;
  getProfile(): Promise<UserProfile | null>;
  loadTJMHistory(): Promise<TJMHistory>;
  now(): number;
  randomUUID(): string;
}

export interface CopilotCoordinator {
  link(requestId: string): Promise<CopilotLinkResultPayload>;
  syncEntitlement(requestId: string): Promise<CopilotEntitlementResultPayload>;
  getDossier(requestId: string, missionId: string): Promise<CopilotDossierResultPayload>;
  createJob(command: CopilotCreateCommand): Promise<CopilotJobResultPayload>;
  getJob(requestId: string, missionId: string): Promise<CopilotJobResultPayload>;
  cancelJob(requestId: string, missionId: string, jobId: string): Promise<CopilotJobResultPayload>;
  reviewJob(
    requestId: string,
    missionId: string,
    jobId: string,
    decision: 'accept' | 'reject'
  ): Promise<CopilotJobResultPayload>;
  deleteDossier(requestId: string, missionId: string): Promise<CopilotDeleteResultPayload>;
}

function error(code: CopilotError['code'], message: string, retryable = false): CopilotError {
  return { code, message, retryable };
}

function normalizeError(cause: unknown): CopilotError {
  if (cause instanceof CopilotTransportError) {
    return cause.copilotError;
  }
  return error('REMOTE_FAILED', 'Le service Copilot est indisponible.', true);
}

function jobError(
  requestId: string,
  missionId: string,
  cause: CopilotError
): CopilotJobResultPayload {
  return {
    requestId,
    missionId,
    outcome: 'error',
    job: null,
    deletionReceipt: null,
    error: cause,
  };
}

function tjmFactsEqual(
  left: CopilotTjmCoachFacts | null,
  right: CopilotTjmCoachFacts | null
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    left.schemaVersion === right.schemaVersion &&
    left.confidence === right.confidence &&
    left.missionDisplayedTjm === right.missionDisplayedTjm &&
    left.profileBounds.min === right.profileBounds.min &&
    left.profileBounds.target === right.profileBounds.target &&
    left.profileBounds.max === right.profileBounds.max &&
    left.profileBounds.currency === right.profileBounds.currency &&
    left.market.recordCount === right.market.recordCount &&
    left.market.sampleCount === right.market.sampleCount &&
    left.market.min === right.market.min &&
    left.market.weightedAverage === right.market.weightedAverage &&
    left.market.max === right.market.max &&
    left.market.trend === right.market.trend &&
    left.market.lastObservedAt === right.market.lastObservedAt &&
    left.market.matchedStacks.length === right.market.matchedStacks.length &&
    left.market.matchedStacks.every((stack, index) => stack === right.market.matchedStacks[index])
  );
}

function publicJob(checkpoint: CopilotJobCheckpoint): CopilotJobSnapshot {
  return {
    jobId: checkpoint.jobId,
    missionId: checkpoint.missionId,
    requestId: checkpoint.requestId,
    kind: checkpoint.kind,
    creditCost: checkpoint.creditCost,
    selection: checkpoint.selection,
    sourceSnapshot: {
      inputHash: checkpoint.createInput.inputHash,
      payload: checkpoint.createInput.input,
    },
    status: checkpoint.status,
    tjmFacts: checkpoint.tjmFacts,
    result: checkpoint.result,
    error: checkpoint.error,
    creditsRemaining: checkpoint.creditsRemaining,
    createdAtMs: checkpoint.createdAtMs,
    updatedAtMs: checkpoint.updatedAtMs,
  };
}

function assertRemoteCorrelation(checkpoint: CopilotJobCheckpoint, remote: CopilotRemoteJob): void {
  if (
    remote.missionId !== checkpoint.missionId ||
    remote.requestId !== checkpoint.requestId ||
    remote.kind !== checkpoint.kind ||
    remote.inputHash !== checkpoint.createInput.inputHash ||
    (checkpoint.jobId !== null && remote.jobId !== checkpoint.jobId)
  ) {
    throw new CopilotTransportError(
      error('PROTOCOL_ERROR', 'La réponse Copilot ne correspond pas au job demandé.')
    );
  }
  if (!tjmFactsEqual(remote.tjmFacts, checkpoint.tjmFacts)) {
    throw new CopilotTransportError(
      error('PROTOCOL_ERROR', 'Les repères TJM distants diffèrent du checkpoint local.')
    );
  }
  if (
    remote.result !== null &&
    !isReviewableCopilotResult(
      remote.result,
      checkpoint.kind,
      checkpoint.selection.evidenceIds,
      copilotTjmFactIds(checkpoint.tjmFacts),
      {
        payload: checkpoint.createInput.input,
        tjmFacts: checkpoint.createInput.tjmFacts,
      }
    )
  ) {
    throw new CopilotTransportError(
      error('PROTOCOL_ERROR', 'Le résultat Copilot ne respecte pas les preuves consenties.')
    );
  }
  if ((remote.status === 'review' || remote.status === 'accepted') && remote.result === null) {
    throw new CopilotTransportError(
      error('PROTOCOL_ERROR', 'Le job Copilot ne contient aucun résultat à relire.')
    );
  }
  if (remote.status === 'failed' && remote.error === null) {
    throw new CopilotTransportError(
      error('PROTOCOL_ERROR', 'Le job Copilot a échoué sans erreur structurée.')
    );
  }
}

function applyRemoteJob(
  checkpoint: CopilotJobCheckpoint,
  remote: CopilotRemoteJob
): CopilotJobCheckpoint {
  assertRemoteCorrelation(checkpoint, remote);
  return {
    ...checkpoint,
    jobId: remote.jobId,
    status: remote.status,
    tjmFacts: remote.tjmFacts,
    result: remote.result,
    error: remote.error,
    creditsRemaining: remote.creditsRemaining,
    createdAtMs: remote.createdAtMs,
    updatedAtMs: remote.updatedAtMs,
  };
}

export function createCopilotCoordinator(
  dependencies: CopilotCoordinatorDependencies
): CopilotCoordinator {
  const missionChains = new Map<string, Promise<void>>();
  const entitlementActor = createCopilotEntitlementActor();

  function serializeMission<T>(missionId: string, operation: () => Promise<T>): Promise<T> {
    const previous = missionChains.get(missionId) ?? Promise.resolve();
    const run = previous.then(operation);
    const settled = run.then(
      () => undefined,
      () => undefined
    );
    missionChains.set(missionId, settled);
    void settled.finally(() => {
      if (missionChains.get(missionId) === settled) {
        missionChains.delete(missionId);
      }
    });
    return run;
  }

  function rolloutError(): CopilotError | null {
    return dependencies.rolloutEnabled
      ? null
      : error('ROLLOUT_DISABLED', "Le Copilot Premium n'est pas encore activé.");
  }

  async function requireSession(): Promise<CopilotSessionCredential> {
    const session = await dependencies.sessions.load();
    if (!session) {
      throw new CopilotTransportError(
        error('AUTH_REQUIRED', 'Connectez votre compte MissionPulse Premium.')
      );
    }
    return session;
  }

  async function canonicalEntitlement(
    session: CopilotSessionCredential,
    requestId: string
  ): Promise<CopilotEntitlement> {
    const correlationId = entitlementActor.prepareSync(requestId, session);
    if (!correlationId) {
      throw new CopilotTransportError(
        error('PROTOCOL_ERROR', "La synchronisation d'entitlement n'a pas été admise.")
      );
    }
    try {
      const entitlement = await dependencies.transport.syncEntitlement(session.bearer);
      if (!entitlementActor.applyEntitlement(correlationId, entitlement, dependencies.now())) {
        entitlementActor.syncFailed(
          correlationId,
          "L'entitlement ne correspond pas à la requête ou au compte connecté.",
          false
        );
        throw new CopilotTransportError(
          error('PROTOCOL_ERROR', "L'entitlement ne correspond pas au compte connecté.")
        );
      }
      return entitlement;
    } catch (cause) {
      if (cause instanceof CopilotTransportError && cause.copilotError.code === 'AUTH_REQUIRED') {
        entitlementActor.sessionRejected(requestId, session);
      } else {
        entitlementActor.syncFailed(correlationId, 'Synchronisation entitlement échouée.', true);
      }
      throw cause;
    }
  }

  async function buildCreateInput(
    checkpoint: Pick<CopilotJobCheckpoint, 'missionId' | 'kind' | 'selection'>
  ): Promise<CopilotCreateApiInput> {
    const [mission, profile] = await Promise.all([
      dependencies.getMissionById(checkpoint.missionId),
      dependencies.getProfile(),
    ]);
    if (!mission) {
      throw new CopilotTransportError(
        error('MISSION_NOT_FOUND', 'La mission locale est introuvable.')
      );
    }
    if (!profile) {
      throw new CopilotTransportError(
        error('PROFILE_NOT_FOUND', 'Complétez votre profil avant d’utiliser le Copilot.')
      );
    }
    const built = buildConsentedCopilotPayload(mission, profile, checkpoint.selection);
    if (!built.ok) {
      throw new CopilotTransportError(
        error('PAYLOAD_REJECTED', 'Les données consenties ne peuvent pas être transmises.')
      );
    }
    let tjmFacts: CopilotTjmCoachFacts | null = null;
    if (checkpoint.kind === 'tjm-coach') {
      const facts = buildTjmCoachFacts(
        mission,
        profile,
        await dependencies.loadTJMHistory(),
        checkpoint.selection
      );
      if (!facts.ok) {
        throw new CopilotTransportError(
          error(
            'PAYLOAD_REJECTED',
            'Le Coach TJM exige le consentement aux stacks, mots-clés et fourchettes TJM.'
          )
        );
      }
      tjmFacts = facts.facts;
    }
    const material = {
      schemaVersion: 1,
      missionId: checkpoint.missionId,
      kind: checkpoint.kind,
      consent: checkpoint.selection,
      input: built.payload,
      tjmFacts,
    } as const;
    return { ...material, inputHash: await computeCopilotInputHash(material) };
  }

  async function verifiedCheckpointInput(
    checkpoint: CopilotJobCheckpoint
  ): Promise<CopilotCreateApiInput> {
    const parsed = CopilotCreateApiInputSchema.safeParse(checkpoint.createInput);
    if (
      !parsed.success ||
      parsed.data.missionId !== checkpoint.missionId ||
      parsed.data.kind !== checkpoint.kind ||
      JSON.stringify(parsed.data.consent) !== JSON.stringify(checkpoint.selection) ||
      !tjmFactsEqual(parsed.data.tjmFacts, checkpoint.tjmFacts) ||
      (await computeCopilotInputHash(copilotInputHashMaterial(parsed.data))) !==
        parsed.data.inputHash
    ) {
      throw new CopilotTransportError(
        error('PROTOCOL_ERROR', 'Le snapshot local du job Copilot est incohérent.')
      );
    }
    return parsed.data;
  }

  async function persistRemote(
    checkpoint: CopilotJobCheckpoint,
    remote: CopilotRemoteJob
  ): Promise<CopilotJobCheckpoint> {
    const updated = applyRemoteJob(checkpoint, remote);
    await dependencies.checkpoints.save(updated);
    return updated;
  }

  async function resumeCheckpoint(
    checkpoint: CopilotJobCheckpoint,
    session: CopilotSessionCredential
  ): Promise<CopilotJobCheckpoint> {
    const input = await verifiedCheckpointInput(checkpoint);
    if (checkpoint.jobId !== null) {
      return persistRemote(
        checkpoint,
        await dependencies.transport.getJob(session.bearer, checkpoint.jobId)
      );
    }

    return persistRemote(
      checkpoint,
      await dependencies.transport.createJob(session.bearer, input, checkpoint.requestId)
    );
  }

  async function clearRejectedSession(cause: unknown): Promise<CopilotError> {
    const normalized = normalizeError(cause);
    if (normalized.code === 'AUTH_REQUIRED') {
      await dependencies.sessions.clear();
    }
    return normalized;
  }

  return {
    async link(requestId) {
      if (!entitlementActor.beginLink(requestId)) {
        return {
          requestId,
          outcome: 'error',
          subject: null,
          error: error('AUTH_FAILED', 'Transition de connexion Copilot refusée.'),
        };
      }
      const redirectUri = dependencies.identity.getRedirectURL('copilot');
      const state = dependencies.randomUUID();
      try {
        const callbackValue = await dependencies.identity.launchWebAuthFlow({
          url: dependencies.transport.createLinkUrl(redirectUri, state),
          interactive: true,
        });
        if (!callbackValue) {
          entitlementActor.linkCancelled(requestId);
          return {
            requestId,
            outcome: 'error',
            subject: null,
            error: error('AUTH_CANCELLED', 'Connexion Copilot annulée.'),
          };
        }

        const callback = new URL(callbackValue);
        const expected = new URL(redirectUri);
        const fragment = new URLSearchParams(callback.hash.replace(/^#/, ''));
        const returnedState = fragment.get('state') ?? callback.searchParams.get('state');
        const bearer = fragment.get('session_token');
        const subject = fragment.get('subject');
        if (
          callback.origin !== expected.origin ||
          callback.pathname !== expected.pathname ||
          returnedState !== state ||
          !bearer ||
          !subject
        ) {
          entitlementActor.linkFailed(requestId, 'Réponse de connexion invalide.', false);
          return {
            requestId,
            outcome: 'error',
            subject: null,
            error: error('AUTH_FAILED', 'Réponse de connexion Copilot invalide.'),
          };
        }

        await dependencies.sessions.save({ version: 1, bearer, subject });
        if (!entitlementActor.linkSucceeded(requestId, subject)) {
          await dependencies.sessions.clear();
          return {
            requestId,
            outcome: 'error',
            subject: null,
            error: error('AUTH_FAILED', 'Corrélation de connexion Copilot invalide.'),
          };
        }
        return { requestId, outcome: 'linked', subject, error: null };
      } catch {
        entitlementActor.linkFailed(requestId, 'Connexion Copilot impossible.', true);
        return {
          requestId,
          outcome: 'error',
          subject: null,
          error: error('AUTH_FAILED', 'Connexion Copilot impossible.', true),
        };
      }
    },

    async syncEntitlement(requestId) {
      try {
        const entitlement = await canonicalEntitlement(await requireSession(), requestId);
        return {
          requestId,
          outcome: 'synced',
          state: entitlementActor.project(dependencies.now()).state,
          entitlement,
          error: null,
        };
      } catch (cause) {
        return {
          requestId,
          outcome: 'error',
          state: entitlementActor.project(dependencies.now()).state,
          entitlement: null,
          error: await clearRejectedSession(cause),
        };
      }
    },

    async getDossier(requestId, missionId) {
      try {
        const session = await requireSession();
        const dossier = await dependencies.transport.getDossier(session.bearer, missionId);
        if (dossier.missionId !== missionId) {
          throw new CopilotTransportError(
            error('PROTOCOL_ERROR', 'Le dossier Copilot ne correspond pas à la mission demandée.')
          );
        }
        return { requestId, missionId, outcome: 'ok', dossier, error: null };
      } catch (cause) {
        const normalized = await clearRejectedSession(cause);
        if (normalized.code === 'MISSION_NOT_FOUND' || normalized.code === 'JOB_NOT_FOUND') {
          return { requestId, missionId, outcome: 'not_found', dossier: null, error: null };
        }
        return { requestId, missionId, outcome: 'error', dossier: null, error: normalized };
      }
    },

    createJob(command) {
      return serializeMission(command.missionId, async () => {
        const blocked = rolloutError();
        if (blocked) {
          return jobError(command.requestId, command.missionId, blocked);
        }
        if (
          (command.kind === 'pitch' ||
            command.kind === 'cover-message' ||
            command.kind === 'cv-summary') &&
          command.evidenceIds.length === 0
        ) {
          return jobError(
            command.requestId,
            command.missionId,
            error(
              'INVALID_REQUEST',
              'Sélectionnez au moins une expérience pour ancrer chaque segment généré.'
            )
          );
        }

        try {
          const session = await requireSession();
          const entitlement = await canonicalEntitlement(session, command.requestId);
          const cost = copilotCreditCost(command.kind);
          if (!entitlementActor.project(dependencies.now()).permitsCreation) {
            return jobError(
              command.requestId,
              command.missionId,
              error('ENTITLEMENT_DENIED', 'Un abonnement Premium actif est requis.')
            );
          }
          if (cost === 1 && entitlement.creditsRemaining < 1) {
            return jobError(
              command.requestId,
              command.missionId,
              error('INSUFFICIENT_CREDITS', 'Crédits Copilot insuffisants.')
            );
          }

          const existing = await dependencies.checkpoints.load(command.missionId);
          if (existing?.requestId === command.requestId) {
            const resumed = await resumeCheckpoint(existing, session);
            return {
              requestId: command.requestId,
              missionId: command.missionId,
              outcome: 'ok',
              job: publicJob(resumed),
              deletionReceipt: null,
              error: null,
            };
          }
          if (existing && NON_REPLACEABLE_JOB_STATES.has(existing.status)) {
            return jobError(
              command.requestId,
              command.missionId,
              error('JOB_CONFLICT', 'Relisez ou annulez le job Copilot en cours.', true)
            );
          }

          const selection: CopilotConsentSelection = {
            missionFields: [...command.missionFields],
            profileFields: [...command.profileFields],
            evidenceIds: [...command.evidenceIds],
          };
          const input = await buildCreateInput({
            missionId: command.missionId,
            kind: command.kind,
            selection,
          });
          const timestamp = dependencies.now();
          const checkpoint: CopilotJobCheckpoint = {
            version: 1,
            jobId: null,
            missionId: command.missionId,
            requestId: command.requestId,
            kind: command.kind,
            creditCost: cost,
            status: 'checkpointed',
            tjmFacts: input.tjmFacts,
            selection,
            createInput: input,
            result: null,
            error: null,
            creditsRemaining: entitlement.creditsRemaining,
            createdAtMs: timestamp,
            updatedAtMs: timestamp,
          };

          // MV3 invariant: durable checkpoint commits before any remote effect.
          await dependencies.checkpoints.save(checkpoint);
          await dependencies.checkpoints.removeDeletionReceipt(command.missionId);
          const remote = await dependencies.transport.createJob(
            session.bearer,
            input,
            command.requestId
          );
          const updated = await persistRemote(checkpoint, remote);
          return {
            requestId: command.requestId,
            missionId: command.missionId,
            outcome: 'ok',
            job: publicJob(updated),
            deletionReceipt: null,
            error: null,
          };
        } catch (cause) {
          return jobError(command.requestId, command.missionId, await clearRejectedSession(cause));
        }
      });
    },

    getJob(requestId, missionId) {
      return serializeMission(missionId, async () => {
        let checkpoint: CopilotJobCheckpoint | null = null;
        try {
          checkpoint = await dependencies.checkpoints.load(missionId);
          if (!checkpoint) {
            return {
              requestId,
              missionId,
              outcome: 'not_found',
              job: null,
              deletionReceipt: await dependencies.checkpoints.loadDeletionReceipt(missionId),
              error: null,
            };
          }
          const session = await requireSession();
          const updated = await resumeCheckpoint(checkpoint, session);
          return {
            requestId,
            missionId,
            outcome: 'ok',
            job: publicJob(updated),
            deletionReceipt: null,
            error: null,
          };
        } catch (cause) {
          const recoveryError = await clearRejectedSession(cause);
          if (checkpoint) {
            return {
              requestId,
              missionId,
              outcome: 'local',
              job: publicJob(checkpoint),
              deletionReceipt: null,
              error: recoveryError,
            };
          }
          return jobError(requestId, missionId, recoveryError);
        }
      });
    },

    cancelJob(requestId, missionId, jobId) {
      return serializeMission(missionId, async () => {
        try {
          const session = await requireSession();
          let checkpoint = await dependencies.checkpoints.load(missionId);
          if (!checkpoint) {
            return {
              requestId,
              missionId,
              outcome: 'not_found',
              job: null,
              deletionReceipt: null,
              error: null,
            };
          }
          if (checkpoint.jobId === null) {
            checkpoint = await resumeCheckpoint(checkpoint, session);
          }
          if (checkpoint.jobId !== jobId) {
            return jobError(
              requestId,
              missionId,
              error('PROTOCOL_ERROR', 'Le job à annuler ne correspond pas au dossier.')
            );
          }
          const updated = await persistRemote(
            { ...checkpoint, status: 'cancelling', updatedAtMs: dependencies.now() },
            await dependencies.transport.cancelJob(session.bearer, jobId)
          );
          return {
            requestId,
            missionId,
            outcome: 'ok',
            job: publicJob(updated),
            deletionReceipt: null,
            error: null,
          };
        } catch (cause) {
          return jobError(requestId, missionId, await clearRejectedSession(cause));
        }
      });
    },

    reviewJob(requestId, missionId, jobId, decision) {
      return serializeMission(missionId, async () => {
        try {
          const checkpoint = await dependencies.checkpoints.load(missionId);
          if (!checkpoint) {
            return {
              requestId,
              missionId,
              outcome: 'not_found',
              job: null,
              deletionReceipt: null,
              error: null,
            };
          }
          if (
            checkpoint.jobId !== jobId ||
            checkpoint.status !== 'review' ||
            checkpoint.result === null
          ) {
            return jobError(
              requestId,
              missionId,
              error('JOB_NOT_REVIEWABLE', "Ce job n'est pas prêt pour la revue.")
            );
          }
          const session = await requireSession();
          const remote = await dependencies.transport.reviewJob(session.bearer, jobId, decision);
          const expectedStatus = decision === 'accept' ? 'accepted' : 'rejected';
          if (remote.status !== expectedStatus) {
            throw new CopilotTransportError(
              error('PROTOCOL_ERROR', 'La décision de revue n’a pas été confirmée.')
            );
          }
          const updated = await persistRemote(checkpoint, remote);
          return {
            requestId,
            missionId,
            outcome: 'ok',
            job: publicJob(updated),
            deletionReceipt: null,
            error: null,
          };
        } catch (cause) {
          return jobError(requestId, missionId, await clearRejectedSession(cause));
        }
      });
    },

    deleteDossier(requestId, missionId) {
      return serializeMission(missionId, async () => {
        try {
          const checkpoint = await dependencies.checkpoints.load(missionId);
          if (checkpoint && !DELETABLE_JOB_STATES.has(checkpoint.status)) {
            return {
              requestId,
              missionId,
              outcome: 'error',
              disposition: null,
              receipt: null,
              error: error(
                'DELETE_FAILED',
                'Le job Copilot doit être réglé avant la suppression.',
                false
              ),
            };
          }
          const session = await requireSession();
          const remote = await dependencies.transport.deleteDossier(session.bearer, missionId);
          if (remote.missionId !== missionId) {
            throw new CopilotTransportError(
              error('PROTOCOL_ERROR', 'La suppression ne correspond pas au dossier demandé.')
            );
          }
          const receipt = {
            version: 1 as const,
            missionId,
            disposition: remote.disposition,
            confirmedAtMs: dependencies.now(),
          };
          await dependencies.checkpoints.saveDeletionReceipt(receipt);
          await dependencies.checkpoints.remove(missionId);
          return {
            requestId,
            missionId,
            outcome: 'deleted',
            disposition: remote.disposition,
            receipt,
            error: null,
          };
        } catch (cause) {
          return {
            requestId,
            missionId,
            outcome: 'error',
            disposition: null,
            receipt: null,
            error: await clearRejectedSession(cause),
          };
        }
      });
    },
  };
}
