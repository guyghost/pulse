import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createActor } from 'xstate';

import { observeConnectorHealthArtifact } from './artifact-observer';
import { createGitHubApiTransport } from './github-transport';
import { settleConnectorHealthIssue } from './issue-client';
import { loadTrustedFailureEvidence } from './issue-writer';
import { verifyConnectorHealthRuntime } from './runtime-policy';
import { provideConnectorHealthIssueEffects, sendConnectorHealthEvent } from './workflow-machine';

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '' || /[\0\r\n]/.test(value)) {
    throw new Error(`Required environment ${name} is absent or malformed.`);
  }
  return value;
}

export async function runConnectorHealthIssueWriterCli(): Promise<void> {
  await verifyConnectorHealthRuntime();
  const eventName = requiredEnvironment('GITHUB_EVENT_NAME');
  if (eventName !== 'schedule' && eventName !== 'workflow_dispatch') {
    throw new Error('Issue writer event identity is outside policy.');
  }
  const expectedArchiveDigest = requiredEnvironment('EXPECTED_ARTIFACT_ARCHIVE_SHA256');
  if (!/^[0-9a-f]{64}$/.test(expectedArchiveDigest)) {
    throw new Error('Artifact archive digest output is malformed.');
  }
  const repository = requiredEnvironment('GITHUB_REPOSITORY');
  const sourceCommit = requiredEnvironment('GITHUB_SHA');
  const runId = requiredEnvironment('GITHUB_RUN_ID');
  const artifactId = requiredEnvironment('EXPECTED_ARTIFACT_ID');
  const token = requiredEnvironment('GITHUB_TOKEN');
  let settled: Awaited<ReturnType<typeof settleConnectorHealthIssue>> | undefined;
  let effectFailure: unknown;
  const logic = provideConnectorHealthIssueEffects({
    settle: async (report, signal) => {
      try {
        report({ type: 'DOWNLOAD_START' });
        const observedArtifact = await observeConnectorHealthArtifact({
          token,
          expectedRepository: repository,
          expectedSourceCommit: sourceCommit,
          expectedRunId: runId,
          expectedArtifactId: artifactId,
          expectedArtifactName: 'connector-health-report',
          expectedArtifactArchiveSha256: expectedArchiveDigest,
        });
        if (signal.aborted) {
          throw new Error('Connector health issue controller was cancelled.');
        }
        const evidence = await loadTrustedFailureEvidence({
          evidencePath: join(
            process.cwd(),
            'output/connector-health/connector-health-evidence.v1.json'
          ),
          expectedEvidenceFileSha256: requiredEnvironment('EXPECTED_EVIDENCE_FILE_SHA256'),
          expectedFailureFingerprint: requiredEnvironment('EXPECTED_FAILURE_FINGERPRINT'),
          expectedRepository: repository,
          expectedSourceCommit: sourceCommit,
          expectedEventKind: eventName,
          expectedRef: requiredEnvironment('GITHUB_REF'),
          expectedRunId: runId,
          expectedRunAttempt: Number(requiredEnvironment('GITHUB_RUN_ATTEMPT')),
          expectedWorkflowPath: '.github/workflows/connector-health.yml',
          expectedArtifactId: artifactId,
          expectedArtifactName: 'connector-health-report',
          expectedArtifactArchiveSha256: expectedArchiveDigest,
          observedArtifact,
        });
        if (evidence.source.repository !== repository || evidence.failureFingerprint === null) {
          throw new Error('Downloaded evidence does not match the admitted issue workflow.');
        }
        report({ type: 'DOWNLOADED_EVIDENCE_VERIFIED' });
        settled = await settleConnectorHealthIssue({
          repository,
          sourceCommit: evidence.source.sourceCommit,
          failureFingerprint: evidence.failureFingerprint,
          failureCodes: evidence.failureCodes,
          request: createGitHubApiTransport(token, repository),
          sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
          nowMs: () => performance.now(),
          onProtocolEvent: report,
        });
      } catch (error) {
        effectFailure = error;
        throw error;
      }
    },
  });
  const actor = createActor(logic).start();
  if (!sendConnectorHealthEvent(actor, { type: 'ISSUE_JOB_ADMITTED' })) {
    actor.stop();
    throw new Error('Connector health issue admission was rejected.');
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
  if (snapshot.status === 'done' && snapshot.output !== undefined) {
    await appendFile(
      requiredEnvironment('GITHUB_OUTPUT'),
      `issueTerminal=${snapshot.output.issueTerminal}\n`,
      'utf8'
    );
  }
  if (
    snapshot.status !== 'done' ||
    snapshot.output?.issueTerminal !== 'issue_settled' ||
    settled === undefined
  ) {
    throw new Error('Connector health issue actor did not reach issue_settled.', {
      cause: effectFailure,
    });
  }
  process.stdout.write(`connector-health ${settled.kind} issue #${settled.issueNumber}\n`);
}
