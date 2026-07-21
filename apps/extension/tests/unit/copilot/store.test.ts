import { describe, expect, it, vi } from 'vitest';

import { createCopilotStore } from '../../../src/lib/state/copilot.svelte';
import type {
  CopilotDossierProjection,
  CopilotJobSnapshot,
} from '../../../src/lib/shell/copilot/contracts';
import type { BridgeMessage } from '../../../src/lib/shell/messaging/bridge';

const ids = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
];

const profile = {
  firstName: 'Ada',
  keywords: ['Svelte'],
  tjmMin: 600,
  tjmMax: 800,
  location: 'Paris',
  remote: 'any' as const,
  seniority: 'senior' as const,
  jobTitle: 'Lead frontend',
  availability: null,
  experiences: [
    {
      id: 'exp-1',
      title: 'Lead frontend',
      company: 'Example',
      employmentType: null,
      location: null,
      startDate: null,
      endDate: null,
      isCurrent: true,
      description: 'Migration Svelte.',
      skills: ['Svelte'],
      source: 'manual' as const,
      sourceExternalId: null,
      positionIndex: 0,
      updatedAt: 1,
    },
  ],
};

function sourceSnapshot(evidenceIds: readonly string[] = []) {
  return {
    inputHash: 'a'.repeat(64),
    payload: {
      mission: {},
      profile: {},
      experienceEvidence: evidenceIds.map((evidenceId) => ({
        evidenceId,
        role: 'Lead frontend',
        company: 'Example',
        summary: 'Migration Svelte.',
        skills: ['Svelte'],
      })),
    },
  };
}

function noDossierResult(
  message: Extract<BridgeMessage, { type: 'COPILOT_GET_DOSSIER' }>
): BridgeMessage {
  return {
    type: 'COPILOT_GET_DOSSIER_RESULT',
    payload: {
      requestId: message.payload.requestId,
      missionId: message.payload.missionId,
      outcome: 'not_found',
      dossier: null,
      error: null,
    },
  };
}

describe('Copilot side-panel store', () => {
  it('keeps creation disabled but performs only local recovery reads while rollout is off', async () => {
    const send = vi.fn(async (message: BridgeMessage): Promise<BridgeMessage> => {
      if (message.type === 'GET_PROFILE') {
        return { type: 'PROFILE_RESULT', payload: profile };
      }
      if (message.type === 'COPILOT_GET_DOSSIER') {
        return noDossierResult(message);
      }
      if (message.type === 'COPILOT_GET_JOB') {
        return {
          type: 'COPILOT_GET_JOB_RESULT',
          payload: {
            requestId: message.payload.requestId,
            missionId: message.payload.missionId,
            outcome: 'not_found',
            job: null,
            deletionReceipt: null,
            error: null,
          },
        };
      }
      throw new Error(`Unexpected ${message.type}`);
    });
    const store = createCopilotStore({
      rolloutEnabled: false,
      send,
      randomUUID: () => ids[0],
    });

    await store.open('mission-1');

    expect(store.accessState).toBe('disabled');
    expect(store.error?.code).toBe('ROLLOUT_DISABLED');
    expect(send.mock.calls.map(([message]) => message.type)).toEqual([
      'GET_PROFILE',
      'COPILOT_GET_DOSSIER',
      'COPILOT_GET_JOB',
    ]);
    store.setConsentConfirmed(true);
    await store.createJob('analysis');
    expect(send.mock.calls.some(([message]) => message.type === 'COPILOT_CREATE_JOB')).toBe(false);
  });

  it('restores a local terminal checkpoint after entitlement expiry and keeps deletion available', async () => {
    const recoveredJob: CopilotJobSnapshot = {
      jobId: 'job-recovery',
      missionId: 'mission-1',
      requestId: ids[0],
      kind: 'analysis',
      creditCost: 0,
      selection: { missionFields: ['title'], profileFields: [], evidenceIds: [] },
      sourceSnapshot: sourceSnapshot(),
      status: 'accepted',
      tjmFacts: null,
      result: {
        schemaVersion: 1,
        kind: 'analysis',
        evidenceClaims: [],
        gaps: [],
        risks: [],
        questions: [],
      },
      error: null,
      creditsRemaining: 0,
      createdAtMs: 1,
      updatedAtMs: 2,
    };
    const send = vi.fn(async (message: BridgeMessage): Promise<BridgeMessage> => {
      switch (message.type) {
        case 'GET_PROFILE':
          return { type: 'PROFILE_RESULT', payload: profile };
        case 'COPILOT_GET_DOSSIER':
          return noDossierResult(message);
        case 'COPILOT_SYNC_ENTITLEMENT':
          return {
            type: 'COPILOT_ENTITLEMENT_RESULT',
            payload: {
              requestId: message.payload.requestId,
              outcome: 'synced',
              state: 'expired',
              entitlement: {
                status: 'expired',
                subject: 'user-1',
                issuedAtMs: null,
                expiresAtMs: 1,
                creditsRemaining: 0,
              },
              error: null,
            },
          };
        case 'COPILOT_GET_JOB':
          return {
            type: 'COPILOT_GET_JOB_RESULT',
            payload: {
              requestId: message.payload.requestId,
              missionId: message.payload.missionId,
              outcome: 'local',
              job: recoveredJob,
              deletionReceipt: null,
              error: {
                code: 'ENTITLEMENT_DENIED',
                message: 'Lecture distante refusée; checkpoint local affiché.',
                retryable: false,
              },
            },
          };
        case 'COPILOT_DELETE_DOSSIER':
          return {
            type: 'COPILOT_DELETE_DOSSIER_RESULT',
            payload: {
              requestId: message.payload.requestId,
              missionId: message.payload.missionId,
              outcome: 'deleted',
              disposition: 'deleted',
              receipt: {
                version: 1,
                missionId: message.payload.missionId,
                disposition: 'deleted',
                confirmedAtMs: 3,
              },
              error: null,
            },
          };
        default:
          throw new Error(`Unexpected ${message.type}`);
      }
    });
    const store = createCopilotStore({
      rolloutEnabled: true,
      send,
      randomUUID: () => ids[1],
    });

    await store.open('mission-1');

    expect(store.accessState).toBe('expired');
    expect(store.job).toEqual(recoveredJob);
    expect(store.error?.code).toBe('ENTITLEMENT_DENIED');
    expect(store.canDeleteDossier).toBe(true);

    await store.deleteDossier();
    expect(store.job).toBeNull();
    expect(store.deletionReceipt?.disposition).toBe('deleted');
  });

  it.each([
    ['expired', 'accept', 'accepted'],
    ['revoked', 'reject', 'rejected'],
  ] as const)(
    'keeps auth-only review available when entitlement is %s',
    async (entitlementState, decision, terminalStatus) => {
      const reviewResult = {
        schemaVersion: 1 as const,
        kind: 'pitch' as const,
        evidenceClaims: [{ text: 'Expérience Svelte pertinente.', evidenceIds: ['exp-1'] }],
        gaps: [],
        risks: [],
        questions: [],
        draftSegments: [
          {
            text: 'Pitch fondé sur une expérience vérifiée.',
            sourceRefs: [{ kind: 'experience' as const, id: 'exp-1', quote: 'Migration Svelte' }],
          },
        ],
      };
      const reviewJob: CopilotJobSnapshot = {
        jobId: 'job-review-auth-only',
        missionId: 'mission-1',
        requestId: ids[0],
        kind: 'pitch',
        creditCost: 1,
        selection: { missionFields: ['title'], profileFields: [], evidenceIds: ['exp-1'] },
        sourceSnapshot: sourceSnapshot(['exp-1']),
        status: 'review',
        tjmFacts: null,
        result: reviewResult,
        error: null,
        creditsRemaining: 0,
        createdAtMs: 1,
        updatedAtMs: 2,
      };
      let projectedDossier: CopilotDossierProjection = {
        missionId: 'mission-1',
        state: 'reviewing',
        consent: { missionFields: ['title'], profileFields: [], evidenceIds: ['exp-1'] },
        analysis: null,
        approvedArtifacts: [],
        activeJob: { jobId: reviewJob.jobId!, kind: 'pitch', state: 'review' },
      };
      let dossierReads = 0;
      const send = vi.fn(async (message: BridgeMessage): Promise<BridgeMessage> => {
        switch (message.type) {
          case 'GET_PROFILE':
            return { type: 'PROFILE_RESULT', payload: profile };
          case 'COPILOT_SYNC_ENTITLEMENT':
            return {
              type: 'COPILOT_ENTITLEMENT_RESULT',
              payload: {
                requestId: message.payload.requestId,
                outcome: 'synced',
                state: entitlementState,
                entitlement: {
                  status: entitlementState,
                  subject: 'user-1',
                  issuedAtMs: null,
                  expiresAtMs: entitlementState === 'expired' ? 1 : null,
                  creditsRemaining: 0,
                },
                error: null,
              },
            };
          case 'COPILOT_GET_DOSSIER':
            dossierReads += 1;
            return {
              type: 'COPILOT_GET_DOSSIER_RESULT',
              payload: {
                requestId: message.payload.requestId,
                missionId: message.payload.missionId,
                outcome: 'ok',
                dossier: projectedDossier,
                error: null,
              },
            };
          case 'COPILOT_GET_JOB':
            return {
              type: 'COPILOT_GET_JOB_RESULT',
              payload: {
                requestId: message.payload.requestId,
                missionId: message.payload.missionId,
                outcome: 'local',
                job: reviewJob,
                deletionReceipt: null,
                error: {
                  code: 'ENTITLEMENT_DENIED',
                  message: 'Nouvelle exécution interdite; revue auth-only disponible.',
                  retryable: false,
                },
              },
            };
          case 'COPILOT_REVIEW_JOB': {
            expect(message.payload.decision).toBe(decision);
            projectedDossier = {
              ...projectedDossier,
              state: 'ready',
              activeJob: null,
              approvedArtifacts:
                decision === 'accept'
                  ? [
                      {
                        artifactId: 'artifact-reviewed',
                        jobId: reviewJob.jobId!,
                        kind: 'pitch',
                        draft: 'Pitch fondé sur une expérience vérifiée.',
                        approvedAtMs: 3,
                      },
                    ]
                  : [],
            };
            return {
              type: 'COPILOT_REVIEW_JOB_RESULT',
              payload: {
                requestId: message.payload.requestId,
                missionId: message.payload.missionId,
                outcome: 'ok',
                job: { ...reviewJob, status: terminalStatus, updatedAtMs: 3 },
                deletionReceipt: null,
                error: null,
              },
            };
          }
          default:
            throw new Error(`Unexpected ${message.type}`);
        }
      });
      const store = createCopilotStore({
        rolloutEnabled: true,
        send,
        randomUUID: () => ids[0],
      });

      await store.open('mission-1');
      expect(store.accessState).toBe(entitlementState);
      expect(store.job?.status).toBe('review');
      await store.reviewJob(decision);

      expect(store.job?.status).toBe(terminalStatus);
      expect(store.dossier?.state).toBe('ready');
      expect(dossierReads).toBeGreaterThanOrEqual(2);
      expect(send.mock.calls.some(([message]) => message.type === 'COPILOT_REVIEW_JOB')).toBe(true);
      expect(send.mock.calls.some(([message]) => message.type === 'COPILOT_CREATE_JOB')).toBe(
        false
      );
    }
  );

  it('never dispatches deletion for a locally active, review or uncertain checkpoint', async () => {
    for (const status of ['queued', 'running', 'review', 'cancelling', 'uncertain'] as const) {
      const send = vi.fn(async (message: BridgeMessage): Promise<BridgeMessage> => {
        switch (message.type) {
          case 'GET_PROFILE':
            return { type: 'PROFILE_RESULT', payload: profile };
          case 'COPILOT_GET_DOSSIER':
            return noDossierResult(message);
          case 'COPILOT_SYNC_ENTITLEMENT':
            return {
              type: 'COPILOT_ENTITLEMENT_RESULT',
              payload: {
                requestId: message.payload.requestId,
                outcome: 'synced',
                state: 'active',
                entitlement: {
                  status: 'active',
                  subject: 'user-1',
                  issuedAtMs: 1,
                  expiresAtMs: 10_000,
                  creditsRemaining: 4,
                },
                error: null,
              },
            };
          case 'COPILOT_GET_JOB':
            return {
              type: 'COPILOT_GET_JOB_RESULT',
              payload: {
                requestId: message.payload.requestId,
                missionId: message.payload.missionId,
                outcome: 'ok',
                job: {
                  jobId: 'job-active',
                  missionId: message.payload.missionId,
                  requestId: ids[0],
                  kind: 'analysis',
                  creditCost: 0,
                  selection: { missionFields: ['title'], profileFields: [], evidenceIds: [] },
                  sourceSnapshot: sourceSnapshot(),
                  status,
                  tjmFacts: null,
                  result: null,
                  error: null,
                  creditsRemaining: 4,
                  createdAtMs: 1,
                  updatedAtMs: 2,
                },
                deletionReceipt: null,
                error: null,
              },
            };
          default:
            throw new Error(`Unexpected ${message.type}`);
        }
      });
      const store = createCopilotStore({
        rolloutEnabled: true,
        send,
        randomUUID: () => ids[0],
      });

      await store.open('mission-1');
      expect(store.job?.status).toBe(status);
      expect(store.canDeleteDossier).toBe(false);
      await store.deleteDossier();
      expect(send.mock.calls.some(([message]) => message.type === 'COPILOT_DELETE_DOSSIER')).toBe(
        false
      );
      store.close('mission-1');
    }
  });

  it('sends only consent selectors on create and stops polling when the panel closes', async () => {
    let idIndex = 0;
    const scheduled: Array<() => void> = [];
    const clearTimer = vi.fn();
    const send = vi.fn(async (message: BridgeMessage): Promise<BridgeMessage> => {
      switch (message.type) {
        case 'GET_PROFILE':
          return { type: 'PROFILE_RESULT', payload: profile };
        case 'COPILOT_GET_DOSSIER':
          return noDossierResult(message);
        case 'COPILOT_SYNC_ENTITLEMENT':
          return {
            type: 'COPILOT_ENTITLEMENT_RESULT',
            payload: {
              requestId: message.payload.requestId,
              outcome: 'synced',
              state: 'active',
              entitlement: {
                status: 'active',
                subject: 'user-1',
                issuedAtMs: 1,
                expiresAtMs: 10_000,
                creditsRemaining: 4,
              },
              error: null,
            },
          };
        case 'COPILOT_GET_JOB':
          return {
            type: 'COPILOT_GET_JOB_RESULT',
            payload: {
              requestId: message.payload.requestId,
              missionId: message.payload.missionId,
              outcome: 'not_found',
              job: null,
              deletionReceipt: null,
              error: null,
            },
          };
        case 'COPILOT_CREATE_JOB':
          return {
            type: 'COPILOT_CREATE_JOB_RESULT',
            payload: {
              requestId: message.payload.requestId,
              missionId: message.payload.missionId,
              outcome: 'ok',
              job: {
                jobId: 'job-1',
                missionId: 'mission-1',
                requestId: message.payload.requestId,
                kind: message.payload.kind,
                creditCost: 0,
                selection: {
                  missionFields: message.payload.missionFields,
                  profileFields: message.payload.profileFields,
                  evidenceIds: message.payload.evidenceIds,
                },
                sourceSnapshot: sourceSnapshot(message.payload.evidenceIds),
                status: 'queued',
                tjmFacts: null,
                result: null,
                error: null,
                creditsRemaining: 4,
                createdAtMs: 1,
                updatedAtMs: 1,
              },
              deletionReceipt: null,
              error: null,
            },
          };
        default:
          throw new Error(`Unexpected ${message.type}`);
      }
    });
    const store = createCopilotStore({
      rolloutEnabled: true,
      send,
      randomUUID: () => ids[idIndex++] ?? ids.at(-1)!,
      setTimer: (callback) => {
        scheduled.push(callback);
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer,
    });

    await store.open('mission-1');
    expect(store.accessState).toBe('active');
    expect(store.availableEvidence).toEqual([
      {
        id: 'exp-1',
        label: 'Lead frontend · Example',
        excerpt: 'Migration Svelte.',
      },
    ]);

    await store.createJob('analysis');
    expect(send.mock.calls.some(([message]) => message.type === 'COPILOT_CREATE_JOB')).toBe(false);

    store.setConsentConfirmed(true);
    await store.createJob('analysis');

    const createMessage = send.mock.calls
      .map(([message]) => message)
      .find((message) => message.type === 'COPILOT_CREATE_JOB');
    expect(createMessage).toEqual({
      type: 'COPILOT_CREATE_JOB',
      payload: {
        requestId: ids[3],
        missionId: 'mission-1',
        kind: 'analysis',
        missionFields: ['title', 'description', 'stack', 'displayedTjm'],
        profileFields: ['jobTitle', 'seniority', 'keywords', 'tjmBounds'],
        evidenceIds: [],
      },
    });
    expect(JSON.stringify(createMessage)).not.toContain('Migration Svelte');
    expect(scheduled).toHaveLength(1);

    store.close('mission-1');
    expect(clearTimer).toHaveBeenCalled();
  });

  it('carries an explicit evidence selection from analysis to pitch and restores it on reopen', async () => {
    let idIndex = 0;
    let getCount = 0;
    const createdJobs: Array<Extract<BridgeMessage, { type: 'COPILOT_CREATE_JOB' }>> = [];
    let persistedPitch: CopilotJobSnapshot | null = null;
    const send = vi.fn(async (message: BridgeMessage): Promise<BridgeMessage> => {
      switch (message.type) {
        case 'GET_PROFILE':
          return { type: 'PROFILE_RESULT', payload: profile };
        case 'COPILOT_GET_DOSSIER':
          return noDossierResult(message);
        case 'COPILOT_SYNC_ENTITLEMENT':
          return {
            type: 'COPILOT_ENTITLEMENT_RESULT',
            payload: {
              requestId: message.payload.requestId,
              outcome: 'synced',
              state: 'active',
              entitlement: {
                status: 'active',
                subject: 'user-1',
                issuedAtMs: 1,
                expiresAtMs: 10_000,
                creditsRemaining: 4,
              },
              error: null,
            },
          };
        case 'COPILOT_GET_JOB':
          getCount += 1;
          return {
            type: 'COPILOT_GET_JOB_RESULT',
            payload: {
              requestId: message.payload.requestId,
              missionId: message.payload.missionId,
              outcome: persistedPitch ? 'ok' : 'not_found',
              job: persistedPitch,
              deletionReceipt: null,
              error: null,
            },
          };
        case 'COPILOT_CREATE_JOB': {
          createdJobs.push(message);
          const isAnalysis = message.payload.kind === 'analysis';
          const job: CopilotJobSnapshot = {
            jobId: isAnalysis ? 'job-analysis' : 'job-pitch',
            missionId: message.payload.missionId,
            requestId: message.payload.requestId,
            kind: message.payload.kind,
            creditCost: isAnalysis ? 0 : 1,
            selection: {
              missionFields: message.payload.missionFields,
              profileFields: message.payload.profileFields,
              evidenceIds: message.payload.evidenceIds,
            },
            sourceSnapshot: sourceSnapshot(message.payload.evidenceIds),
            status: isAnalysis ? 'accepted' : 'review',
            tjmFacts: null,
            result: isAnalysis
              ? {
                  schemaVersion: 1,
                  kind: 'analysis',
                  evidenceClaims: [],
                  gaps: [],
                  risks: [],
                  questions: [],
                }
              : {
                  schemaVersion: 1,
                  kind: 'pitch',
                  evidenceClaims: [
                    { text: 'Expérience Svelte pertinente.', evidenceIds: ['exp-1'] },
                  ],
                  gaps: [],
                  risks: [],
                  questions: [],
                  draftSegments: [
                    {
                      text: 'Pitch fondé sur l’expérience sélectionnée.',
                      sourceRefs: [{ kind: 'experience', id: 'exp-1', quote: 'Migration Svelte' }],
                    },
                  ],
                },
            error: null,
            creditsRemaining: isAnalysis ? 4 : 3,
            createdAtMs: 1,
            updatedAtMs: isAnalysis ? 1 : 2,
          };
          if (!isAnalysis) {
            persistedPitch = job;
          }
          return {
            type: 'COPILOT_CREATE_JOB_RESULT',
            payload: {
              requestId: message.payload.requestId,
              missionId: message.payload.missionId,
              outcome: 'ok',
              job,
              deletionReceipt: null,
              error: null,
            },
          };
        }
        default:
          throw new Error(`Unexpected ${message.type}`);
      }
    });
    const store = createCopilotStore({
      rolloutEnabled: true,
      send,
      randomUUID: () => ids[idIndex++] ?? ids.at(-1)!,
    });

    await store.open('mission-1');
    store.setConsentConfirmed(true);
    await store.createJob('analysis');

    expect(store.job?.kind).toBe('analysis');
    expect(store.selectedEvidenceIds).toEqual([]);
    expect(store.consentConfirmed).toBe(false);

    store.toggleEvidence('exp-1', true);
    expect(store.selectedEvidenceIds).toEqual(['exp-1']);
    expect(store.consentConfirmed).toBe(false);
    store.setConsentConfirmed(true);
    await store.createJob('pitch');

    expect(createdJobs).toHaveLength(2);
    expect(createdJobs[1]?.payload.evidenceIds).toEqual(['exp-1']);
    expect(store.job?.kind).toBe('pitch');
    expect(store.selectedEvidenceIds).toEqual(['exp-1']);
    expect(store.consentConfirmed).toBe(false);

    store.close('mission-1');
    await store.open('mission-1');

    expect(getCount).toBe(2);
    expect(store.job?.jobId).toBe('job-pitch');
    expect(store.selectedEvidenceIds).toEqual(['exp-1']);
    expect(store.consentConfirmed).toBe(false);
  });

  it('does not auto-poll an uncertain provider effect', async () => {
    let idIndex = 0;
    let getRequests = 0;
    const clearTimer = vi.fn();
    const setTimer = vi.fn(() => 7 as unknown as ReturnType<typeof setTimeout>);
    const send = vi.fn(async (message: BridgeMessage): Promise<BridgeMessage> => {
      switch (message.type) {
        case 'GET_PROFILE':
          return { type: 'PROFILE_RESULT', payload: profile };
        case 'COPILOT_GET_DOSSIER':
          return noDossierResult(message);
        case 'COPILOT_SYNC_ENTITLEMENT':
          return {
            type: 'COPILOT_ENTITLEMENT_RESULT',
            payload: {
              requestId: message.payload.requestId,
              outcome: 'synced',
              state: 'active',
              entitlement: {
                status: 'active',
                subject: 'user-1',
                issuedAtMs: 1,
                expiresAtMs: 10_000,
                creditsRemaining: 4,
              },
              error: null,
            },
          };
        case 'COPILOT_GET_JOB':
          getRequests += 1;
          return {
            type: 'COPILOT_GET_JOB_RESULT',
            payload: {
              requestId: message.payload.requestId,
              missionId: message.payload.missionId,
              outcome: 'ok',
              job: {
                jobId: 'job-uncertain',
                missionId: message.payload.missionId,
                requestId: ids[0],
                kind: 'pitch',
                creditCost: 1,
                selection: {
                  missionFields: ['title'],
                  profileFields: [],
                  evidenceIds: ['exp-1'],
                },
                sourceSnapshot: sourceSnapshot(['exp-1']),
                status: 'uncertain',
                tjmFacts: null,
                result: null,
                error: null,
                creditsRemaining: 3,
                createdAtMs: 1,
                updatedAtMs: 2,
              },
              deletionReceipt: null,
              error: null,
            },
          };
        default:
          throw new Error(`Unexpected ${message.type}`);
      }
    });
    const store = createCopilotStore({
      rolloutEnabled: true,
      send,
      randomUUID: () => ids[idIndex++] ?? ids.at(-1)!,
      setTimer,
      clearTimer,
    });

    await store.open('mission-1');
    expect(store.job?.status).toBe('uncertain');
    expect(getRequests).toBe(1);
    expect(setTimer).not.toHaveBeenCalled();
    expect(store.job?.jobId).toBe('job-uncertain');

    store.close('mission-1');
    expect(clearTimer).not.toHaveBeenCalled();
    expect(getRequests).toBe(1);
  });

  it('recovers the durable checkpoint after a retryable create timeout and preserves the error', async () => {
    let getRequests = 0;
    let createRequestId = ids[0];
    const setTimer = vi.fn(() => 7 as unknown as ReturnType<typeof setTimeout>);
    const send = vi.fn(async (message: BridgeMessage): Promise<BridgeMessage> => {
      switch (message.type) {
        case 'GET_PROFILE':
          return { type: 'PROFILE_RESULT', payload: profile };
        case 'COPILOT_GET_DOSSIER':
          return noDossierResult(message);
        case 'COPILOT_SYNC_ENTITLEMENT':
          return {
            type: 'COPILOT_ENTITLEMENT_RESULT',
            payload: {
              requestId: message.payload.requestId,
              outcome: 'synced',
              state: 'active',
              entitlement: {
                status: 'active',
                subject: 'user-1',
                issuedAtMs: 1,
                expiresAtMs: 10_000,
                creditsRemaining: 4,
              },
              error: null,
            },
          };
        case 'COPILOT_GET_JOB':
          getRequests += 1;
          if (getRequests === 1) {
            return {
              type: 'COPILOT_GET_JOB_RESULT',
              payload: {
                requestId: message.payload.requestId,
                missionId: message.payload.missionId,
                outcome: 'not_found',
                job: null,
                deletionReceipt: null,
                error: null,
              },
            };
          }
          return {
            type: 'COPILOT_GET_JOB_RESULT',
            payload: {
              requestId: message.payload.requestId,
              missionId: message.payload.missionId,
              outcome: 'local',
              job: {
                jobId: null,
                missionId: message.payload.missionId,
                requestId: createRequestId,
                kind: 'analysis',
                creditCost: 0,
                selection: {
                  missionFields: ['title', 'description', 'stack', 'displayedTjm'],
                  profileFields: ['jobTitle', 'seniority', 'keywords', 'tjmBounds'],
                  evidenceIds: [],
                },
                sourceSnapshot: sourceSnapshot(),
                status: 'checkpointed',
                tjmFacts: null,
                result: null,
                error: null,
                creditsRemaining: 4,
                createdAtMs: 1,
                updatedAtMs: 2,
              },
              deletionReceipt: null,
              error: {
                code: 'NETWORK_ERROR',
                message: 'Réponse du POST perdue; checkpoint local récupéré.',
                retryable: true,
              },
            },
          };
        case 'COPILOT_CREATE_JOB':
          createRequestId = message.payload.requestId;
          return {
            type: 'COPILOT_CREATE_JOB_RESULT',
            payload: {
              requestId: message.payload.requestId,
              missionId: message.payload.missionId,
              outcome: 'error',
              job: null,
              deletionReceipt: null,
              error: {
                code: 'NETWORK_ERROR',
                message: 'Le résultat du POST est inconnu.',
                retryable: true,
              },
            },
          };
        default:
          throw new Error(`Unexpected ${message.type}`);
      }
    });
    const store = createCopilotStore({
      rolloutEnabled: true,
      send,
      randomUUID: () => ids[0],
      setTimer,
    });

    await store.open('mission-1');
    store.setConsentConfirmed(true);
    await store.createJob('analysis');

    expect(getRequests).toBe(2);
    expect(store.job).toMatchObject({ status: 'checkpointed', requestId: createRequestId });
    expect(store.error).toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'Le résultat du POST est inconnu.',
    });
    expect(setTimer).toHaveBeenCalled();
  });

  it('surfaces RATE_LIMITED without creating or auto-retrying a job', async () => {
    const setTimer = vi.fn(() => 7 as unknown as ReturnType<typeof setTimeout>);
    const send = vi.fn(async (message: BridgeMessage): Promise<BridgeMessage> => {
      switch (message.type) {
        case 'GET_PROFILE':
          return { type: 'PROFILE_RESULT', payload: profile };
        case 'COPILOT_GET_DOSSIER':
          return noDossierResult(message);
        case 'COPILOT_SYNC_ENTITLEMENT':
          return {
            type: 'COPILOT_ENTITLEMENT_RESULT',
            payload: {
              requestId: message.payload.requestId,
              outcome: 'synced',
              state: 'active',
              entitlement: {
                status: 'active',
                subject: 'user-1',
                issuedAtMs: 1,
                expiresAtMs: 10_000,
                creditsRemaining: 4,
              },
              error: null,
            },
          };
        case 'COPILOT_GET_JOB':
          return {
            type: 'COPILOT_GET_JOB_RESULT',
            payload: {
              requestId: message.payload.requestId,
              missionId: message.payload.missionId,
              outcome: 'not_found',
              job: null,
              deletionReceipt: null,
              error: null,
            },
          };
        case 'COPILOT_CREATE_JOB':
          return {
            type: 'COPILOT_CREATE_JOB_RESULT',
            payload: {
              requestId: message.payload.requestId,
              missionId: message.payload.missionId,
              outcome: 'error',
              job: null,
              deletionReceipt: null,
              error: {
                code: 'RATE_LIMITED',
                message: 'Quota atteint jusqu’à la prochaine fenêtre.',
                retryable: false,
              },
            },
          };
        default:
          throw new Error(`Unexpected ${message.type}`);
      }
    });
    const store = createCopilotStore({
      rolloutEnabled: true,
      send,
      randomUUID: () => ids[0],
      setTimer,
    });

    await store.open('mission-1');
    store.setConsentConfirmed(true);
    await store.createJob('analysis');

    expect(store.error).toMatchObject({ code: 'RATE_LIMITED', retryable: false });
    expect(store.job).toBeNull();
    expect(setTimer).not.toHaveBeenCalled();
    expect(
      send.mock.calls.filter(([message]) => message.type === 'COPILOT_CREATE_JOB')
    ).toHaveLength(1);
  });

  it('restores approved analysis and every approved draft from the server dossier projection', async () => {
    const approvedAnalysis = {
      schemaVersion: 1 as const,
      kind: 'analysis' as const,
      evidenceClaims: [{ text: 'Expérience Svelte confirmée.', evidenceIds: ['exp-1'] }],
      gaps: ['Disponibilité à confirmer'],
      risks: [],
      questions: ['Quelle date de démarrage ?'],
    };
    const dossier = {
      missionId: 'mission-1',
      state: 'ready' as const,
      consent: {
        missionFields: ['title'] as const,
        profileFields: [] as const,
        evidenceIds: ['exp-1'],
      },
      analysis: { jobId: 'job-analysis', result: approvedAnalysis, approvedAtMs: 10 },
      approvedArtifacts: [
        {
          artifactId: 'artifact-pitch',
          jobId: 'job-pitch',
          kind: 'pitch' as const,
          draft: 'Pitch approuvé persistant.',
          approvedAtMs: 20,
        },
        {
          artifactId: 'artifact-message',
          jobId: 'job-message',
          kind: 'cover-message' as const,
          draft: 'Message approuvé persistant.',
          approvedAtMs: 30,
        },
      ],
      activeJob: null,
    };
    let projectedDossier: CopilotDossierProjection = dossier;
    const latestJob: CopilotJobSnapshot = {
      jobId: 'job-message',
      missionId: 'mission-1',
      requestId: ids[0],
      kind: 'cover-message',
      creditCost: 1,
      selection: { missionFields: ['title'], profileFields: [], evidenceIds: ['exp-1'] },
      sourceSnapshot: sourceSnapshot(['exp-1']),
      status: 'accepted',
      tjmFacts: null,
      result: {
        schemaVersion: 1,
        kind: 'cover-message',
        evidenceClaims: [],
        gaps: [],
        risks: [],
        questions: [],
        draftSegments: [
          {
            text: 'Message approuvé persistant.',
            sourceRefs: [{ kind: 'experience', id: 'exp-1', quote: 'Migration Svelte' }],
          },
        ],
      },
      error: null,
      creditsRemaining: 2,
      createdAtMs: 1,
      updatedAtMs: 2,
    };
    const send = vi.fn(async (message: BridgeMessage): Promise<BridgeMessage> => {
      switch (message.type) {
        case 'GET_PROFILE':
          return { type: 'PROFILE_RESULT', payload: profile };
        case 'COPILOT_SYNC_ENTITLEMENT':
          return {
            type: 'COPILOT_ENTITLEMENT_RESULT',
            payload: {
              requestId: message.payload.requestId,
              outcome: 'synced',
              state: 'active',
              entitlement: {
                status: 'active',
                subject: 'user-1',
                issuedAtMs: 1,
                expiresAtMs: 10_000,
                creditsRemaining: 2,
              },
              error: null,
            },
          };
        case 'COPILOT_GET_DOSSIER':
          return {
            type: 'COPILOT_GET_DOSSIER_RESULT',
            payload: {
              requestId: message.payload.requestId,
              missionId: message.payload.missionId,
              outcome: 'ok',
              dossier: projectedDossier,
              error: null,
            },
          };
        case 'COPILOT_GET_JOB':
          return {
            type: 'COPILOT_GET_JOB_RESULT',
            payload: {
              requestId: message.payload.requestId,
              missionId: message.payload.missionId,
              outcome: 'ok',
              job: latestJob,
              deletionReceipt: null,
              error: null,
            },
          };
        default:
          throw new Error(`Unexpected ${message.type}`);
      }
    });

    const firstStore = createCopilotStore({
      rolloutEnabled: true,
      send,
      randomUUID: () => ids[0],
    });
    await firstStore.open('mission-1');
    expect(firstStore.dossier?.analysis?.result).toEqual(approvedAnalysis);
    expect(firstStore.dossier?.approvedArtifacts.map((artifact) => artifact.draft)).toEqual([
      'Pitch approuvé persistant.',
      'Message approuvé persistant.',
    ]);
    expect(firstStore.canDeleteDossier).toBe(true);
    firstStore.close('mission-1');

    const reopenedStore = createCopilotStore({
      rolloutEnabled: true,
      send,
      randomUUID: () => ids[0],
    });
    await reopenedStore.open('mission-1');
    expect(reopenedStore.dossier).toEqual(dossier);
    expect(reopenedStore.dossier?.approvedArtifacts).toHaveLength(2);
    projectedDossier = {
      ...dossier,
      state: 'processing',
      activeJob: { jobId: 'job-next', kind: 'pitch', state: 'running' },
    };
    await reopenedStore.refreshDossier();
    expect(reopenedStore.canDeleteDossier).toBe(false);
  });
});
