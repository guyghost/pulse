import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Mission } from '../../../src/lib/core/types/mission';
import type { UserProfile } from '../../../src/lib/core/types/profile';
import { buildConsentedCopilotPayload } from '../../../src/lib/core/copilot/build-consented-payload';
import type { CopilotCheckpointRepository } from '../../../src/lib/shell/copilot/checkpoints';
import {
  createCopilotCoordinator,
  type CopilotCoordinatorDependencies,
} from '../../../src/lib/shell/copilot/coordinator';
import type {
  CopilotJobCheckpoint,
  CopilotRemoteJob,
  CopilotSessionCredential,
} from '../../../src/lib/shell/copilot/contracts';
import type { CopilotSessionRepository } from '../../../src/lib/shell/copilot/session';
import { computeCopilotInputHash } from '../../../src/lib/shell/copilot/input-hash';
import {
  CopilotTransportError,
  type CopilotTransport,
} from '../../../src/lib/shell/copilot/transport';

const createRequestId = '11111111-1111-4111-8111-111111111111';
const readRequestId = '22222222-2222-4222-8222-222222222222';
const session: CopilotSessionCredential = {
  version: 1,
  subject: 'user-1',
  bearer: 'session-bearer-with-enough-length',
};

const mission: Mission = {
  id: 'mission-1',
  title: 'Mission Svelte',
  client: 'Acme',
  description: 'Construire un produit Svelte.',
  stack: ['Svelte'],
  tjm: 700,
  location: 'Paris',
  remote: 'hybrid',
  duration: null,
  startDate: null,
  publishedAt: null,
  url: 'https://platform.example/private',
  source: 'free-work',
  scrapedAt: new Date('2026-07-21T10:00:00.000Z'),
  seniority: null,
  scoreBreakdown: null,
  score: null,
  semanticScore: null,
  semanticReason: null,
};

const profile: UserProfile = {
  firstName: 'Ada',
  keywords: ['Svelte'],
  tjmMin: 600,
  tjmMax: 800,
  location: 'Paris',
  remote: 'any',
  seniority: 'senior',
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
      description: 'Livraison d’une migration Svelte.',
      skills: ['Svelte'],
      source: 'manual',
      sourceExternalId: 'secret-external-id',
      positionIndex: 0,
      updatedAt: 1,
    },
  ],
};

function remoteJob(overrides: Partial<CopilotRemoteJob> = {}): CopilotRemoteJob {
  return {
    jobId: 'job-1',
    missionId: 'mission-1',
    requestId: createRequestId,
    kind: 'analysis',
    inputHash: '0'.repeat(64),
    status: 'queued',
    tjmFacts: null,
    result: null,
    error: null,
    creditsRemaining: 4,
    createdAtMs: 1_000,
    updatedAtMs: 1_001,
    ...overrides,
  };
}

function createMemoryRepositories() {
  let credential: CopilotSessionCredential | null = session;
  const records = new Map<string, CopilotJobCheckpoint>();
  const sessions: CopilotSessionRepository = {
    load: vi.fn(async () => credential),
    save: vi.fn(async (next) => {
      credential = next;
    }),
    clear: vi.fn(async () => {
      credential = null;
    }),
  };
  const checkpoints: CopilotCheckpointRepository = {
    load: vi.fn(async (missionId) => records.get(missionId) ?? null),
    save: vi.fn(async (checkpoint) => {
      records.set(checkpoint.missionId, structuredClone(checkpoint));
    }),
    remove: vi.fn(async (missionId) => {
      records.delete(missionId);
    }),
    loadDeletionReceipt: vi.fn(async () => null),
    saveDeletionReceipt: vi.fn(async () => undefined),
    removeDeletionReceipt: vi.fn(async () => undefined),
  };
  return { checkpoints, records, sessions };
}

function createTransport(): CopilotTransport {
  return {
    createLinkUrl: vi.fn(() => 'https://missionpulse.app/api/copilot/link'),
    syncEntitlement: vi.fn(async () => ({
      status: 'active',
      subject: 'user-1',
      issuedAtMs: 500,
      expiresAtMs: 20_000,
      creditsRemaining: 5,
    })),
    createJob: vi.fn(async (_bearer, input) => remoteJob({ inputHash: input.inputHash })),
    getJob: vi.fn(async () => remoteJob({ status: 'running' })),
    getDossier: vi.fn(async () => ({
      missionId: 'mission-1',
      state: 'ready',
      consent: { missionFields: ['title'], profileFields: [], evidenceIds: [] },
      analysis: null,
      approvedArtifacts: [],
      activeJob: null,
    })),
    cancelJob: vi.fn(async () => remoteJob({ status: 'cancelled' })),
    reviewJob: vi.fn(async () => remoteJob({ status: 'accepted' })),
    deleteDossier: vi.fn(async (_bearer, missionId) => ({
      missionId,
      disposition: 'deleted',
    })),
  };
}

function dependencies(
  repositories: ReturnType<typeof createMemoryRepositories>,
  transport: CopilotTransport,
  overrides: Partial<CopilotCoordinatorDependencies> = {}
): CopilotCoordinatorDependencies {
  return {
    rolloutEnabled: true,
    identity: {
      getRedirectURL: () => 'https://extension.chromiumapp.org/copilot',
      launchWebAuthFlow: vi.fn(async () => undefined),
    },
    sessions: repositories.sessions,
    checkpoints: repositories.checkpoints,
    transport,
    getMissionById: vi.fn(async (id) => (id === mission.id ? mission : null)),
    getProfile: vi.fn(async () => profile),
    loadTJMHistory: vi.fn(async () => ({ records: [] })),
    now: () => 1_000,
    randomUUID: () => '33333333-3333-4333-8333-333333333333',
    ...overrides,
  };
}

const command = {
  requestId: createRequestId,
  missionId: 'mission-1',
  kind: 'analysis' as const,
  missionFields: ['title', 'description'] as const,
  profileFields: ['jobTitle'] as const,
  evidenceIds: ['exp-1'] as const,
};

async function storedAnalysisCheckpoint(
  selection: CopilotJobCheckpoint['selection'],
  status: CopilotJobCheckpoint['status'] = 'queued'
): Promise<CopilotJobCheckpoint> {
  const built = buildConsentedCopilotPayload(mission, profile, selection);
  if (!built.ok) {
    throw new Error('Invalid test checkpoint payload');
  }
  const material = {
    schemaVersion: 1 as const,
    missionId: mission.id,
    kind: 'analysis' as const,
    consent: selection,
    input: built.payload,
    tjmFacts: null,
  };
  const inputHash = await computeCopilotInputHash(material);
  return {
    version: 1,
    ...remoteJob({ status, inputHash }),
    creditCost: 0,
    selection,
    createInput: { ...material, inputHash },
  };
}

describe('CopilotCoordinator', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the public dossier without entitlement sync or job recovery', async () => {
    const repositories = createMemoryRepositories();
    const transport = createTransport();
    const result = await createCopilotCoordinator(dependencies(repositories, transport)).getDossier(
      readRequestId,
      'mission-1'
    );

    expect(result).toMatchObject({
      outcome: 'ok',
      dossier: { missionId: 'mission-1', state: 'ready', approvedArtifacts: [] },
    });
    expect(transport.getDossier).toHaveBeenCalledWith(session.bearer, 'mission-1');
    expect(transport.syncEntitlement).not.toHaveBeenCalled();
    expect(transport.getJob).not.toHaveBeenCalled();
    expect(transport.createJob).not.toHaveBeenCalled();
  });

  it('commits a minimal checkpoint before POST and builds the payload from canonical data', async () => {
    const repositories = createMemoryRepositories();
    const transport = createTransport();
    vi.mocked(transport.createJob).mockImplementation(async (_bearer, input, key) => {
      expect(repositories.records.get('mission-1')).toMatchObject({
        jobId: null,
        status: 'checkpointed',
        requestId: createRequestId,
      });
      expect(key).toBe(createRequestId);
      expect(input).toMatchObject({
        schemaVersion: 1,
        missionId: 'mission-1',
        kind: 'analysis',
        consent: {
          missionFields: ['title', 'description'],
          profileFields: ['jobTitle'],
          evidenceIds: ['exp-1'],
        },
        input: {
          mission: { title: 'Mission Svelte', description: 'Construire un produit Svelte.' },
          profile: { jobTitle: 'Lead frontend' },
          experienceEvidence: [
            {
              evidenceId: 'exp-1',
              role: 'Lead frontend',
              company: 'Example',
              summary: 'Livraison d’une migration Svelte.',
              skills: ['Svelte'],
            },
          ],
        },
        tjmFacts: null,
      });
      expect(input.inputHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(input)).not.toContain('private');
      expect(JSON.stringify(input)).not.toContain('secret-external-id');
      return remoteJob({ inputHash: input.inputHash });
    });

    const result = await createCopilotCoordinator(dependencies(repositories, transport)).createJob(
      command
    );

    expect(result).toMatchObject({ outcome: 'ok', job: { jobId: 'job-1', status: 'queued' } });
    expect(transport.syncEntitlement).toHaveBeenCalledBefore(transport.createJob as never);
  });

  it('rejects an artifact without selected evidence before entitlement or reservation', async () => {
    const repositories = createMemoryRepositories();
    const transport = createTransport();

    await expect(
      createCopilotCoordinator(dependencies(repositories, transport)).createJob({
        ...command,
        kind: 'pitch',
        evidenceIds: [],
      })
    ).resolves.toMatchObject({ outcome: 'error', error: { code: 'INVALID_REQUEST' } });
    expect(transport.syncEntitlement).not.toHaveBeenCalled();
    expect(transport.createJob).not.toHaveBeenCalled();
    expect(repositories.records.size).toBe(0);
  });

  it('reposts a checkpoint without jobId with the same idempotency key after a worker restart', async () => {
    const repositories = createMemoryRepositories();
    const firstTransport = createTransport();
    vi.mocked(firstTransport.createJob).mockRejectedValueOnce(
      new CopilotTransportError({
        code: 'NETWORK_ERROR',
        message: 'network lost',
        retryable: true,
      })
    );

    const firstResult = await createCopilotCoordinator(
      dependencies(repositories, firstTransport)
    ).createJob(command);
    expect(firstResult).toMatchObject({ outcome: 'error', error: { code: 'NETWORK_ERROR' } });
    expect(repositories.records.get('mission-1')).toMatchObject({
      jobId: null,
      requestId: createRequestId,
      status: 'checkpointed',
    });

    const restartedTransport = createTransport();
    const restarted = createCopilotCoordinator(dependencies(repositories, restartedTransport));
    const recovered = await restarted.getJob(readRequestId, 'mission-1');

    expect(recovered).toMatchObject({
      requestId: readRequestId,
      outcome: 'ok',
      job: { jobId: 'job-1', requestId: createRequestId },
    });
    expect(restartedTransport.createJob).toHaveBeenCalledTimes(1);
    expect(restartedTransport.createJob).toHaveBeenCalledWith(
      session.bearer,
      expect.any(Object),
      createRequestId
    );
    expect(restartedTransport.getJob).not.toHaveBeenCalled();
  });

  it('replays and reviews an artifact against the immutable pre-POST source snapshot', async () => {
    const repositories = createMemoryRepositories();
    const firstTransport = createTransport();
    vi.mocked(firstTransport.createJob).mockRejectedValueOnce(
      new CopilotTransportError({
        code: 'NETWORK_ERROR',
        message: 'network lost',
        retryable: true,
      })
    );
    let currentProfile = structuredClone(profile);
    const initialDependencies = dependencies(repositories, firstTransport, {
      getProfile: vi.fn(async () => currentProfile),
    });
    const pitchCommand = { ...command, kind: 'pitch' as const };

    await expect(
      createCopilotCoordinator(initialDependencies).createJob(pitchCommand)
    ).resolves.toMatchObject({ outcome: 'error', error: { code: 'NETWORK_ERROR' } });
    const checkpointHash = repositories.records.get('mission-1')?.createInput.inputHash;
    expect(checkpointHash).toMatch(/^[0-9a-f]{64}$/);

    currentProfile = {
      ...currentProfile,
      experiences: currentProfile.experiences.map((experience) => ({
        ...experience,
        description: 'Profil modifié après le POST initial.',
      })),
    };
    const restartedTransport = createTransport();
    const reviewedResult = {
      schemaVersion: 1 as const,
      kind: 'pitch' as const,
      evidenceClaims: [],
      gaps: [],
      risks: [],
      questions: [],
      draftSegments: [
        {
          text: 'Pitch à relire.',
          sourceRefs: [
            {
              kind: 'experience' as const,
              id: 'exp-1',
              quote: 'Livraison d’une migration Svelte',
            },
          ],
        },
      ],
    };
    vi.mocked(restartedTransport.createJob).mockImplementation(async (_bearer, input) => {
      expect(input.input.experienceEvidence[0]?.summary).toBe('Livraison d’une migration Svelte.');
      expect(input.inputHash).toBe(checkpointHash);
      return remoteJob({
        kind: 'pitch',
        status: 'review',
        inputHash: input.inputHash,
        result: reviewedResult,
      });
    });
    vi.mocked(restartedTransport.reviewJob).mockImplementation(async () =>
      remoteJob({
        kind: 'pitch',
        status: 'accepted',
        inputHash: checkpointHash,
        result: reviewedResult,
      })
    );
    const restartedDependencies = dependencies(repositories, restartedTransport, {
      getProfile: vi.fn(async () => currentProfile),
      getMissionById: vi.fn(async () => ({ ...mission, title: 'Mission modifiée' })),
    });
    const restarted = createCopilotCoordinator(restartedDependencies);

    const recovered = await restarted.getJob(readRequestId, mission.id);

    expect(recovered).toMatchObject({
      outcome: 'ok',
      job: {
        status: 'review',
        sourceSnapshot: {
          inputHash: checkpointHash,
          payload: {
            mission: { title: 'Mission Svelte' },
            experienceEvidence: [{ summary: 'Livraison d’une migration Svelte.' }],
          },
        },
      },
    });
    expect(restartedDependencies.getProfile).not.toHaveBeenCalled();
    expect(restartedDependencies.getMissionById).not.toHaveBeenCalled();

    await expect(
      restarted.reviewJob('33333333-3333-4333-8333-333333333333', mission.id, 'job-1', 'accept')
    ).resolves.toMatchObject({ outcome: 'ok', job: { status: 'accepted' } });
  });

  it('uses GET and never reposts when a recovered checkpoint already has a jobId', async () => {
    const repositories = createMemoryRepositories();
    repositories.records.set(
      'mission-1',
      await storedAnalysisCheckpoint({
        missionFields: ['title'],
        profileFields: [],
        evidenceIds: [],
      })
    );
    const transport = createTransport();
    vi.mocked(transport.getJob).mockImplementation(async () => {
      const inputHash = repositories.records.get('mission-1')?.createInput.inputHash;
      return remoteJob({ status: 'running', inputHash });
    });

    const result = await createCopilotCoordinator(dependencies(repositories, transport)).getJob(
      readRequestId,
      'mission-1'
    );

    expect(result).toMatchObject({ outcome: 'ok', job: { status: 'running' } });
    expect(transport.getJob).toHaveBeenCalledWith(session.bearer, 'job-1');
    expect(transport.createJob).not.toHaveBeenCalled();
  });

  it('gates only new creation while preserving entitlement sync for recovery', async () => {
    const repositories = createMemoryRepositories();
    const transport = createTransport();
    const deps = dependencies(repositories, transport, { rolloutEnabled: false });
    const coordinator = createCopilotCoordinator(deps);

    await expect(coordinator.createJob(command)).resolves.toMatchObject({
      outcome: 'error',
      error: { code: 'ROLLOUT_DISABLED' },
    });
    await expect(coordinator.syncEntitlement(readRequestId)).resolves.toMatchObject({
      outcome: 'synced',
      state: 'active',
      error: null,
    });
    expect(transport.syncEntitlement).toHaveBeenCalledOnce();
    expect(transport.createJob).not.toHaveBeenCalled();
  });

  it('keeps a local recovery projection and confirmed deletion after rollout withdrawal', async () => {
    const repositories = createMemoryRepositories();
    repositories.records.set(
      'mission-1',
      await storedAnalysisCheckpoint(
        {
          missionFields: ['title'],
          profileFields: [],
          evidenceIds: [],
        },
        'cancelled'
      )
    );
    const transport = createTransport();
    vi.mocked(transport.getJob).mockRejectedValue(
      new CopilotTransportError({
        code: 'ROLLOUT_DISABLED',
        message: 'Le rollout a été retiré.',
        retryable: false,
      })
    );
    const coordinator = createCopilotCoordinator(
      dependencies(repositories, transport, { rolloutEnabled: false })
    );

    await expect(coordinator.getJob(readRequestId, 'mission-1')).resolves.toMatchObject({
      outcome: 'local',
      job: {
        jobId: 'job-1',
        status: 'cancelled',
        selection: { missionFields: ['title'] },
      },
      error: { code: 'ROLLOUT_DISABLED' },
    });
    await expect(coordinator.deleteDossier(readRequestId, 'mission-1')).resolves.toMatchObject({
      outcome: 'deleted',
      disposition: 'deleted',
    });
    expect(transport.getJob).toHaveBeenCalledOnce();
    expect(transport.deleteDossier).toHaveBeenCalledOnce();
    expect(repositories.records.has('mission-1')).toBe(false);
  });

  it('refuses local dossier deletion while the checkpoint is active or awaiting review', async () => {
    for (const status of ['queued', 'running', 'review', 'cancelling', 'uncertain'] as const) {
      const repositories = createMemoryRepositories();
      repositories.records.set(
        mission.id,
        await storedAnalysisCheckpoint(
          { missionFields: ['title'], profileFields: [], evidenceIds: [] },
          status
        )
      );
      const transport = createTransport();

      await expect(
        createCopilotCoordinator(dependencies(repositories, transport)).deleteDossier(
          readRequestId,
          mission.id
        )
      ).resolves.toMatchObject({
        outcome: 'error',
        error: { code: 'DELETE_FAILED', retryable: false },
      });
      expect(transport.deleteDossier).not.toHaveBeenCalled();
    }
  });

  it.each(['deleted', 'retention-confirmed', 'not-created'] as const)(
    'persists the %s deletion receipt before clearing the checkpoint',
    async (disposition) => {
      const repositories = createMemoryRepositories();
      repositories.records.set(
        mission.id,
        await storedAnalysisCheckpoint(
          {
            missionFields: ['title'],
            profileFields: [],
            evidenceIds: [],
          },
          'cancelled'
        )
      );
      const transport = createTransport();
      vi.mocked(transport.deleteDossier).mockResolvedValue({
        missionId: mission.id,
        disposition,
      });

      await expect(
        createCopilotCoordinator(dependencies(repositories, transport)).deleteDossier(
          readRequestId,
          mission.id
        )
      ).resolves.toMatchObject({
        outcome: 'deleted',
        disposition,
        receipt: { version: 1, missionId: mission.id, disposition, confirmedAtMs: 1_000 },
      });
      expect(repositories.checkpoints.saveDeletionReceipt).toHaveBeenCalledBefore(
        repositories.checkpoints.remove as never
      );
    }
  );

  it('attaches consent-gated deterministic facts only to a TJM coach request', async () => {
    const repositories = createMemoryRepositories();
    const transport = createTransport();
    vi.mocked(transport.createJob).mockImplementation(async (_bearer, input) => {
      expect(input.tjmFacts).toMatchObject({
        confidence: 'low',
        missionDisplayedTjm: 700,
        profileBounds: { min: 600, target: 700, max: 800 },
        market: { sampleCount: 3, weightedAverage: 720 },
      });
      expect(repositories.records.get('mission-1')?.tjmFacts).toEqual(input.tjmFacts);
      const facts = input.tjmFacts;
      expect(facts).not.toBeNull();
      return remoteJob({
        kind: 'tjm-coach',
        inputHash: input.inputHash,
        // Simulate a jsonb round-trip whose object keys are returned in a
        // different order while values and array ordering remain identical.
        tjmFacts: facts
          ? {
              market: {
                lastObservedAt: facts.market.lastObservedAt,
                trend: facts.market.trend,
                max: facts.market.max,
                weightedAverage: facts.market.weightedAverage,
                min: facts.market.min,
                sampleCount: facts.market.sampleCount,
                recordCount: facts.market.recordCount,
                matchedStacks: facts.market.matchedStacks,
              },
              profileBounds: {
                currency: facts.profileBounds.currency,
                max: facts.profileBounds.max,
                target: facts.profileBounds.target,
                min: facts.profileBounds.min,
              },
              missionDisplayedTjm: facts.missionDisplayedTjm,
              confidence: facts.confidence,
              schemaVersion: facts.schemaVersion,
            }
          : null,
      });
    });
    const deps = dependencies(repositories, transport, {
      loadTJMHistory: vi.fn(async () => ({
        records: [
          {
            stack: 'svelte',
            date: '2026-07-20',
            min: 650,
            max: 800,
            average: 720,
            sampleCount: 3,
            seniority: null,
            region: null,
          },
        ],
      })),
    });

    const result = await createCopilotCoordinator(deps).createJob({
      ...command,
      kind: 'tjm-coach',
      missionFields: ['title', 'description', 'stack', 'displayedTjm'],
      profileFields: ['jobTitle', 'keywords', 'tjmBounds'],
    });

    expect(result).toMatchObject({
      outcome: 'ok',
      job: { kind: 'tjm-coach', tjmFacts: { confidence: 'low' } },
    });
  });

  it('rejects a remote TJM echo that differs from the durable local checkpoint', async () => {
    const repositories = createMemoryRepositories();
    const transport = createTransport();
    vi.mocked(transport.createJob).mockImplementation(async (_bearer, input) =>
      remoteJob({
        kind: 'tjm-coach',
        inputHash: input.inputHash,
        tjmFacts: input.tjmFacts
          ? {
              ...input.tjmFacts,
              market: { ...input.tjmFacts.market, weightedAverage: 999 },
            }
          : null,
      })
    );
    const deps = dependencies(repositories, transport, {
      loadTJMHistory: vi.fn(async () => ({
        records: [
          {
            stack: 'svelte',
            date: '2026-07-20',
            min: 650,
            max: 800,
            average: 720,
            sampleCount: 3,
            seniority: null,
            region: null,
          },
        ],
      })),
    });

    await expect(
      createCopilotCoordinator(deps).createJob({
        ...command,
        kind: 'tjm-coach',
        missionFields: ['title', 'description', 'stack', 'displayedTjm'],
        profileFields: ['jobTitle', 'keywords', 'tjmBounds'],
      })
    ).resolves.toMatchObject({ outcome: 'error', error: { code: 'PROTOCOL_ERROR' } });
    expect(repositories.records.get('mission-1')).toMatchObject({
      status: 'checkpointed',
      tjmFacts: { market: { weightedAverage: 720 } },
    });
  });
});
