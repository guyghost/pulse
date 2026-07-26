import { createActor } from 'xstate';
import { describe, expect, it, vi } from 'vitest';

import { finalizeConnectorHealthCapture } from '../../../scripts/connector-health/capture-finalize';
import {
  CAPTURE_SNAPSHOT_SCHEMA,
  CAPTURE_SNAPSHOT_VERSION,
} from '../../../scripts/connector-health/capture-snapshot';
import { sha256Hex } from '../../../scripts/connector-health/contracts';
import {
  provideConnectorHealthCaptureEffects,
  sendConnectorHealthEvent,
  type EvidenceIdentity,
} from '../../../scripts/connector-health/workflow-machine';

const sha = 'a'.repeat(64);

async function validatedCheckpoint(identity: EvidenceIdentity): Promise<Buffer> {
  const actor = createActor(
    provideConnectorHealthCaptureEffects({
      bindSource: async () => undefined,
      prepareToolchain: async () => undefined,
      runHealthCheck: async () => undefined,
      persistEvidence: async () => identity,
      validateEvidence: async () => identity,
      confirmArtifactUpload: async () => {
        throw new Error('upload must happen only after restore');
      },
    })
  ).start();
  expect(sendConnectorHealthEvent(actor, { type: 'TRIGGER_ACCEPTED' })).toBe(true);
  await vi.waitFor(() => expect(actor.getSnapshot().value).toBe('evidence_validated'));
  const bytes = Buffer.from(
    JSON.stringify({
      schema: CAPTURE_SNAPSHOT_SCHEMA,
      version: CAPTURE_SNAPSHOT_VERSION,
      snapshot: actor.getPersistedSnapshot(),
    })
  );
  actor.stop();
  return bytes;
}

describe('connector-health capture finalization restore', () => {
  it.each([
    ['passed', null, 'capture_passed', 'denied'],
    ['failed', sha, 'capture_failed', 'admitted'],
  ] as const)(
    'restores %s capture state and runs only the upload-owned actor',
    async (disposition, failureFingerprint, captureTerminal, issueAdmission) => {
      const snapshotBytes = await validatedCheckpoint({
        disposition,
        failureFingerprint,
        evidenceFileSha256: sha,
      });

      await expect(
        finalizeConnectorHealthCapture({
          snapshotBytes,
          expectedSnapshotSha256: sha256Hex(snapshotBytes),
          disposition,
          failureFingerprint,
          evidenceFileSha256: sha,
          uploadOutcome: 'success',
          artifactId: '123',
          artifactArchiveSha256: sha,
        })
      ).resolves.toMatchObject({
        captureTerminal,
        issueAdmission,
        disposition,
        failureFingerprint,
        evidenceFileSha256: sha,
        artifactId: '123',
        artifactArchiveSha256: sha,
      });
    }
  );

  it('fails closed from the restored state when the upload did not succeed', async () => {
    const snapshotBytes = await validatedCheckpoint({
      disposition: 'passed',
      failureFingerprint: null,
      evidenceFileSha256: sha,
    });

    await expect(
      finalizeConnectorHealthCapture({
        snapshotBytes,
        expectedSnapshotSha256: sha256Hex(snapshotBytes),
        disposition: 'passed',
        failureFingerprint: null,
        evidenceFileSha256: sha,
        uploadOutcome: 'failure',
        artifactId: null,
        artifactArchiveSha256: null,
      })
    ).resolves.toMatchObject({
      captureTerminal: 'capture_infrastructure_failed',
      issueAdmission: 'denied',
      artifactId: null,
    });
  });

  it('rejects checkpoint digest or evidence identity drift before upload confirmation', async () => {
    const snapshotBytes = await validatedCheckpoint({
      disposition: 'passed',
      failureFingerprint: null,
      evidenceFileSha256: sha,
    });

    await expect(
      finalizeConnectorHealthCapture({
        snapshotBytes,
        expectedSnapshotSha256: 'b'.repeat(64),
        disposition: 'passed',
        failureFingerprint: null,
        evidenceFileSha256: sha,
        uploadOutcome: 'success',
        artifactId: '123',
        artifactArchiveSha256: sha,
      })
    ).rejects.toThrow(/snapshot digest/i);

    const decoded = JSON.parse(snapshotBytes.toString('utf8')) as {
      snapshot: { context: { evidence: { evidenceFileSha256: string } } };
    };
    decoded.snapshot.context.evidence.evidenceFileSha256 = 'b'.repeat(64);
    const drifted = Buffer.from(JSON.stringify(decoded));
    await expect(
      finalizeConnectorHealthCapture({
        snapshotBytes: drifted,
        expectedSnapshotSha256: sha256Hex(drifted),
        disposition: 'passed',
        failureFingerprint: null,
        evidenceFileSha256: sha,
        uploadOutcome: 'success',
        artifactId: '123',
        artifactArchiveSha256: sha,
      })
    ).rejects.toThrow(/snapshot evidence identity/i);
  });
});
