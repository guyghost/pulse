import { describe, expect, it, vi } from 'vitest';

import { createCopilotCheckpointRepository } from '../../../src/lib/shell/copilot/checkpoints';
import type { CopilotJobCheckpoint } from '../../../src/lib/shell/copilot/contracts';
import { createCopilotSessionRepository } from '../../../src/lib/shell/copilot/session';

function storageArea() {
  const values: Record<string, unknown> = {};
  return {
    values,
    area: {
      get: vi.fn(async (keys: string | string[]) => {
        const requested = typeof keys === 'string' ? [keys] : keys;
        return Object.fromEntries(
          requested.filter((key) => key in values).map((key) => [key, values[key]])
        );
      }),
      set: vi.fn(async (items: Record<string, unknown>) => Object.assign(values, items)),
      remove: vi.fn(async (keys: string | string[]) => {
        for (const key of typeof keys === 'string' ? [keys] : keys) {
          delete values[key];
        }
      }),
    },
  };
}

const checkpoint: CopilotJobCheckpoint = {
  version: 1,
  jobId: 'job-1',
  missionId: 'mission-1',
  requestId: '11111111-1111-4111-8111-111111111111',
  kind: 'analysis',
  creditCost: 0,
  status: 'uncertain',
  tjmFacts: null,
  selection: { missionFields: ['title'], profileFields: [], evidenceIds: [] },
  createInput: {
    schemaVersion: 1,
    missionId: 'mission-1',
    kind: 'analysis',
    consent: { missionFields: ['title'], profileFields: [], evidenceIds: [] },
    input: {
      mission: { title: 'Mission' },
      profile: {},
      experienceEvidence: [],
    },
    tjmFacts: null,
    inputHash: 'ac5913e1b5bba8da3142511859d4256d85bc2a226462936f64abd535183423d0',
  },
  result: null,
  error: null,
  creditsRemaining: 4,
  createdAtMs: 1,
  updatedAtMs: 2,
};

describe('Copilot MV3 repositories', () => {
  it('stores the bearer only through the injected session storage area', async () => {
    const sessionStorage = storageArea();
    const repository = createCopilotSessionRepository(sessionStorage.area);
    const credential = {
      version: 1 as const,
      subject: 'user-1',
      bearer: 'session-bearer-with-enough-length',
    };

    await repository.save(credential);
    expect(sessionStorage.area.set).toHaveBeenCalledOnce();
    await expect(repository.load()).resolves.toEqual(credential);
  });

  it('removes malformed session data and malformed local checkpoints', async () => {
    const sessionStorage = storageArea();
    sessionStorage.values.copilotSessionCredentialV1 = {
      version: 1,
      subject: 'user-1',
      bearer: 'short',
    };
    const sessions = createCopilotSessionRepository(sessionStorage.area);
    await expect(sessions.load()).resolves.toBeNull();
    expect(sessionStorage.area.remove).toHaveBeenCalledWith('copilotSessionCredentialV1');

    const localStorage = storageArea();
    localStorage.values['copilotJobCheckpointV1:mission-1'] = {
      ...checkpoint,
      status: 'invented',
    };
    const checkpoints = createCopilotCheckpointRepository(localStorage.area);
    await expect(checkpoints.load('mission-1')).resolves.toBeNull();
    expect(localStorage.area.remove).toHaveBeenCalledWith('copilotJobCheckpointV1:mission-1');
  });

  it('round-trips a strict uncertain checkpoint for GET-based recovery', async () => {
    const localStorage = storageArea();
    const repository = createCopilotCheckpointRepository(localStorage.area);
    await repository.save(checkpoint);
    await expect(repository.load('mission-1')).resolves.toEqual(checkpoint);
  });

  it('persists the minimal deletion receipt independently from the cleared checkpoint', async () => {
    const localStorage = storageArea();
    const repository = createCopilotCheckpointRepository(localStorage.area);
    const receipt = {
      version: 1 as const,
      missionId: 'mission-1',
      disposition: 'retention-confirmed' as const,
      confirmedAtMs: 1_000,
    };

    await repository.save(checkpoint);
    await repository.saveDeletionReceipt(receipt);
    await repository.remove('mission-1');

    await expect(repository.load('mission-1')).resolves.toBeNull();
    await expect(repository.loadDeletionReceipt('mission-1')).resolves.toEqual(receipt);
  });
});
