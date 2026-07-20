import { lstat, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import {
  MAX_EVIDENCE_BYTES,
  sha256Hex,
  validateConnectorHealthEvidenceBytes,
  type ConnectorHealthEvidenceV1,
} from './contracts';
import {
  MAX_CONNECTOR_HEALTH_ARTIFACT_ARCHIVE_BYTES,
  type ObservedConnectorHealthArtifact,
} from './artifact-observer';

function sha256(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be lower-case SHA-256.`);
  }
}

export async function loadTrustedFailureEvidence(input: {
  evidencePath: string;
  expectedEvidenceFileSha256: string;
  expectedFailureFingerprint: string;
  expectedRepository: string;
  expectedSourceCommit: string;
  expectedEventKind: 'schedule' | 'workflow_dispatch';
  expectedRef: string;
  expectedRunId: string;
  expectedRunAttempt: number;
  expectedWorkflowPath: '.github/workflows/connector-health.yml';
  expectedArtifactId: string;
  expectedArtifactName: 'connector-health-report';
  expectedArtifactArchiveSha256: string;
  observedArtifact: ObservedConnectorHealthArtifact;
}): Promise<ConnectorHealthEvidenceV1> {
  sha256(input.expectedEvidenceFileSha256, 'Expected evidence file digest');
  sha256(input.expectedFailureFingerprint, 'Expected failure fingerprint');
  sha256(input.expectedArtifactArchiveSha256, 'Expected artifact archive digest');
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(input.expectedSourceCommit)) {
    throw new Error('Expected source commit must be lower-case Git hex.');
  }
  if (
    input.expectedArtifactName !== 'connector-health-report' ||
    !/^[1-9]\d{0,31}$/.test(input.expectedArtifactId)
  ) {
    throw new Error('Expected artifact identity is malformed.');
  }
  sha256(input.observedArtifact.artifactArchiveSha256, 'Observed artifact archive digest');
  if (
    input.observedArtifact.artifactId !== input.expectedArtifactId ||
    input.observedArtifact.artifactName !== input.expectedArtifactName ||
    input.observedArtifact.artifactArchiveSha256 !== input.expectedArtifactArchiveSha256 ||
    !Number.isSafeInteger(input.observedArtifact.archiveBytes) ||
    input.observedArtifact.archiveBytes <= 0 ||
    input.observedArtifact.archiveBytes > MAX_CONNECTOR_HEALTH_ARTIFACT_ARCHIVE_BYTES
  ) {
    throw new Error('Observed artifact identity does not match the admitted upload outputs.');
  }
  if (
    input.expectedWorkflowPath !== '.github/workflows/connector-health.yml' ||
    !/^\d{1,32}$/.test(input.expectedRunId) ||
    !Number.isInteger(input.expectedRunAttempt) ||
    input.expectedRunAttempt < 1 ||
    input.expectedRunAttempt > 1_000
  ) {
    throw new Error('Expected current-run identity is malformed.');
  }
  const stat = await lstat(input.evidencePath);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    stat.size <= 0 ||
    stat.size > MAX_EVIDENCE_BYTES
  ) {
    throw new Error('Downloaded connector health evidence is not one bounded regular file.');
  }
  const bytes = await readFile(input.evidencePath);
  if (sha256Hex(bytes) !== input.expectedEvidenceFileSha256) {
    throw new Error('Downloaded connector health evidence file digest mismatch.');
  }
  const evidence = validateConnectorHealthEvidenceBytes(bytes);
  if (
    evidence.disposition !== 'failed' ||
    evidence.failureFingerprint !== input.expectedFailureFingerprint ||
    evidence.source.repository !== input.expectedRepository ||
    evidence.source.sourceCommit !== input.expectedSourceCommit ||
    evidence.source.eventKind !== input.expectedEventKind ||
    evidence.source.ref !== input.expectedRef ||
    evidence.source.runId !== input.expectedRunId ||
    evidence.source.runAttempt !== input.expectedRunAttempt ||
    evidence.source.workflowPath !== input.expectedWorkflowPath
  ) {
    throw new Error('Downloaded connector health failure identities do not match capture outputs.');
  }
  return evidence;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  import('./issue-writer-cli')
    .then(({ runConnectorHealthIssueWriterCli }) => runConnectorHealthIssueWriterCli())
    .catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Unknown connector health issue error.';
      process.stderr.write(`connector-health issue settlement failure: ${message}\n`);
      process.exitCode = 1;
    });
}
