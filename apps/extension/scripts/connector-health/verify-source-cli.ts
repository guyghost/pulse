import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { verifyConnectorHealthRuntime } from './runtime-policy.ts';
import { verifyConnectorHealthSource } from './source-policy.ts';

const execFileAsync = promisify(execFile);

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '' || /[\0\r\n]/.test(value)) {
    throw new Error(`Required environment ${name} is absent or malformed.`);
  }
  return value;
}

async function git(workspace: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', [...args], {
    cwd: workspace,
    encoding: 'utf8',
    maxBuffer: 65_536,
    windowsHide: true,
  });
  return result.stdout;
}

async function main(): Promise<void> {
  const { workspace } = await verifyConnectorHealthRuntime();
  const eventName = requiredEnvironment('GITHUB_EVENT_NAME');
  if (eventName !== 'schedule' && eventName !== 'workflow_dispatch') {
    throw new Error('Connector health event is outside policy.');
  }
  const repository = requiredEnvironment('GITHUB_REPOSITORY');
  await verifyConnectorHealthSource({
    eventKind: eventName,
    repository,
    eventRepository: requiredEnvironment('EVENT_REPOSITORY'),
    ref: requiredEnvironment('GITHUB_REF'),
    refType: requiredEnvironment('GITHUB_REF_TYPE'),
    sourceCommit: requiredEnvironment('GITHUB_SHA'),
    workflowPath: '.github/workflows/connector-health.yml',
    workflowRef: requiredEnvironment('GITHUB_WORKFLOW_REF'),
    workflowSha: requiredEnvironment('GITHUB_WORKFLOW_SHA'),
    defaultBranch: requiredEnvironment('DEFAULT_BRANCH'),
    readHead: () => git(workspace, ['rev-parse', 'HEAD']),
    readStatus: () => git(workspace, ['status', '--porcelain=v1', '--untracked-files=all']),
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown source verification error.';
  process.stderr.write(`connector-health source verification failure: ${message}\n`);
  process.exitCode = 1;
});
