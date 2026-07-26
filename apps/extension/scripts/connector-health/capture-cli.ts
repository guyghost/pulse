import { appendFile, mkdtemp, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { runConnectorHealthCapture } from './orchestrator';
import { verifyConnectorHealthRuntime } from './runtime-policy';

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '' || /[\0\r\n]/.test(value)) {
    throw new Error(`Required environment ${name} is absent or malformed.`);
  }
  return value;
}

export async function runConnectorHealthCaptureCli(): Promise<void> {
  const { extensionRoot, nodeExecutable } = await verifyConnectorHealthRuntime();
  const runnerTemp = await realpath(requiredEnvironment('RUNNER_TEMP'));
  const home = await mkdtemp(join(runnerTemp, 'connector-health-home-'));
  try {
    const eventName = requiredEnvironment('GITHUB_EVENT_NAME');
    if (eventName !== 'schedule' && eventName !== 'workflow_dispatch') {
      throw new Error('Connector health event is outside the admitted trigger set.');
    }
    const result = await runConnectorHealthCapture({
      extensionRoot,
      nodeExecutable,
      home,
      outputPath: join(extensionRoot, 'output/connector-health/connector-health-evidence.v1.json'),
      snapshotPath: join(
        extensionRoot,
        'output/connector-health/connector-health-capture.snapshot.json'
      ),
      capturedAt: new Date().toISOString(),
      source: {
        repository: requiredEnvironment('GITHUB_REPOSITORY'),
        sourceCommit: requiredEnvironment('GITHUB_SHA'),
        eventKind: eventName,
        ref: requiredEnvironment('GITHUB_REF'),
        runId: requiredEnvironment('GITHUB_RUN_ID'),
        runAttempt: Number(requiredEnvironment('GITHUB_RUN_ATTEMPT')),
      },
    });
    const outputPath = requiredEnvironment('GITHUB_OUTPUT');
    const output = [
      `disposition=${result.disposition}`,
      `failureFingerprint=${result.failureFingerprint ?? ''}`,
      `evidenceFileSha256=${result.evidenceFileSha256}`,
      `captureSnapshotSha256=${result.captureSnapshotSha256}`,
    ].join('\n');
    await appendFile(outputPath, `${output}\n`, { encoding: 'utf8' });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}
