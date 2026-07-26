import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildConnectorHealthEvidence,
  sha256Hex,
} from '../../../scripts/connector-health/contracts';
import { loadTrustedFailureEvidence } from '../../../scripts/connector-health/issue-writer';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function failedEvidenceFile() {
  const root = await mkdtemp(join(tmpdir(), 'connector-health-writer-'));
  roots.push(root);
  const path = join(root, 'connector-health-evidence.v1.json');
  const built = buildConnectorHealthEvidence({
    capturedAt: '2026-07-16T08:00:00.000Z',
    source: {
      repository: 'guyghost/pulse',
      sourceCommit: 'a'.repeat(40),
      eventKind: 'schedule',
      ref: 'refs/heads/main',
      runId: '123',
      runAttempt: 1,
    },
    child: {
      exitCode: 1,
      signal: null,
      timedOut: false,
      stdout: { prefix: Buffer.from('{"invalid":true}'), truncated: false },
      stderr: { prefix: new Uint8Array(), truncated: false },
    },
  });
  await writeFile(path, built.bytes);
  return { path, built };
}

describe('connector-health downloaded evidence admission', () => {
  it('admits only the exact downloaded failed envelope and all expected identities', async () => {
    const { path, built } = await failedEvidenceFile();

    await expect(
      loadTrustedFailureEvidence({
        evidencePath: path,
        expectedEvidenceFileSha256: sha256Hex(built.bytes),
        expectedFailureFingerprint: built.evidence.failureFingerprint!,
        expectedRepository: built.evidence.source.repository,
        expectedSourceCommit: built.evidence.source.sourceCommit,
        expectedEventKind: built.evidence.source.eventKind,
        expectedRef: built.evidence.source.ref,
        expectedRunId: built.evidence.source.runId,
        expectedRunAttempt: built.evidence.source.runAttempt,
        expectedWorkflowPath: '.github/workflows/connector-health.yml',
        expectedArtifactId: '456',
        expectedArtifactName: 'connector-health-report',
        expectedArtifactArchiveSha256: 'c'.repeat(64),
        observedArtifact: {
          artifactId: '456',
          artifactName: 'connector-health-report',
          artifactArchiveSha256: 'c'.repeat(64),
          archiveBytes: 512,
        },
      })
    ).resolves.toEqual(built.evidence);
  });

  it('rejects a file-digest mismatch before issue settlement', async () => {
    const { path, built } = await failedEvidenceFile();

    await expect(
      loadTrustedFailureEvidence({
        evidencePath: path,
        expectedEvidenceFileSha256: 'f'.repeat(64),
        expectedFailureFingerprint: built.evidence.failureFingerprint!,
        expectedRepository: built.evidence.source.repository,
        expectedSourceCommit: built.evidence.source.sourceCommit,
        expectedEventKind: built.evidence.source.eventKind,
        expectedRef: built.evidence.source.ref,
        expectedRunId: built.evidence.source.runId,
        expectedRunAttempt: built.evidence.source.runAttempt,
        expectedWorkflowPath: '.github/workflows/connector-health.yml',
        expectedArtifactId: '456',
        expectedArtifactName: 'connector-health-report',
        expectedArtifactArchiveSha256: 'c'.repeat(64),
        observedArtifact: {
          artifactId: '456',
          artifactName: 'connector-health-report',
          artifactArchiveSha256: 'c'.repeat(64),
          archiveBytes: 512,
        },
      })
    ).rejects.toThrow(/file digest/i);
  });

  it('rejects stale run/ref/attempt or artifact identity before issue API admission', async () => {
    const { path, built } = await failedEvidenceFile();
    const base = {
      evidencePath: path,
      expectedEvidenceFileSha256: sha256Hex(built.bytes),
      expectedFailureFingerprint: built.evidence.failureFingerprint!,
      expectedRepository: built.evidence.source.repository,
      expectedSourceCommit: built.evidence.source.sourceCommit,
      expectedEventKind: built.evidence.source.eventKind,
      expectedRef: built.evidence.source.ref,
      expectedRunId: built.evidence.source.runId,
      expectedRunAttempt: built.evidence.source.runAttempt,
      expectedWorkflowPath: '.github/workflows/connector-health.yml' as const,
      expectedArtifactId: '456',
      expectedArtifactName: 'connector-health-report' as const,
      expectedArtifactArchiveSha256: 'c'.repeat(64),
      observedArtifact: {
        artifactId: '456',
        artifactName: 'connector-health-report',
        artifactArchiveSha256: 'c'.repeat(64),
        archiveBytes: 512,
      },
    };

    await expect(loadTrustedFailureEvidence({ ...base, expectedRunId: '999' })).rejects.toThrow(
      /identities/i
    );
    await expect(
      loadTrustedFailureEvidence({ ...base, expectedRef: 'refs/heads/other' })
    ).rejects.toThrow(/identities/i);
    await expect(
      loadTrustedFailureEvidence({ ...base, expectedArtifactName: 'other' as never })
    ).rejects.toThrow(/artifact/i);
  });

  it.each([
    ['id', { artifactId: '999' }],
    ['name', { artifactName: 'other-artifact' }],
    ['archive digest', { artifactArchiveSha256: 'd'.repeat(64) }],
  ])('rejects an observed artifact %s mismatch before issue API admission', async (_, mismatch) => {
    const { path, built } = await failedEvidenceFile();
    const expectedDigest = 'c'.repeat(64);

    await expect(
      loadTrustedFailureEvidence({
        evidencePath: path,
        expectedEvidenceFileSha256: sha256Hex(built.bytes),
        expectedFailureFingerprint: built.evidence.failureFingerprint!,
        expectedRepository: built.evidence.source.repository,
        expectedSourceCommit: built.evidence.source.sourceCommit,
        expectedEventKind: built.evidence.source.eventKind,
        expectedRef: built.evidence.source.ref,
        expectedRunId: built.evidence.source.runId,
        expectedRunAttempt: built.evidence.source.runAttempt,
        expectedWorkflowPath: '.github/workflows/connector-health.yml',
        expectedArtifactId: '456',
        expectedArtifactName: 'connector-health-report',
        expectedArtifactArchiveSha256: expectedDigest,
        observedArtifact: {
          artifactId: '456',
          artifactName: 'connector-health-report',
          artifactArchiveSha256: expectedDigest,
          archiveBytes: 512,
          ...mismatch,
        },
      })
    ).rejects.toThrow(/observed artifact identity/i);
  });
});
