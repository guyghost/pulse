import { createActor, type SnapshotFrom } from 'xstate';

import { decodeConnectorHealthCaptureSnapshot } from './capture-snapshot';
import {
  provideConnectorHealthCaptureEffects,
  sendConnectorHealthEvent,
  type CaptureOutput,
} from './workflow-machine';

const shaPattern = /^[0-9a-f]{64}$/;

export async function finalizeConnectorHealthCapture(input: {
  snapshotBytes: Uint8Array;
  expectedSnapshotSha256: string;
  disposition: 'passed' | 'failed';
  failureFingerprint: string | null;
  evidenceFileSha256: string;
  uploadOutcome: 'success' | 'failure' | 'cancelled' | 'skipped';
  artifactId: string | null;
  artifactArchiveSha256: string | null;
}): Promise<CaptureOutput> {
  if (
    !shaPattern.test(input.evidenceFileSha256) ||
    (input.disposition === 'passed'
      ? input.failureFingerprint !== null
      : input.failureFingerprint === null || !shaPattern.test(input.failureFingerprint)) ||
    (input.uploadOutcome === 'success'
      ? input.artifactId === null ||
        !/^[1-9]\d{0,31}$/.test(input.artifactId) ||
        input.artifactArchiveSha256 === null ||
        !shaPattern.test(input.artifactArchiveSha256)
      : input.artifactId !== null || input.artifactArchiveSha256 !== null)
  ) {
    throw new Error('Capture finalization identity is malformed.');
  }
  const evidenceIdentity = {
    disposition: input.disposition,
    failureFingerprint: input.failureFingerprint,
    evidenceFileSha256: input.evidenceFileSha256,
  };
  const persistedSnapshot = decodeConnectorHealthCaptureSnapshot({
    bytes: input.snapshotBytes,
    expectedSha256: input.expectedSnapshotSha256,
    expectedEvidence: evidenceIdentity,
  });
  const rejectReplay = async (): Promise<never> => {
    throw new Error('Capture finalization attempted to replay a completed effect.');
  };
  const logic = provideConnectorHealthCaptureEffects({
    bindSource: rejectReplay,
    prepareToolchain: rejectReplay,
    runHealthCheck: rejectReplay,
    persistEvidence: rejectReplay,
    validateEvidence: rejectReplay,
    confirmArtifactUpload: async (observed, signal) => {
      if (
        signal.aborted ||
        observed.disposition !== evidenceIdentity.disposition ||
        observed.failureFingerprint !== evidenceIdentity.failureFingerprint ||
        observed.evidenceFileSha256 !== evidenceIdentity.evidenceFileSha256 ||
        input.uploadOutcome !== 'success'
      ) {
        throw new Error('Capture artifact upload was not authoritatively confirmed.');
      }
      return {
        artifactId: input.artifactId as string,
        artifactArchiveSha256: input.artifactArchiveSha256 as string,
      };
    },
  });
  const actor = createActor(logic, {
    snapshot: persistedSnapshot as SnapshotFrom<typeof logic>,
  }).start();
  if (
    actor.getSnapshot().status !== 'active' ||
    actor.getSnapshot().value !== 'evidence_validated' ||
    !sendConnectorHealthEvent(actor, { type: 'UPLOAD_START' })
  ) {
    actor.stop();
    throw new Error('Capture finalization could not resume the evidence-validated actor.');
  }
  await new Promise<void>((resolve) => {
    const observe = (observed: { status: string }): void => {
      if (observed.status === 'done') {
        subscription.unsubscribe();
        resolve();
      }
    };
    const subscription = actor.subscribe(observe);
    observe(actor.getSnapshot());
  });
  const snapshot = actor.getSnapshot();
  actor.stop();
  if (snapshot.status !== 'done' || snapshot.output === undefined) {
    throw new Error('Capture finalization actor did not reach a final state.');
  }
  const expectedTerminal =
    input.uploadOutcome === 'success'
      ? input.disposition === 'passed'
        ? 'capture_passed'
        : 'capture_failed'
      : 'capture_infrastructure_failed';
  if (
    snapshot.output.captureTerminal !== expectedTerminal ||
    snapshot.output.disposition !== evidenceIdentity.disposition ||
    snapshot.output.failureFingerprint !== evidenceIdentity.failureFingerprint ||
    snapshot.output.evidenceFileSha256 !== evidenceIdentity.evidenceFileSha256 ||
    (input.uploadOutcome === 'success'
      ? snapshot.output.artifactId !== input.artifactId ||
        snapshot.output.artifactArchiveSha256 !== input.artifactArchiveSha256
      : snapshot.output.artifactId !== null || snapshot.output.artifactArchiveSha256 !== null)
  ) {
    throw new Error('Capture finalization output drifted from restored actor authority.');
  }
  return snapshot.output;
}
