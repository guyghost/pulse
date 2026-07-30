import type {
  CopilotConsentSelection,
  CopilotOperationKind,
  CopilotTransmittedPayload,
  CopilotValidatedResult,
} from '@pulse/domain';
import { MAX_COPILOT_APPROVED_ARTIFACTS } from '@pulse/domain';
import { describe, expect, it } from 'vitest';

import type {
  CopilotProvider,
  CopilotProviderStartResult,
} from '../../src/lib/server/copilot/provider-port';
import { publicCopilotDossierSchema } from '../../src/lib/server/copilot/contracts';
import { CopilotApiError } from '../../src/lib/server/copilot/errors';
import { publicError } from '../../src/lib/server/copilot/remote-response';
import { CopilotService } from '../../src/lib/server/copilot/service';
import type {
  CopilotPrincipal,
  CreateCopilotJobInput,
  StoredCopilotDossier,
  StoredCopilotJob,
} from '../../src/lib/server/copilot/types';
import {
  InMemoryCopilotRepository,
  ScriptedCopilotProvider,
  withoutProviderDeletion,
} from './fakes';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

const CONSENT: CopilotConsentSelection = {
  missionFields: ['title'],
  profileFields: ['jobTitle'],
  evidenceIds: ['experience-1'],
};

const PAYLOAD: CopilotTransmittedPayload = {
  mission: { title: 'Mission Svelte senior' },
  profile: { jobTitle: 'Lead frontend' },
  experienceEvidence: [
    {
      evidenceId: 'experience-1',
      role: 'Lead frontend',
      company: 'Example',
      summary: 'Migration progressive vers Svelte avec une équipe de quatre personnes.',
      skills: ['Svelte', 'TypeScript'],
    },
  ],
};

const VALID_ANALYSIS: CopilotValidatedResult = {
  schemaVersion: 1,
  kind: 'analysis',
  evidenceClaims: [
    {
      text: 'Le candidat dispose d’une expérience frontend pertinente.',
      evidenceIds: ['experience-1'],
    },
  ],
  gaps: [],
  risks: [],
  questions: [],
};

const VALID_PITCH: CopilotValidatedResult = {
  schemaVersion: 1,
  kind: 'pitch',
  evidenceClaims: [
    {
      text: 'Le candidat a mené une migration Svelte.',
      evidenceIds: ['experience-1'],
    },
  ],
  gaps: [],
  risks: [],
  questions: [],
  draftSegments: [
    {
      text: 'J’ai piloté une migration progressive vers Svelte.',
      sourceRefs: [
        {
          kind: 'experience',
          id: 'experience-1',
          quote: 'Migration progressive vers Svelte',
        },
      ],
    },
  ],
};

function validArtifact(
  kind: Exclude<CopilotOperationKind, 'analysis'>,
  text: string
): CopilotValidatedResult {
  return { ...VALID_PITCH, kind, draftSegments: [{ ...VALID_PITCH.draftSegments![0], text }] };
}

function principal(userId: string, repository: InMemoryCopilotRepository): CopilotPrincipal {
  return { userId, creditsRemaining: repository.balances.get(userId) ?? 0 };
}

function createService(
  repository: InMemoryCopilotRepository,
  provider: CopilotProvider
): CopilotService {
  let idSequence = 0;
  let timeSequence = 0;
  return new CopilotService({
    repository,
    provider,
    createId: () => `00000000-0000-4000-8000-${String(++idSequence).padStart(12, '0')}`,
    now: () => new Date(Date.UTC(2026, 6, 21, 13, 0, timeSequence++)),
  });
}

async function dossier(
  service: CopilotService,
  repository: InMemoryCopilotRepository,
  userId: string,
  missionId: string
): Promise<StoredCopilotDossier> {
  return service.createDossier(principal(userId, repository), {
    missionId,
    consent: CONSENT,
  });
}

function jobInput(
  dossierId: string,
  idempotencyKey: string,
  operationKind: CopilotOperationKind
): CreateCopilotJobInput {
  return {
    dossierId,
    idempotencyKey,
    operationKind,
    inputHash: 'a'.repeat(64),
    consent: CONSENT,
    payload: PAYLOAD,
    tjmFacts: null,
  };
}

function completed(
  sessionId: string,
  result: CopilotValidatedResult,
  providerRunId = `run:${sessionId}`
): CopilotProviderStartResult {
  return {
    status: 'completed',
    providerRunId,
    sessionId,
    continuationToken: `continue:${sessionId}`,
    result,
  };
}

async function seedPaidQueuedJob(
  repository: InMemoryCopilotRepository,
  ownedDossier: StoredCopilotDossier,
  idempotencyKey: string
): Promise<StoredCopilotJob> {
  const created = await repository.createJob({
    id: `seed-job:${idempotencyKey}`,
    userId: ownedDossier.userId,
    dossierId: ownedDossier.id,
    missionId: ownedDossier.missionId,
    attemptId: `seed-attempt:${idempotencyKey}`,
    idempotencyKey,
    billingKey: `seed-billing:${idempotencyKey}`,
    inputHash: 'b'.repeat(64),
    operationKind: 'pitch',
    state: 'reserving',
    creditCost: 1,
    suppliedEvidenceIds: ['experience-1'],
    consent: CONSENT,
    tjmFacts: null,
    payload: PAYLOAD,
  });
  await repository.reserveCredit(ownedDossier.userId, created.job.id, created.job.billingKey);
  const durable = await repository.getJob(ownedDossier.userId, created.job.id);
  if (!durable) throw new Error('Seeded job was not persisted');
  return durable;
}

async function seedFreeQueuedJob(
  repository: InMemoryCopilotRepository,
  ownedDossier: StoredCopilotDossier,
  idempotencyKey: string
): Promise<StoredCopilotJob> {
  const created = await repository.createJob({
    id: `seed-free-job:${idempotencyKey}`,
    userId: ownedDossier.userId,
    dossierId: ownedDossier.id,
    missionId: ownedDossier.missionId,
    attemptId: `seed-free-attempt:${idempotencyKey}`,
    idempotencyKey,
    billingKey: `seed-free-billing:${idempotencyKey}`,
    inputHash: 'c'.repeat(64),
    operationKind: 'analysis',
    state: 'queued',
    creditCost: 0,
    suppliedEvidenceIds: ['experience-1'],
    consent: CONSENT,
    tjmFacts: null,
    payload: PAYLOAD,
  });
  return created.job;
}

describe('CopilotService backend invariants', () => {
  it('exposes a deleted idempotency receipt as canonical HTTP 410 GONE', () => {
    expect(publicError(new CopilotApiError(410, 'JOB_GONE', 'deleted'))).toEqual({
      status: 410,
      error: {
        code: 'JOB_GONE',
        message: 'Ce job Copilot a été supprimé et ne peut pas être recréé.',
        retryable: false,
      },
    });
  });

  it('scopes dossiers and jobs to their authenticated owner', async () => {
    const repository = new InMemoryCopilotRepository({
      [USER_A]: { balance: 2 },
      [USER_B]: { balance: 2 },
    });
    const provider = new ScriptedCopilotProvider();
    provider.enqueueResult(completed('session-owner-a', VALID_ANALYSIS));
    const service = createService(repository, provider);
    const ownedDossier = await dossier(service, repository, USER_A, 'mission-private');
    const created = await service.createJob(
      principal(USER_A, repository),
      jobInput(ownedDossier.id, 'owner-a-analysis', 'analysis')
    );

    await expect(
      service.getJob(principal(USER_B, repository), created.job.id)
    ).rejects.toMatchObject({ status: 404, code: 'JOB_NOT_FOUND' });
    await expect(
      service.reviewJob(principal(USER_B, repository), created.job.id, 'accept')
    ).rejects.toMatchObject({ status: 404, code: 'JOB_NOT_FOUND' });
    await expect(
      service.deleteDossier(principal(USER_B, repository), 'mission-private')
    ).resolves.toBe('not-created');

    expect((await repository.getDossier(USER_A, ownedDossier.id))?.state).toBe('reviewing');
    expect(provider.starts).toHaveLength(1);
  });

  it('reads only the cumulative approved dossier across later jobs', async () => {
    const repository = new InMemoryCopilotRepository({
      [USER_A]: { balance: 4 },
      [USER_B]: { balance: 4 },
    });
    const provider = new ScriptedCopilotProvider();
    provider.enqueueResult(completed('session-living', VALID_ANALYSIS, 'run-living-analysis'));
    provider.enqueueResult(
      completed(
        'session-living',
        validArtifact('pitch', 'Premier pitch approuvé.'),
        'run-living-pitch'
      )
    );
    provider.enqueueResult(
      completed(
        'session-living',
        validArtifact('cover-message', 'Second brouillon approuvé.'),
        'run-living-message'
      )
    );
    const service = createService(repository, provider);
    const ownedDossier = await dossier(service, repository, USER_A, 'mission-living-dossier');

    const analysis = await service.createJob(
      principal(USER_A, repository),
      jobInput(ownedDossier.id, 'living-analysis', 'analysis')
    );
    await service.reviewJob(principal(USER_A, repository), analysis.job.id, 'accept');

    const pitch = await service.createJob(
      principal(USER_A, repository),
      jobInput(ownedDossier.id, 'living-pitch', 'pitch')
    );
    const duringLaterJob = await service.getDossierProjection(
      principal(USER_A, repository),
      ownedDossier.missionId
    );
    expect(duringLaterJob).toMatchObject({
      state: 'reviewing',
      analysis: { jobId: analysis.job.id },
      approvedArtifacts: [],
      activeJob: { jobId: pitch.job.id, kind: 'pitch', state: 'review' },
    });
    expect(JSON.stringify(duringLaterJob)).not.toContain('session-living');
    expect(JSON.stringify(duringLaterJob)).not.toContain('Premier pitch approuvé.');

    await service.reviewJob(principal(USER_A, repository), pitch.job.id, 'accept');
    const message = await service.createJob(
      principal(USER_A, repository),
      jobInput(ownedDossier.id, 'living-message', 'cover-message')
    );
    await service.reviewJob(principal(USER_A, repository), message.job.id, 'accept');

    const reopened = await service.getDossierProjection(
      principal(USER_A, repository),
      ownedDossier.missionId
    );
    expect(reopened).toMatchObject({
      missionId: ownedDossier.missionId,
      state: 'ready',
      consent: CONSENT,
      analysis: { jobId: analysis.job.id, result: VALID_ANALYSIS },
      approvedArtifacts: [
        { jobId: pitch.job.id, kind: 'pitch', draft: 'Premier pitch approuvé.' },
        { jobId: message.job.id, kind: 'cover-message', draft: 'Second brouillon approuvé.' },
      ],
      activeJob: null,
    });
    expect(publicCopilotDossierSchema.safeParse(reopened).success).toBe(true);
    expect(
      publicCopilotDossierSchema.safeParse({ ...reopened, providerSessionId: 'must-not-leak' })
        .success
    ).toBe(false);
    await expect(
      service.getDossierProjection(principal(USER_B, repository), ownedDossier.missionId)
    ).resolves.toBeNull();
    expect(provider.starts).toHaveLength(3);
  });

  it('rejects another artifact at the durable limit before quota, credit, or provider effects while still admitting analysis', async () => {
    const repository = new InMemoryCopilotRepository({ [USER_A]: { balance: 1 } });
    repository.dailyAdmissions.set(USER_A, { total: 19, analyses: 9 });
    const provider = new ScriptedCopilotProvider();
    provider.enqueueResult(completed('session-after-artifact-limit', VALID_ANALYSIS));
    const service = createService(repository, provider);
    const ownedDossier = await dossier(service, repository, USER_A, 'mission-artifact-limit');
    ownedDossier.approvedArtifacts = Array.from(
      { length: MAX_COPILOT_APPROVED_ARTIFACTS },
      (_, index) => ({
        artifactId: `approved-artifact-${index}`,
        jobId: `approved-job-${index}`,
        kind: 'pitch' as const,
        draft: `Approved draft ${index}`,
        approvedAtMs: index + 1,
      })
    );

    await expect(
      service.createJob(
        principal(USER_A, repository),
        jobInput(ownedDossier.id, 'artifact-over-durable-limit', 'pitch')
      )
    ).rejects.toMatchObject({ status: 409, code: 'INVALID_REQUEST' });

    expect(provider.starts).toHaveLength(0);
    expect(repository.jobs.size).toBe(0);
    expect(repository.dailyAdmissions.get(USER_A)).toEqual({ total: 19, analyses: 9 });
    expect(repository.balances.get(USER_A)).toBe(1);
    expect(repository.reservationLedger.size).toBe(0);
    expect(repository.refundLedger.size).toBe(0);
    expect(repository.reserveMutations).toBe(0);
    expect(repository.refundMutations).toBe(0);
    expect(ownedDossier).toMatchObject({ state: 'ready', activeJobId: null });

    const analysis = await service.createJob(
      principal(USER_A, repository),
      jobInput(ownedDossier.id, 'analysis-at-artifact-limit', 'analysis')
    );

    expect(analysis.job).toMatchObject({ operationKind: 'analysis', state: 'review' });
    expect(provider.starts).toHaveLength(1);
    expect(repository.dailyAdmissions.get(USER_A)).toEqual({ total: 20, analyses: 10 });
    expect(repository.balances.get(USER_A)).toBe(1);
    expect(repository.reservationLedger.size).toBe(0);
    expect(repository.refundLedger.size).toBe(0);
    expect(repository.reserveMutations).toBe(0);
    expect(repository.refundMutations).toBe(0);
  });

  it('returns the canonical duplicate without a second provider run or reservation', async () => {
    const repository = new InMemoryCopilotRepository({ [USER_A]: { balance: 2 } });
    const provider = new ScriptedCopilotProvider();
    provider.enqueueResult(completed('session-paid', VALID_PITCH));
    const service = createService(repository, provider);
    const ownedDossier = await dossier(service, repository, USER_A, 'mission-duplicate');
    const input = jobInput(ownedDossier.id, 'paid-idempotency-key', 'pitch');

    const first = await service.createJob(principal(USER_A, repository), input);
    const duplicate = await service.createJob(principal(USER_A, repository), input);
    await expect(
      service.createJob(principal(USER_A, repository), {
        ...input,
        inputHash: 'f'.repeat(64),
      })
    ).rejects.toMatchObject({ status: 409, code: 'INVALID_REQUEST' });

    expect(first.duplicate).toBe(false);
    expect(first.job.state).toBe('review');
    expect(duplicate).toMatchObject({
      duplicate: true,
      job: { id: first.job.id, state: 'review' },
    });
    expect(provider.starts).toHaveLength(1);
    expect(repository.reserveMutations).toBe(1);
    expect(repository.refundMutations).toBe(0);
    expect(repository.balances.get(USER_A)).toBe(1);
  });

  it('fails closed instead of replaying an incoherent persisted job projection', async () => {
    const repository = new InMemoryCopilotRepository({ [USER_A]: { balance: 1 } });
    const provider = new ScriptedCopilotProvider();
    provider.enqueueResult(completed('session-incoherent', VALID_ANALYSIS));
    const service = createService(repository, provider);
    const ownedDossier = await dossier(service, repository, USER_A, 'mission-incoherent');
    const created = await service.createJob(
      principal(USER_A, repository),
      jobInput(ownedDossier.id, 'incoherent-projection', 'analysis')
    );
    const durable = repository.jobs.get(created.job.id);
    if (!durable) throw new Error('Expected persisted job');

    // A free analysis can never carry a paid reservation. Recovery must reject
    // this row instead of synthesizing ledger history to make it replayable.
    durable.reservationStatus = 'reserved';
    durable.reservationTransactionId = 'fabricated-reservation';

    await expect(
      service.reviewJob(principal(USER_A, repository), created.job.id, 'accept')
    ).rejects.toMatchObject({ status: 500, code: 'PERSISTENCE_FAILED' });
    expect((await repository.getDossier(USER_A, ownedDossier.id))?.state).toBe('reviewing');
  });

  it('resumes a queued reserved cut-point only when no provider dispatch was recorded', async () => {
    const repository = new InMemoryCopilotRepository({ [USER_A]: { balance: 1 } });
    const provider = new ScriptedCopilotProvider();
    provider.enqueueResult(completed('session-resumed-queue', VALID_PITCH));
    const service = createService(repository, provider);
    const ownedDossier = await dossier(service, repository, USER_A, 'mission-queued-cut-point');
    const queued = await seedPaidQueuedJob(repository, ownedDossier, 'queued-cut-point');

    expect(queued).toMatchObject({
      state: 'queued',
      providerDispatchedAt: null,
      reservationStatus: 'reserved',
    });
    const resumed = await service.getJob(principal(USER_A, repository), queued.id);
    const repeatedRead = await service.getJob(principal(USER_A, repository), queued.id);

    expect(resumed.state).toBe('review');
    expect(repeatedRead.state).toBe('review');
    expect(provider.starts).toHaveLength(1);
    expect(repository.reserveMutations).toBe(1);
    expect(repository.refundMutations).toBe(0);
    expect(repository.balances.get(USER_A)).toBe(0);
  });

  it('marks a dispatched running cut-point uncertain without replaying or refunding it', async () => {
    const repository = new InMemoryCopilotRepository({ [USER_A]: { balance: 1 } });
    const provider = new ScriptedCopilotProvider();
    const service = createService(repository, provider);
    const ownedDossier = await dossier(service, repository, USER_A, 'mission-running-cut-point');
    const queued = await seedPaidQueuedJob(repository, ownedDossier, 'running-cut-point');
    await repository.updateJob(
      USER_A,
      queued.id,
      { state: 'running', providerDispatchedAt: '2026-07-21T13:00:00.000Z' },
      ['queued']
    );

    const resumed = await service.getJob(principal(USER_A, repository), queued.id);

    expect(resumed).toMatchObject({
      state: 'uncertain',
      failure: { code: 'RECONCILIATION_FAILED', retryable: true },
    });
    expect((await repository.getJob(USER_A, queued.id))?.uncertainPhase).toBe('provider');
    expect(provider.starts).toHaveLength(0);
    expect(repository.reserveMutations).toBe(1);
    expect(repository.refundMutations).toBe(0);
    expect(repository.balances.get(USER_A)).toBe(0);
  });

  it('resumes a no-provider cancelling checkpoint and refunds a paid reservation once', async () => {
    const repository = new InMemoryCopilotRepository({ [USER_A]: { balance: 1 } });
    const provider = new ScriptedCopilotProvider();
    const service = createService(repository, provider);
    const ownedDossier = await dossier(service, repository, USER_A, 'mission-cancelling-paid');
    const queued = await seedPaidQueuedJob(repository, ownedDossier, 'cancelling-paid');
    await repository.updateJob(
      USER_A,
      queued.id,
      { state: 'cancelling', settlement: 'cancellation' },
      ['queued']
    );

    const resumed = await service.getJob(principal(USER_A, repository), queued.id);
    const repeated = await service.getJob(principal(USER_A, repository), queued.id);
    expect(resumed.state).toBe('cancelled');
    expect(repeated.state).toBe('cancelled');
    expect(provider.cancellations).toHaveLength(0);
    expect(repository.refundMutations).toBe(1);
    expect(repository.balances.get(USER_A)).toBe(1);
    expect(await repository.getDossier(USER_A, ownedDossier.id)).toMatchObject({
      state: 'ready',
      activeJobId: null,
    });
  });

  it('resumes a provider-backed cancelling checkpoint after restart', async () => {
    const repository = new InMemoryCopilotRepository({ [USER_A]: { balance: 0 } });
    const provider = new ScriptedCopilotProvider();
    provider.enqueueResult({
      status: 'running',
      providerRunId: 'run-cancelling-restart',
      sessionId: 'session-cancelling-restart',
      continuationToken: 'continue-cancelling-restart',
    });
    const service = createService(repository, provider);
    const ownedDossier = await dossier(service, repository, USER_A, 'mission-cancelling-provider');
    const running = await service.createJob(
      principal(USER_A, repository),
      jobInput(ownedDossier.id, 'cancelling-provider', 'analysis')
    );
    expect(running.job.state).toBe('running');
    await repository.updateJob(
      USER_A,
      running.job.id,
      { state: 'cancelling', settlement: 'cancellation' },
      ['running']
    );

    const resumed = await service.getJob(principal(USER_A, repository), running.job.id);
    expect(resumed.state).toBe('cancelled');
    expect(provider.cancellations).toEqual([
      {
        providerRunId: 'run-cancelling-restart',
        sessionId: 'session-cancelling-restart',
      },
    ]);
    expect(await repository.getDossier(USER_A, ownedDossier.id)).toMatchObject({
      state: 'ready',
      activeJobId: null,
    });
  });

  it('reconciles a refunding cut-point idempotently and heals its dossier once', async () => {
    const repository = new InMemoryCopilotRepository({ [USER_A]: { balance: 1 } });
    const provider = new ScriptedCopilotProvider();
    const service = createService(repository, provider);
    const ownedDossier = await dossier(service, repository, USER_A, 'mission-refund-cut-point');
    const queued = await seedPaidQueuedJob(repository, ownedDossier, 'refund-cut-point');
    await repository.updateJob(
      USER_A,
      queued.id,
      {
        state: 'refunding',
        settlement: 'failure',
        failure: { code: 'PROVIDER_FAILED', message: 'Provider failed', retryable: true },
      },
      ['queued']
    );

    const resumed = await service.getJob(principal(USER_A, repository), queued.id);
    const repeatedRead = await service.getJob(principal(USER_A, repository), queued.id);

    expect(resumed.state).toBe('failed');
    expect(repeatedRead.state).toBe('failed');
    expect(repository.reserveMutations).toBe(1);
    expect(repository.refundMutations).toBe(1);
    expect(repository.balances.get(USER_A)).toBe(1);
    expect((await repository.getDossier(USER_A, ownedDossier.id))?.state).toBe('ready');
    expect(provider.starts).toHaveLength(0);
  });

  it('reserves and refunds an invalid paid result exactly once across duplicate retries', async () => {
    const repository = new InMemoryCopilotRepository({ [USER_A]: { balance: 1 } });
    const provider = new ScriptedCopilotProvider();
    provider.enqueueResult(
      completed('session-invalid', {
        ...VALID_PITCH,
        draftSegments: [
          {
            text: 'Expérience inventée.',
            sourceRefs: [
              {
                kind: 'experience',
                id: 'experience-never-supplied',
                quote: 'Expérience entièrement inventée',
              },
            ],
          },
        ],
      })
    );
    const service = createService(repository, provider);
    const ownedDossier = await dossier(service, repository, USER_A, 'mission-invalid');
    const input = jobInput(ownedDossier.id, 'invalid-result-key', 'pitch');

    const failed = await service.createJob(principal(USER_A, repository), input);
    const duplicate = await service.createJob(principal(USER_A, repository), input);

    expect(failed.job).toMatchObject({
      state: 'failed',
      failure: { code: 'RESULT_INVALID' },
    });
    expect(duplicate).toMatchObject({
      duplicate: true,
      job: { id: failed.job.id, state: 'failed' },
    });
    expect(repository.reserveMutations).toBe(1);
    expect(repository.refundMutations).toBe(1);
    expect(repository.balances.get(USER_A)).toBe(1);
    expect(provider.starts).toHaveLength(1);
    expect([...repository.sessions.values()]).toEqual([
      expect.objectContaining({ sessionId: 'session-invalid', continuationEligible: false }),
    ]);
  });

  it('fails before provider dispatch when entitlement is inactive or credits are insufficient', async () => {
    const repository = new InMemoryCopilotRepository({
      [USER_A]: { balance: 4, active: false },
      [USER_B]: { balance: 0, active: true },
    });
    const provider = new ScriptedCopilotProvider();
    const service = createService(repository, provider);
    const expiredDossier = await dossier(service, repository, USER_A, 'mission-expired');
    const emptyDossier = await dossier(service, repository, USER_B, 'mission-no-credit');

    await expect(
      service.createJob(
        principal(USER_A, repository),
        jobInput(expiredDossier.id, 'expired-analysis', 'analysis')
      )
    ).rejects.toMatchObject({ status: 403, code: 'ENTITLEMENT_DENIED' });
    await expect(
      service.createJob(
        principal(USER_B, repository),
        jobInput(emptyDossier.id, 'no-credit-pitch', 'pitch')
      )
    ).rejects.toMatchObject({ status: 402, code: 'INSUFFICIENT_CREDITS' });

    expect(provider.starts).toHaveLength(0);
    expect(repository.reserveMutations).toBe(0);
    expect(repository.refundMutations).toBe(0);
    expect((await repository.getDossier(USER_A, expiredDossier.id))?.state).toBe('ready');
    expect((await repository.getDossier(USER_B, emptyDossier.id))?.state).toBe('ready');
  });

  it('reuses only an accepted session and retires rejection or provider rotation', async () => {
    const repository = new InMemoryCopilotRepository({ [USER_A]: { balance: 0 } });
    const provider = new ScriptedCopilotProvider();
    provider.enqueue((request) => {
      expect(request.session).toBeNull();
      return completed('session-accepted-1', VALID_ANALYSIS, 'run-1');
    });
    provider.enqueue((request) => {
      expect(request.session).toEqual({
        sessionId: 'session-accepted-1',
        continuationToken: 'continue:session-accepted-1',
      });
      return completed('session-accepted-1', VALID_ANALYSIS, 'run-2');
    });
    provider.enqueue((request) => {
      expect(request.session).toBeNull();
      return completed('session-accepted-2', VALID_ANALYSIS, 'run-3');
    });
    provider.enqueue((request) => {
      expect(request.session).toEqual({
        sessionId: 'session-accepted-2',
        continuationToken: 'continue:session-accepted-2',
      });
      return completed('session-rotated-by-provider', VALID_ANALYSIS, 'run-4');
    });
    provider.enqueue((request) => {
      expect(request.session).toBeNull();
      return completed('session-fresh-after-rotation', VALID_ANALYSIS, 'run-5');
    });
    const service = createService(repository, provider);
    const ownedDossier = await dossier(service, repository, USER_A, 'mission-session');

    const first = await service.createJob(
      principal(USER_A, repository),
      jobInput(ownedDossier.id, 'session-job-1', 'analysis')
    );
    await service.reviewJob(principal(USER_A, repository), first.job.id, 'accept');

    const second = await service.createJob(
      principal(USER_A, repository),
      jobInput(ownedDossier.id, 'session-job-2', 'analysis')
    );
    await service.reviewJob(principal(USER_A, repository), second.job.id, 'reject');

    const third = await service.createJob(
      principal(USER_A, repository),
      jobInput(ownedDossier.id, 'session-job-3', 'analysis')
    );
    await service.reviewJob(principal(USER_A, repository), third.job.id, 'accept');

    const rotated = await service.createJob(
      principal(USER_A, repository),
      jobInput(ownedDossier.id, 'session-job-4', 'analysis')
    );
    expect(rotated.job).toMatchObject({ state: 'failed', failure: { code: 'RESULT_INVALID' } });

    const fresh = await service.createJob(
      principal(USER_A, repository),
      jobInput(ownedDossier.id, 'session-job-5', 'analysis')
    );
    expect(fresh.job.state).toBe('review');
    expect(provider.starts).toHaveLength(5);
    expect(
      [...repository.sessions.values()].every((session) => !session.continuationEligible)
    ).toBe(true);
  });

  it('keeps unknown provider effects and unsupported deletion fail-closed', async () => {
    const repository = new InMemoryCopilotRepository({
      [USER_A]: { balance: 1 },
      [USER_B]: { balance: 0 },
    });
    const provider = new ScriptedCopilotProvider();
    provider.enqueueError(
      Object.assign(new Error('Eve response was lost'), {
        code: 'EVE_OUTCOME_UNCERTAIN',
        remoteEffectPossible: true,
        session: null,
      })
    );
    provider.enqueueResult(completed('session-without-delete-api', VALID_ANALYSIS));
    const service = createService(repository, withoutProviderDeletion(provider));

    const uncertainDossier = await dossier(service, repository, USER_A, 'mission-uncertain');
    const uncertain = await service.createJob(
      principal(USER_A, repository),
      jobInput(uncertainDossier.id, 'uncertain-paid-job', 'pitch')
    );
    expect(uncertain.job).toMatchObject({ state: 'uncertain' });
    expect(repository.balances.get(USER_A)).toBe(0);
    expect(repository.refundMutations).toBe(0);
    await expect(
      service.deleteDossier(principal(USER_A, repository), 'mission-uncertain')
    ).rejects.toMatchObject({ status: 409, code: 'DELETE_FAILED' });

    const knownDossier = await dossier(service, repository, USER_B, 'mission-known-session');
    const known = await service.createJob(
      principal(USER_B, repository),
      jobInput(knownDossier.id, 'known-session-job', 'analysis')
    );
    await service.reviewJob(principal(USER_B, repository), known.job.id, 'accept');
    await expect(
      service.deleteDossier(principal(USER_B, repository), 'mission-known-session')
    ).rejects.toMatchObject({ status: 503, code: 'DELETE_FAILED', retryable: true });
    expect((await repository.getDossier(USER_B, knownDossier.id))?.state).toBe('deletionFailed');
    expect(await repository.listProviderSessions(USER_B, knownDossier.id)).toHaveLength(1);
  });

  it('recovers atomically from lost provider-session and no-credit settlement responses', async () => {
    const repository = new InMemoryCopilotRepository({ [USER_A]: { balance: 0 } });
    const provider = new ScriptedCopilotProvider();
    provider.enqueueResult(
      completed('session-invalid-free', {
        ...VALID_ANALYSIS,
        evidenceClaims: [{ text: 'Unsupported claim', evidenceIds: ['not-supplied'] }],
      })
    );
    const service = createService(repository, provider);
    const firstDossier = await dossier(service, repository, USER_A, 'mission-lost-record');
    repository.loseNextProviderSessionResponse = true;
    repository.loseNextNoCreditSettlementResponse = true;
    const failed = await service.createJob(
      principal(USER_A, repository),
      jobInput(firstDossier.id, 'lost-provider-record-and-terminal', 'analysis')
    );
    expect(failed.job).toMatchObject({ state: 'failed', failure: { code: 'RESULT_INVALID' } });
    expect(await repository.getDossier(USER_A, firstDossier.id)).toMatchObject({
      state: 'ready',
      activeJobId: null,
    });
    expect((await repository.getJob(USER_A, failed.job.id))?.providerDispositionKnown).toBe(true);

    const cancelDossier = await dossier(service, repository, USER_A, 'mission-free-cancel');
    const queued = await seedFreeQueuedJob(repository, cancelDossier, 'lost-free-cancel');
    repository.loseNextNoCreditSettlementResponse = true;
    const cancelled = await service.cancelJob(principal(USER_A, repository), queued.id);
    expect(cancelled.job.state).toBe('cancelled');
    expect(await repository.getDossier(USER_A, cancelDossier.id)).toMatchObject({
      state: 'ready',
      activeJobId: null,
    });
  });

  it('rejects stale settlement/refund and record-time session rebinding', async () => {
    const repository = new InMemoryCopilotRepository({ [USER_A]: { balance: 2 } });
    const provider = new ScriptedCopilotProvider();
    const service = createService(repository, provider);

    const freeDossier = await dossier(service, repository, USER_A, 'mission-stale-free');
    const oldFree = await seedFreeQueuedJob(repository, freeDossier, 'old-free');
    await repository.settleJobWithoutCredit({
      userId: USER_A,
      dossierId: freeDossier.id,
      jobId: oldFree.id,
      terminalState: 'failed',
      failure: { code: 'PROVIDER_FAILED', message: 'old failure', retryable: true },
    });
    const newFree = await seedFreeQueuedJob(repository, freeDossier, 'new-free');
    await expect(
      repository.settleJobWithoutCredit({
        userId: USER_A,
        dossierId: freeDossier.id,
        jobId: oldFree.id,
        terminalState: 'failed',
        failure: oldFree.failure,
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(await repository.getDossier(USER_A, freeDossier.id)).toMatchObject({
      state: 'processing',
      activeJobId: newFree.id,
    });

    const paidDossier = await dossier(service, repository, USER_A, 'mission-stale-refund');
    const oldPaid = await seedPaidQueuedJob(repository, paidDossier, 'old-paid');
    await repository.updateJob(USER_A, oldPaid.id, { state: 'refunding', settlement: 'failure' }, [
      'queued',
    ]);
    await repository.refundCredit(USER_A, oldPaid.id, oldPaid.billingKey, 'failed');
    const newPaid = await seedFreeQueuedJob(repository, paidDossier, 'new-after-refund');
    await repository.refundCredit(USER_A, oldPaid.id, oldPaid.billingKey, 'failed');
    expect(await repository.getDossier(USER_A, paidDossier.id)).toMatchObject({
      state: 'processing',
      activeJobId: newPaid.id,
    });

    await repository.updateJob(USER_A, newPaid.id, { state: 'running' }, ['queued']);
    await repository.upsertProviderSession({
      userId: USER_A,
      dossierId: paidDossier.id,
      sessionId: 'session-bound-new',
      continuationToken: 'token-new',
      activeJobId: newPaid.id,
      activeProviderRunId: 'run-new',
      continuationEligible: false,
      deletionDisposition: 'pending',
    });
    const anotherDossier = await dossier(service, repository, USER_A, 'mission-session-rebind');
    const anotherJob = await seedFreeQueuedJob(repository, anotherDossier, 'another-job');
    await repository.updateJob(USER_A, anotherJob.id, { state: 'running' }, ['queued']);
    await expect(
      repository.upsertProviderSession({
        userId: USER_A,
        dossierId: anotherDossier.id,
        sessionId: 'session-bound-new',
        continuationToken: 'token-rebind',
        activeJobId: anotherJob.id,
        activeProviderRunId: 'run-rebind',
        continuationEligible: false,
        deletionDisposition: 'pending',
      })
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      repository.stageReview(USER_A, anotherDossier.id, anotherJob.id, VALID_ANALYSIS, {
        userId: USER_A,
        dossierId: anotherDossier.id,
        sessionId: 'session-bound-new',
        continuationToken: 'token-rebind',
        activeJobId: anotherJob.id,
        activeProviderRunId: 'run-rebind',
        continuationEligible: false,
        deletionDisposition: 'pending',
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('rejects sequential and concurrent cumulative consent beyond 24 evidence IDs', async () => {
    const repository = new InMemoryCopilotRepository({ [USER_A]: { balance: 0 } });
    const service = createService(repository, new ScriptedCopilotProvider());
    const evidence = Array.from({ length: 24 }, (_, index) => `evidence-${index}`);
    const initial = await service.createDossier(principal(USER_A, repository), {
      missionId: 'mission-consent-limit',
      consent: { missionFields: [], profileFields: [], evidenceIds: evidence },
    });
    await expect(
      service.createDossier(principal(USER_A, repository), {
        missionId: 'mission-consent-limit',
        consent: { missionFields: [], profileFields: [], evidenceIds: ['evidence-24'] },
      })
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect((await repository.getDossier(USER_A, initial.id))?.consent.evidenceIds).toHaveLength(24);

    const concurrent = await service.createDossier(principal(USER_A, repository), {
      missionId: 'mission-consent-concurrent',
      consent: { missionFields: [], profileFields: [], evidenceIds: evidence.slice(0, 23) },
    });
    const results = await Promise.allSettled([
      service.createDossier(principal(USER_A, repository), {
        missionId: 'mission-consent-concurrent',
        consent: { missionFields: [], profileFields: [], evidenceIds: ['evidence-a'] },
      }),
      service.createDossier(principal(USER_A, repository), {
        missionId: 'mission-consent-concurrent',
        consent: { missionFields: [], profileFields: [], evidenceIds: ['evidence-b'] },
      }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await repository.getDossier(USER_A, concurrent.id))?.consent.evidenceIds).toHaveLength(
      24
    );
  });

  it('journals partial provider deletion and never replays confirmed or uncertain sessions', async () => {
    const repository = new InMemoryCopilotRepository({ [USER_A]: { balance: 0 } });
    const provider = new ScriptedCopilotProvider();
    provider.enqueueResult(completed('session-delete-1', VALID_ANALYSIS));
    provider.enqueueResult(completed('session-delete-2', VALID_ANALYSIS));
    provider.enqueueDeletionResult({ disposition: 'deleted' });
    provider.enqueueDeletionError(new Error('second deletion lost'));
    const service = createService(repository, provider);
    const ownedDossier = await dossier(service, repository, USER_A, 'mission-partial-delete');
    const first = await service.createJob(
      principal(USER_A, repository),
      jobInput(ownedDossier.id, 'delete-job-1', 'analysis')
    );
    await service.reviewJob(principal(USER_A, repository), first.job.id, 'reject');
    const second = await service.createJob(
      principal(USER_A, repository),
      jobInput(ownedDossier.id, 'delete-job-2', 'analysis')
    );
    await service.reviewJob(principal(USER_A, repository), second.job.id, 'reject');

    await expect(
      service.deleteDossier(principal(USER_A, repository), ownedDossier.missionId)
    ).rejects.toMatchObject({ status: 503, code: 'DELETE_FAILED' });
    expect(provider.deletions).toHaveLength(2);
    expect(await repository.listProviderSessions(USER_A, ownedDossier.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sessionId: 'session-delete-1', deletionDisposition: 'deleted' }),
        expect.objectContaining({
          sessionId: 'session-delete-2',
          deletionDisposition: 'uncertain',
        }),
      ])
    );
    await expect(
      service.deleteDossier(principal(USER_A, repository), ownedDossier.missionId)
    ).rejects.toMatchObject({ status: 503, code: 'DELETE_FAILED' });
    expect(provider.deletions).toHaveLength(2);
  });

  it('rehydrates a deleting checkpoint and resumes only still-pending sessions', async () => {
    const repository = new InMemoryCopilotRepository({ [USER_A]: { balance: 0 } });
    const provider = new ScriptedCopilotProvider();
    provider.enqueueResult(completed('session-checkpoint-1', VALID_ANALYSIS));
    provider.enqueueResult(completed('session-checkpoint-2', VALID_ANALYSIS));
    const service = createService(repository, provider);
    const ownedDossier = await dossier(service, repository, USER_A, 'mission-delete-checkpoint');
    for (const [key, expectedSession] of [
      ['checkpoint-job-1', 'session-checkpoint-1'],
      ['checkpoint-job-2', 'session-checkpoint-2'],
    ] as const) {
      const created = await service.createJob(
        principal(USER_A, repository),
        jobInput(ownedDossier.id, key, 'analysis')
      );
      expect(
        (await repository.getProviderSession(USER_A, ownedDossier.id, created.job.id))?.sessionId
      ).toBe(expectedSession);
      await service.reviewJob(principal(USER_A, repository), created.job.id, 'reject');
    }
    await repository.markDossierDeleting(USER_A, ownedDossier.id, '2026-07-21T13:00:00.000Z');
    await repository.beginProviderSessionDeletion(USER_A, ownedDossier.id, 'session-checkpoint-1');
    await repository.confirmProviderSessionDeletion(
      USER_A,
      ownedDossier.id,
      'session-checkpoint-1',
      'deleted'
    );

    await expect(
      service.deleteDossier(principal(USER_A, repository), ownedDossier.missionId)
    ).resolves.toBe('deleted');
    expect(provider.deletions).toEqual([{ sessionId: 'session-checkpoint-2' }]);
  });

  it('fails closed on local zero-row delete, retries without Eve replay, and preserves receipts/quota', async () => {
    const repository = new InMemoryCopilotRepository({ [USER_A]: { balance: 0 } });
    const provider = new ScriptedCopilotProvider();
    provider.enqueueResult(completed('session-local-delete', VALID_ANALYSIS));
    const service = createService(repository, provider);
    const ownedDossier = await dossier(service, repository, USER_A, 'mission-local-delete');
    const created = await service.createJob(
      principal(USER_A, repository),
      jobInput(ownedDossier.id, 'durable-delete-key', 'analysis')
    );
    await service.reviewJob(principal(USER_A, repository), created.job.id, 'accept');
    repository.failNextDeleteWithoutMutation = true;

    await expect(
      service.deleteDossier(principal(USER_A, repository), ownedDossier.missionId)
    ).rejects.toMatchObject({ status: 503, code: 'DELETE_FAILED' });
    expect(await repository.getDossier(USER_A, ownedDossier.id)).toMatchObject({
      state: 'deletionFailed',
    });
    expect(provider.deletions).toHaveLength(1);
    await expect(
      service.deleteDossier(principal(USER_A, repository), ownedDossier.missionId)
    ).resolves.toBe('deleted');
    expect(provider.deletions).toHaveLength(1);
    expect(repository.dailyAdmissions.get(USER_A)).toEqual({ total: 1, analyses: 1 });
    await expect(
      service.assertJobReplayAllowed(
        principal(USER_A, repository),
        'durable-delete-key',
        'a'.repeat(64)
      )
    ).rejects.toMatchObject({ status: 410, code: 'JOB_GONE' });
  });

  it('does not let an old terminal GET reopen a deleting dossier and detects a zero-row delete', async () => {
    const repository = new InMemoryCopilotRepository({ [USER_A]: { balance: 0 } });
    const service = createService(repository, new ScriptedCopilotProvider());
    const ownedDossier = await dossier(service, repository, USER_A, 'mission-old-terminal-get');
    const oldJob = await seedFreeQueuedJob(repository, ownedDossier, 'old-terminal-get');
    await repository.settleJobWithoutCredit({
      userId: USER_A,
      dossierId: ownedDossier.id,
      jobId: oldJob.id,
      terminalState: 'failed',
      failure: { code: 'PROVIDER_FAILED', message: 'terminal', retryable: false },
    });
    await repository.markDossierDeleting(USER_A, ownedDossier.id, '2026-07-21T13:00:00.000Z');

    expect((await service.getJob(principal(USER_A, repository), oldJob.id)).state).toBe('failed');
    expect((await repository.getDossier(USER_A, ownedDossier.id))?.state).toBe('deleting');
    repository.failNextDeleteWithoutMutation = true;
    await expect(repository.deleteDossier(USER_A, ownedDossier.id)).resolves.toBe(false);
    expect((await repository.getDossier(USER_A, ownedDossier.id))?.state).toBe('deleting');
  });

  it('turns a lost local DELETE response into GONE on the identical POST checkpoint', async () => {
    const repository = new InMemoryCopilotRepository({ [USER_A]: { balance: 0 } });
    const provider = new ScriptedCopilotProvider();
    provider.enqueueResult(completed('session-delete-lost-response', VALID_ANALYSIS));
    const service = createService(repository, provider);
    const ownedDossier = await dossier(service, repository, USER_A, 'mission-delete-response-lost');
    const input = jobInput(ownedDossier.id, 'delete-response-lost-key', 'analysis');
    const created = await service.createJob(principal(USER_A, repository), input);
    await service.reviewJob(principal(USER_A, repository), created.job.id, 'reject');
    repository.loseNextDeleteResponse = true;
    await expect(
      service.deleteDossier(principal(USER_A, repository), ownedDossier.missionId)
    ).rejects.toMatchObject({ status: 503, code: 'DELETE_FAILED' });
    expect(await repository.getDossier(USER_A, ownedDossier.id)).toBeNull();

    const replacement = await dossier(service, repository, USER_A, ownedDossier.missionId);
    await expect(
      service.createJob(principal(USER_A, repository), { ...input, dossierId: replacement.id })
    ).rejects.toMatchObject({ status: 410, code: 'JOB_GONE' });
    expect(provider.starts).toHaveLength(1);
    expect(repository.dailyAdmissions.get(USER_A)).toEqual({ total: 1, analyses: 1 });
  });

  it('does not restore the daily pilot quota when a dossier is deleted', async () => {
    const repository = new InMemoryCopilotRepository({ [USER_A]: { balance: 0 } });
    repository.dailyAdmissions.set(USER_A, { total: 19, analyses: 9 });
    const provider = new ScriptedCopilotProvider();
    provider.enqueueResult(completed('session-quota-delete', VALID_ANALYSIS));
    const service = createService(repository, provider);
    const ownedDossier = await dossier(service, repository, USER_A, 'mission-quota-delete');
    const created = await service.createJob(
      principal(USER_A, repository),
      jobInput(ownedDossier.id, 'quota-slot-20', 'analysis')
    );
    await service.reviewJob(principal(USER_A, repository), created.job.id, 'reject');
    await service.deleteDossier(principal(USER_A, repository), ownedDossier.missionId);
    expect(repository.dailyAdmissions.get(USER_A)).toEqual({ total: 20, analyses: 10 });

    const nextDossier = await dossier(service, repository, USER_A, 'mission-quota-after-delete');
    await expect(
      service.createJob(
        principal(USER_A, repository),
        jobInput(nextDossier.id, 'quota-reset-attempt', 'analysis')
      )
    ).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    expect(provider.starts).toHaveLength(1);
  });
});
