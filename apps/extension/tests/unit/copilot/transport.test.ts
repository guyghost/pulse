import { describe, expect, it, vi } from 'vitest';

import {
  COPILOT_HTTP_TIMEOUT_MS,
  CopilotTransportError,
  createCopilotTransport,
} from '../../../src/lib/shell/copilot/transport';

const requestId = '11111111-1111-4111-8111-111111111111';
const inputHash = 'a'.repeat(64);
const remoteJob = {
  jobId: 'job-1',
  missionId: 'mission-1',
  requestId,
  kind: 'analysis' as const,
  inputHash,
  status: 'uncertain' as const,
  tjmFacts: null,
  result: null,
  error: null,
  creditsRemaining: 3,
  createdAtMs: 1,
  updatedAtMs: 2,
};

describe('Copilot HTTP transport', () => {
  it('keeps the client deadline beyond the maximum Eve provider deadline', () => {
    expect(COPILOT_HTTP_TIMEOUT_MS).toBeGreaterThan(120_000);
  });

  it('uses bearer and idempotency headers and validates an uncertain response', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(remoteJob), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    const transport = createCopilotTransport({
      accountOrigin: 'https://missionpulse.app',
      apiOrigin: 'https://copilot.missionpulse.app',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(
      transport.createJob(
        'private-session-bearer',
        {
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
          inputHash,
        },
        requestId
      )
    ).resolves.toEqual(remoteJob);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe('https://copilot.missionpulse.app/api/copilot/jobs');
    expect(init.credentials).toBe('omit');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer private-session-bearer',
      'Idempotency-Key': requestId,
    });
  });

  it('fails closed on malformed success payloads and maps unauthenticated responses', async () => {
    const malformed = createCopilotTransport({
      accountOrigin: 'https://missionpulse.app',
      apiOrigin: 'https://copilot.missionpulse.app',
      fetchImpl: vi.fn(
        async () => new Response(JSON.stringify({ status: 'running' }))
      ) as typeof fetch,
    });
    await expect(malformed.getJob('private-session-bearer', 'job-1')).rejects.toMatchObject({
      copilotError: { code: 'PROTOCOL_ERROR' },
    } satisfies Partial<CopilotTransportError>);

    const unauthorized = createCopilotTransport({
      accountOrigin: 'https://missionpulse.app',
      apiOrigin: 'https://copilot.missionpulse.app',
      fetchImpl: vi.fn(async () => new Response('', { status: 401 })) as typeof fetch,
    });
    await expect(unauthorized.syncEntitlement('private-session-bearer')).rejects.toMatchObject({
      copilotError: { code: 'AUTH_REQUIRED', retryable: false },
    } satisfies Partial<CopilotTransportError>);

    const limited = createCopilotTransport({
      accountOrigin: 'https://missionpulse.app',
      apiOrigin: 'https://copilot.missionpulse.app',
      fetchImpl: vi.fn(async () => new Response('', { status: 429 })) as typeof fetch,
    });
    await expect(limited.syncEntitlement('private-session-bearer')).rejects.toMatchObject({
      copilotError: { code: 'RATE_LIMITED', retryable: false },
    } satisfies Partial<CopilotTransportError>);

    const gone = createCopilotTransport({
      accountOrigin: 'https://missionpulse.app',
      apiOrigin: 'https://copilot.missionpulse.app',
      fetchImpl: vi.fn(async () => new Response('', { status: 410 })) as typeof fetch,
    });
    await expect(gone.getJob('private-session-bearer', 'deleted-job')).rejects.toMatchObject({
      copilotError: { code: 'JOB_GONE', retryable: false },
    } satisfies Partial<CopilotTransportError>);
  });

  it('defines the exact link endpoint contract', () => {
    const transport = createCopilotTransport({
      accountOrigin: 'https://missionpulse.app',
      apiOrigin: 'https://copilot.missionpulse.app',
      fetchImpl: vi.fn() as typeof fetch,
    });
    const url = new URL(
      transport.createLinkUrl(
        'https://extension.chromiumapp.org/copilot',
        '33333333-3333-4333-8333-333333333333'
      )
    );
    expect(url.pathname).toBe('/api/copilot/link');
    expect(url.searchParams.get('redirect_uri')).toBe('https://extension.chromiumapp.org/copilot');
    expect(url.searchParams.get('state')).toBe('33333333-3333-4333-8333-333333333333');
  });

  it('reads the owner dossier through the side-effect-free GET contract', async () => {
    const projection = {
      missionId: 'mission-1',
      state: 'ready',
      consent: { missionFields: ['title'], profileFields: [], evidenceIds: [] },
      analysis: null,
      approvedArtifacts: [
        {
          artifactId: 'artifact-1',
          jobId: 'job-1',
          kind: 'pitch',
          draft: 'Brouillon approuvé.',
          approvedAtMs: 1,
        },
      ],
      activeJob: null,
    };
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(projection), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    const transport = createCopilotTransport({
      accountOrigin: 'https://missionpulse.app',
      apiOrigin: 'https://copilot.missionpulse.app',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(transport.getDossier('private-session-bearer', 'mission-1')).resolves.toEqual(
      projection
    );
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe('https://copilot.missionpulse.app/api/copilot/dossiers/mission-1');
    expect(init.method).toBeUndefined();
    expect(init.credentials).toBe('omit');
  });
});
