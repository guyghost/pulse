import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_CONNECTOR_HEALTH_ARTIFACT_ARCHIVE_BYTES,
  observeConnectorHealthArtifact,
} from '../../../scripts/connector-health/artifact-observer';
import { sha256Hex } from '../../../scripts/connector-health/contracts';

const TOKEN = 'github-token';
const REPOSITORY = 'guyghost/pulse';
const ARTIFACT_ID = '456';
const RUN_ID = '123';
const SOURCE_COMMIT = 'a'.repeat(40);
const ARCHIVE_BYTES = Buffer.from('actual connector health archive');
const ARCHIVE_DIGEST = sha256Hex(ARCHIVE_BYTES);
const STORAGE_URL =
  'https://pipelines.actions.githubusercontent.com/artifacts/connector-health.zip?signature=opaque';

function metadata(overrides: Record<string, unknown> = {}): Response {
  return Response.json(
    {
      id: Number(ARTIFACT_ID),
      name: 'connector-health-report',
      expired: false,
      archive_download_url: `https://api.github.com/repos/${REPOSITORY}/actions/artifacts/${ARTIFACT_ID}/zip`,
      workflow_run: {
        id: Number(RUN_ID),
        head_sha: SOURCE_COMMIT,
      },
      ...overrides,
    },
    { status: 200 }
  );
}

function redirect(location = STORAGE_URL): Response {
  return new Response(null, { status: 302, headers: { location } });
}

function archive(bytes = ARCHIVE_BYTES): Response {
  return new Response(bytes, {
    status: 200,
    headers: { 'content-length': String(bytes.byteLength) },
  });
}

function observationInput() {
  return {
    token: TOKEN,
    expectedRepository: REPOSITORY,
    expectedSourceCommit: SOURCE_COMMIT,
    expectedRunId: RUN_ID,
    expectedArtifactId: ARTIFACT_ID,
    expectedArtifactName: 'connector-health-report' as const,
    expectedArtifactArchiveSha256: ARCHIVE_DIGEST,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('connector-health artifact observation', () => {
  it('observes the real metadata name and hashes the real redirected archive without forwarding Authorization', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(metadata())
      .mockResolvedValueOnce(redirect())
      .mockResolvedValueOnce(archive());
    vi.stubGlobal('fetch', fetch);

    await expect(observeConnectorHealthArtifact(observationInput())).resolves.toEqual({
      artifactId: ARTIFACT_ID,
      artifactName: 'connector-health-report',
      artifactArchiveSha256: ARCHIVE_DIGEST,
      archiveBytes: ARCHIVE_BYTES.byteLength,
    });

    expect(fetch).toHaveBeenCalledTimes(3);
    const metadataHeaders = fetch.mock.calls[0][1]?.headers as Record<string, string>;
    const redirectHeaders = fetch.mock.calls[1][1]?.headers as Record<string, string>;
    const storageHeaders = fetch.mock.calls[2][1]?.headers as Record<string, string>;
    expect(metadataHeaders.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(redirectHeaders.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(storageHeaders.Authorization).toBeUndefined();
    expect(fetch.mock.calls[1][1]).toMatchObject({ redirect: 'manual' });
    expect(fetch.mock.calls[2][0]).toEqual(new URL(STORAGE_URL));
  });

  it('rejects a real metadata name mismatch before requesting archive bytes', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(metadata({ name: 'attacker-controlled-artifact' }));
    vi.stubGlobal('fetch', fetch);

    await expect(observeConnectorHealthArtifact(observationInput())).rejects.toThrow(
      /artifact name mismatch/i
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects when the SHA-256 of the downloaded archive differs from the upload output', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(metadata())
      .mockResolvedValueOnce(redirect())
      .mockResolvedValueOnce(archive(Buffer.from('different archive')));
    vi.stubGlobal('fetch', fetch);

    await expect(observeConnectorHealthArtifact(observationInput())).rejects.toThrow(
      /archive digest mismatch/i
    );
  });

  it('rejects an archive declared above the byte cap before reading it', async () => {
    const oversized = new Response('not read', {
      status: 200,
      headers: {
        'content-length': String(MAX_CONNECTOR_HEALTH_ARTIFACT_ARCHIVE_BYTES + 1),
      },
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(metadata())
      .mockResolvedValueOnce(redirect())
      .mockResolvedValueOnce(oversized);
    vi.stubGlobal('fetch', fetch);

    await expect(observeConnectorHealthArtifact(observationInput())).rejects.toThrow(/byte bound/i);
  });

  it('rejects a redirect outside approved storage hosts without exposing the token', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(metadata())
      .mockResolvedValueOnce(redirect('https://attacker.example/archive.zip'));
    vi.stubGlobal('fetch', fetch);

    await expect(observeConnectorHealthArtifact(observationInput())).rejects.toThrow(
      /storage redirect/i
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('gives every network and body-read operation an AbortSignal-derived time bound', async () => {
    const signal = new AbortController().signal;
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(signal);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(metadata())
      .mockResolvedValueOnce(redirect())
      .mockResolvedValueOnce(archive());
    vi.stubGlobal('fetch', fetch);

    await observeConnectorHealthArtifact(observationInput());

    expect(AbortSignal.timeout).toHaveBeenCalledTimes(3);
    for (const [, init] of fetch.mock.calls) {
      expect(init?.signal).toBe(signal);
    }
  });
});
