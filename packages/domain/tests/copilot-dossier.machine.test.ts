import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';

import {
  copilotDossierMachine,
  MAX_COPILOT_APPROVED_ARTIFACTS,
  resolveCopilotDossierSnapshot,
  type CopilotArtifactKind,
  type CopilotValidatedResult,
} from '../src';

const USER_ID = 'user-1';
const MISSION_ID = 'mission-1';
const tjmFacts = {
  schemaVersion: 1 as const,
  confidence: 'low' as const,
  missionDisplayedTjm: 650,
  profileBounds: { min: 550, target: 650, max: 750, currency: 'EUR' as const },
  market: {
    matchedStacks: ['Svelte'],
    recordCount: 1,
    sampleCount: 1,
    min: 600,
    weightedAverage: 650,
    max: 700,
    trend: 'stable' as const,
    lastObservedAt: '2026-07-20',
  },
};

const consent = {
  missionFields: ['title', 'description'] as const,
  profileFields: ['jobTitle'] as const,
  evidenceIds: ['evidence-1'] as const,
};

const analysis: CopilotValidatedResult = {
  schemaVersion: 1,
  kind: 'analysis',
  evidenceClaims: [{ text: 'Expérience Svelte vérifiée.', evidenceIds: ['evidence-1'] }],
  gaps: [],
  risks: [],
  questions: ['Quel est le rythme sur site ?'],
};

function artifact(kind: CopilotArtifactKind): CopilotValidatedResult {
  return {
    ...analysis,
    kind,
    draftSegments: [
      {
        text: `Brouillon ${kind}`,
        sourceRefs:
          kind === 'tjm-coach'
            ? [{ kind: 'tjm-fact', id: 'profile-tjm-bounds', quote: '550 / 650 / 750 EUR' }]
            : [{ kind: 'experience', id: 'evidence-1', quote: 'Svelte vérifiée' }],
      },
    ],
  };
}

function actor() {
  const instance = createActor(copilotDossierMachine, {
    input: { userId: USER_ID, missionId: MISSION_ID },
  });
  instance.start();
  return instance;
}

type DossierActor = ReturnType<typeof actor>;

function sendConsent(instance: DossierActor): void {
  instance.send({ type: 'CONSENT_STARTED', userId: USER_ID, missionId: MISSION_ID });
  instance.send({
    type: 'CONSENT_CONFIRMED',
    userId: USER_ID,
    missionId: MISSION_ID,
    selection: consent,
    confirmedAtMs: 1,
  });
}

function requestAnalysis(instance: DossierActor, jobId = 'job-analysis'): void {
  instance.send({
    type: 'ANALYSIS_REQUESTED',
    userId: USER_ID,
    missionId: MISSION_ID,
    jobId,
  });
}

function stageResult(
  instance: DossierActor,
  jobId: string,
  result: CopilotValidatedResult,
  sessionId = 'session-1'
): void {
  instance.send({
    type: 'JOB_REVIEW_READY',
    userId: USER_ID,
    missionId: MISSION_ID,
    jobId,
    sessionId,
    continuationToken: 'continuation-1',
    result,
    suppliedEvidenceIds: ['evidence-1'],
    suppliedTjmFactIds: result.kind === 'tjm-coach' ? ['profile-tjm-bounds'] : [],
    grounding: {
      payload: {
        mission: { title: 'Mission Svelte' },
        profile: { jobTitle: 'Engineer' },
        experienceEvidence: [
          {
            evidenceId: 'evidence-1',
            role: 'Engineer',
            company: null,
            summary: 'Expérience Svelte vérifiée.',
            skills: ['Svelte'],
          },
        ],
      },
      tjmFacts: result.kind === 'tjm-coach' ? tjmFacts : null,
    },
  });
}

describe('copilot dossier machine', () => {
  it('hydrates only coherent durable state/context projections', () => {
    const readyContext = {
      userId: USER_ID,
      missionId: MISSION_ID,
      consent: { ...consent, confirmedAtMs: 1 },
      session: null,
      activeJob: null,
      reviewCandidate: null,
      analysis: null,
      artifacts: [],
      deletionRequestedAtMs: null,
      error: null,
      providerMayExist: false,
    } as const;
    expect(resolveCopilotDossierSnapshot({ state: 'ready', context: readyContext })?.value).toBe(
      'ready'
    );
    expect(
      resolveCopilotDossierSnapshot({
        state: 'processing',
        context: readyContext,
      })
    ).toBeNull();
    expect(
      resolveCopilotDossierSnapshot({
        state: 'reviewing',
        context: {
          ...readyContext,
          reviewCandidate: { jobId: 'job-analysis', result: analysis },
        },
      })
    ).toBeNull();
  });

  it('bounds approved history and refuses another artifact before processing', () => {
    const artifacts = Array.from({ length: MAX_COPILOT_APPROVED_ARTIFACTS }, (_, index) => ({
      artifactId: `artifact-${index}`,
      jobId: `job-${index}`,
      kind: 'pitch' as const,
      draft: `Draft ${index}`,
      approvedAtMs: index + 1,
    }));
    const context = {
      userId: USER_ID,
      missionId: MISSION_ID,
      consent: { ...consent, confirmedAtMs: 1 },
      session: null,
      activeJob: null,
      reviewCandidate: null,
      analysis: null,
      artifacts,
      deletionRequestedAtMs: null,
      error: null,
      providerMayExist: false,
    } as const;
    const snapshot = resolveCopilotDossierSnapshot({ state: 'ready', context });
    expect(snapshot).not.toBeNull();
    expect(
      resolveCopilotDossierSnapshot({
        state: 'ready',
        context: {
          ...context,
          artifacts: [...artifacts, { ...artifacts[0]!, artifactId: 'overflow' }],
        },
      })
    ).toBeNull();

    const instance = createActor(copilotDossierMachine, {
      input: { userId: USER_ID, missionId: MISSION_ID },
      snapshot: snapshot!,
    });
    instance.start();
    instance.send({
      type: 'ARTIFACT_REQUESTED',
      userId: USER_ID,
      missionId: MISSION_ID,
      jobId: 'blocked-artifact',
      kind: 'pitch',
    });
    expect(instance.getSnapshot().value).toBe('ready');
    requestAnalysis(instance, 'analysis-still-allowed');
    expect(instance.getSnapshot().value).toBe('processing');
  });

  it('covers consent confirmation and cancellation while rejecting empty consent', () => {
    const cancelled = actor();
    cancelled.send({ type: 'CONSENT_STARTED', userId: USER_ID, missionId: MISSION_ID });
    cancelled.send({ type: 'CONSENT_CANCELLED', userId: USER_ID, missionId: MISSION_ID });
    expect(cancelled.getSnapshot().value).toBe('empty');

    const empty = actor();
    empty.send({ type: 'CONSENT_STARTED', userId: USER_ID, missionId: MISSION_ID });
    empty.send({
      type: 'CONSENT_CONFIRMED',
      userId: USER_ID,
      missionId: MISSION_ID,
      selection: { missionFields: [], profileFields: [], evidenceIds: [] },
      confirmedAtMs: 1,
    });
    expect(empty.getSnapshot().value).toBe('consenting');

    sendConsent(empty);
    expect(empty.getSnapshot().value).toBe('ready');
    expect(empty.getSnapshot().context.consent).toEqual({ ...consent, confirmedAtMs: 1 });
  });

  it('never starts remote processing before confirmed consent or for another user', () => {
    const instance = actor();
    requestAnalysis(instance);
    expect(instance.getSnapshot().value).toBe('empty');

    instance.send({ type: 'CONSENT_STARTED', userId: 'other-user', missionId: MISSION_ID });
    expect(instance.getSnapshot().value).toBe('empty');
  });

  it('moves only schema-valid, correctly correlated analysis into review', () => {
    const instance = actor();
    sendConsent(instance);
    requestAnalysis(instance);

    stageResult(instance, 'wrong-job', analysis);
    expect(instance.getSnapshot().value).toBe('processing');
    stageResult(instance, 'job-analysis', {
      ...analysis,
      evidenceClaims: [{ text: 'Expérience inventée.', evidenceIds: ['missing'] }],
    });
    expect(instance.getSnapshot().value).toBe('processing');

    stageResult(instance, 'job-analysis', analysis);
    expect(instance.getSnapshot().value).toBe('reviewing');
    expect(instance.getSnapshot().context.activeJob).toEqual({
      jobId: 'job-analysis',
      kind: 'analysis',
    });
    expect(instance.getSnapshot().context.session).toEqual({
      sessionId: 'session-1',
      continuationToken: 'continuation-1',
    });

    instance.send({
      type: 'ANALYSIS_APPROVED',
      userId: USER_ID,
      missionId: MISSION_ID,
      jobId: 'job-analysis',
      approvedAtMs: 2,
    });
    expect(instance.getSnapshot().value).toBe('ready');
    expect(instance.getSnapshot().context.activeJob).toBeNull();
    expect(instance.getSnapshot().context.analysis?.result).toEqual(analysis);
  });

  it('returns a failed provider job to ready and admits only a distinct retry job', () => {
    const instance = actor();
    sendConsent(instance);
    requestAnalysis(instance);
    instance.send({
      type: 'JOB_FAILED',
      userId: USER_ID,
      missionId: MISSION_ID,
      jobId: 'job-analysis',
      error: { code: 'JOB_FAILED', message: 'provider unavailable', retryable: true },
    });

    expect(instance.getSnapshot().value).toBe('ready');
    expect(instance.getSnapshot().context.analysis).toBeNull();
    expect(instance.getSnapshot().context.error?.code).toBe('JOB_FAILED');

    requestAnalysis(instance, 'job-analysis-retry');
    expect(instance.getSnapshot().value).toBe('processing');
    expect(instance.getSnapshot().context.activeJob).toEqual({
      jobId: 'job-analysis-retry',
      kind: 'analysis',
    });
  });

  it.each(['pitch', 'cover-message', 'cv-summary', 'tjm-coach'] as const)(
    'supports explicit approval for %s while never emitting a pipeline transition',
    (kind) => {
      const instance = actor();
      sendConsent(instance);
      instance.send({
        type: 'ARTIFACT_REQUESTED',
        userId: USER_ID,
        missionId: MISSION_ID,
        jobId: `job-${kind}`,
        kind,
      });
      stageResult(instance, `job-${kind}`, artifact(kind));
      instance.send({
        type: 'ARTIFACT_APPROVED',
        userId: USER_ID,
        missionId: MISSION_ID,
        jobId: `job-${kind}`,
        artifactId: `artifact-${kind}`,
        approvedAtMs: 3,
      });

      expect(instance.getSnapshot().value).toBe('ready');
      expect(instance.getSnapshot().context.artifacts).toEqual([
        {
          artifactId: `artifact-${kind}`,
          jobId: `job-${kind}`,
          kind,
          draft: `Brouillon ${kind}`,
          approvedAtMs: 3,
        },
      ]);
      expect(instance.getSnapshot().context).not.toHaveProperty('applicationStatus');
    }
  );

  it('rejects a draft without adding an approved artifact', () => {
    const instance = actor();
    sendConsent(instance);
    instance.send({
      type: 'ARTIFACT_REQUESTED',
      userId: USER_ID,
      missionId: MISSION_ID,
      jobId: 'job-pitch',
      kind: 'pitch',
    });
    stageResult(instance, 'job-pitch', artifact('pitch'));
    instance.send({
      type: 'ARTIFACT_REJECTED',
      userId: USER_ID,
      missionId: MISSION_ID,
      jobId: 'job-pitch',
    });

    expect(instance.getSnapshot().value).toBe('ready');
    expect(instance.getSnapshot().context.artifacts).toEqual([]);
    expect(instance.getSnapshot().context.session).toBeNull();
  });

  it('retires the candidate session when an analysis is rejected', () => {
    const instance = actor();
    sendConsent(instance);
    requestAnalysis(instance);
    stageResult(instance, 'job-analysis', analysis);
    instance.send({
      type: 'ANALYSIS_REJECTED',
      userId: USER_ID,
      missionId: MISSION_ID,
      jobId: 'job-analysis',
    });

    expect(instance.getSnapshot().value).toBe('ready');
    expect(instance.getSnapshot().context.analysis).toBeNull();
    expect(instance.getSnapshot().context.session).toBeNull();
  });

  it('keeps one Eve session scoped to the dossier across follow-up jobs', () => {
    const instance = actor();
    sendConsent(instance);
    requestAnalysis(instance);
    stageResult(instance, 'job-analysis', analysis);
    instance.send({
      type: 'ANALYSIS_APPROVED',
      userId: USER_ID,
      missionId: MISSION_ID,
      jobId: 'job-analysis',
      approvedAtMs: 2,
    });
    instance.send({
      type: 'ARTIFACT_REQUESTED',
      userId: USER_ID,
      missionId: MISSION_ID,
      jobId: 'job-pitch',
      kind: 'pitch',
    });

    stageResult(instance, 'job-pitch', artifact('pitch'), 'other-session');
    expect(instance.getSnapshot().value).toBe('processing');
    stageResult(instance, 'job-pitch', artifact('pitch'), 'session-1');
    expect(instance.getSnapshot().value).toBe('reviewing');
  });

  it('restores a persisted reviewing snapshot after an MV3-style restart', () => {
    const first = actor();
    sendConsent(first);
    requestAnalysis(first);
    stageResult(first, 'job-analysis', analysis);
    const persisted = first.getPersistedSnapshot();
    first.stop();

    const resumed = createActor(copilotDossierMachine, {
      input: { userId: USER_ID, missionId: MISSION_ID },
      snapshot: persisted,
    });
    resumed.start();

    expect(resumed.getSnapshot().value).toBe('reviewing');
    expect(resumed.getSnapshot().context.reviewCandidate?.jobId).toBe('job-analysis');
  });

  it('requires both local deletion and Eve disposition before entering terminal deleted', () => {
    const instance = actor();
    sendConsent(instance);
    requestAnalysis(instance);
    stageResult(instance, 'job-analysis', analysis);
    instance.send({
      type: 'DELETE_REQUESTED',
      userId: USER_ID,
      missionId: MISSION_ID,
      requestedAtMs: 4,
    });
    expect(instance.getSnapshot().value).toBe('reviewing');
    instance.send({
      type: 'ANALYSIS_APPROVED',
      userId: USER_ID,
      missionId: MISSION_ID,
      jobId: 'job-analysis',
      approvedAtMs: 4,
    });
    instance.send({
      type: 'DELETE_REQUESTED',
      userId: USER_ID,
      missionId: MISSION_ID,
      requestedAtMs: 5,
    });
    expect(instance.getSnapshot().value).toBe('deleting');

    instance.send({
      type: 'DELETE_CONFIRMED',
      userId: USER_ID,
      missionId: MISSION_ID,
      missionPulseRecordsDeleted: true,
      eveDisposition: 'not-created',
    });
    expect(instance.getSnapshot().value).toBe('deleting');

    instance.send({
      type: 'DELETE_CONFIRMED',
      userId: USER_ID,
      missionId: MISSION_ID,
      missionPulseRecordsDeleted: true,
      eveDisposition: 'deleted',
    });
    expect(instance.getSnapshot().value).toBe('deleted');
    expect(instance.getSnapshot().context.session).toBeNull();
    expect(instance.getSnapshot().context.consent).toBeNull();
    expect(instance.getSnapshot().context.artifacts).toEqual([]);
  });

  it('covers deletion failure and explicit retry without accepting cross-user evidence', () => {
    const instance = actor();
    sendConsent(instance);
    instance.send({
      type: 'DELETE_REQUESTED',
      userId: USER_ID,
      missionId: MISSION_ID,
      requestedAtMs: 4,
    });
    instance.send({
      type: 'DELETE_FAILED',
      userId: USER_ID,
      missionId: MISSION_ID,
      error: { code: 'DELETE_FAILED', message: 'retention API unavailable', retryable: true },
    });
    expect(instance.getSnapshot().value).toBe('deletionFailed');

    instance.send({ type: 'DELETE_RETRIED', userId: 'other-user', missionId: MISSION_ID });
    expect(instance.getSnapshot().value).toBe('deletionFailed');
    instance.send({ type: 'DELETE_RETRIED', userId: USER_ID, missionId: MISSION_ID });
    expect(instance.getSnapshot().value).toBe('deleting');
  });
});
