import { appendFile, lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { finalizeConnectorHealthCapture } from './capture-finalize';
import { MAX_CAPTURE_SNAPSHOT_BYTES } from './capture-snapshot';
import { MAX_EVIDENCE_BYTES, sha256Hex, validateConnectorHealthEvidenceBytes } from './contracts';
import { requireConnectorHealthEnvironment, verifyConnectorHealthRuntime } from './runtime-policy';

async function main(): Promise<void> {
  const { extensionRoot } = await verifyConnectorHealthRuntime();
  const environment = process.env;
  const evidencePath = join(
    extensionRoot,
    'output/connector-health/connector-health-evidence.v1.json'
  );
  const snapshotPath = join(
    extensionRoot,
    'output/connector-health/connector-health-capture.snapshot.json'
  );
  const stat = await lstat(evidencePath);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    stat.size <= 0 ||
    stat.size > MAX_EVIDENCE_BYTES
  ) {
    throw new Error('Capture finalization evidence file is not one bounded regular file.');
  }
  const bytes = await readFile(evidencePath);
  const snapshotStat = await lstat(snapshotPath);
  if (
    !snapshotStat.isFile() ||
    snapshotStat.isSymbolicLink() ||
    snapshotStat.nlink !== 1 ||
    snapshotStat.size <= 0 ||
    snapshotStat.size > MAX_CAPTURE_SNAPSHOT_BYTES
  ) {
    throw new Error('Capture finalization snapshot is not one bounded regular file.');
  }
  const snapshotBytes = await readFile(snapshotPath);
  const evidence = validateConnectorHealthEvidenceBytes(bytes);
  const evidenceFileSha256 = requireConnectorHealthEnvironment(
    environment,
    'CAPTURE_EVIDENCE_FILE_SHA256'
  );
  const disposition = requireConnectorHealthEnvironment(environment, 'CAPTURE_DISPOSITION');
  const failureFingerprint = environment.CAPTURE_FAILURE_FINGERPRINT || null;
  if (
    sha256Hex(bytes) !== evidenceFileSha256 ||
    evidence.disposition !== disposition ||
    evidence.failureFingerprint !== failureFingerprint
  ) {
    throw new Error('Capture finalization evidence identity drifted before upload confirmation.');
  }
  if (disposition !== 'passed' && disposition !== 'failed') {
    throw new Error('Capture finalization disposition is malformed.');
  }
  const uploadOutcome = requireConnectorHealthEnvironment(environment, 'UPLOAD_OUTCOME');
  if (!['success', 'failure', 'cancelled', 'skipped'].includes(uploadOutcome)) {
    throw new Error('Capture upload outcome is malformed.');
  }
  const typedUploadOutcome = uploadOutcome as 'success' | 'failure' | 'cancelled' | 'skipped';
  const uploadSucceeded = uploadOutcome === 'success';
  const output = await finalizeConnectorHealthCapture({
    snapshotBytes,
    expectedSnapshotSha256: requireConnectorHealthEnvironment(
      environment,
      'CAPTURE_SNAPSHOT_SHA256'
    ),
    disposition,
    failureFingerprint,
    evidenceFileSha256,
    uploadOutcome: typedUploadOutcome,
    artifactId: uploadSucceeded
      ? requireConnectorHealthEnvironment(environment, 'UPLOADED_ARTIFACT_ID')
      : null,
    artifactArchiveSha256: uploadSucceeded
      ? requireConnectorHealthEnvironment(environment, 'UPLOADED_ARTIFACT_ARCHIVE_SHA256')
      : null,
  });
  const outputPath = requireConnectorHealthEnvironment(environment, 'GITHUB_OUTPUT');
  await appendFile(
    outputPath,
    [
      `captureTerminal=${output.captureTerminal}`,
      `issueAdmission=${output.issueAdmission}`,
      `disposition=${output.disposition ?? ''}`,
      `failureFingerprint=${output.failureFingerprint ?? ''}`,
      `evidenceFileSha256=${output.evidenceFileSha256 ?? ''}`,
      `artifactId=${output.artifactId ?? ''}`,
      `artifactArchiveSha256=${output.artifactArchiveSha256 ?? ''}`,
      '',
    ].join('\n'),
    'utf8'
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown capture finalization error.';
  process.stderr.write(`connector-health capture finalization failure: ${message}\n`);
  process.exitCode = 1;
});
