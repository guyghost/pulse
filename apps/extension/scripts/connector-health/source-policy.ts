export async function verifyConnectorHealthSource(input: {
  eventKind: 'schedule' | 'workflow_dispatch';
  repository: string;
  eventRepository: string;
  ref: string;
  refType: string;
  sourceCommit: string;
  workflowPath: '.github/workflows/connector-health.yml';
  workflowRef: string;
  workflowSha: string;
  defaultBranch: string;
  readHead: () => Promise<string>;
  readStatus: () => Promise<string>;
}): Promise<void> {
  if (input.eventKind !== 'schedule' && input.eventKind !== 'workflow_dispatch') {
    throw new Error('Connector health event is outside the admitted trigger set.');
  }
  if (
    !/^[A-Za-z0-9](?:[A-Za-z0-9._/-]{0,253}[A-Za-z0-9])?$/.test(input.defaultBranch) ||
    input.defaultBranch.includes('..') ||
    input.defaultBranch.includes('//')
  ) {
    throw new Error('Repository default branch is invalid.');
  }
  if (
    !/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(input.repository) ||
    input.eventRepository !== input.repository
  ) {
    throw new Error('Connector health repository identity is invalid.');
  }
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(input.sourceCommit)) {
    throw new Error('Workflow source commit is invalid.');
  }
  if (input.refType !== 'branch') {
    throw new Error('Connector health source must be a branch ref.');
  }
  if (input.ref !== `refs/heads/${input.defaultBranch}`) {
    throw new Error('Connector health must run on the repository default branch.');
  }
  if (
    input.workflowPath !== '.github/workflows/connector-health.yml' ||
    input.workflowRef !== `${input.repository}/${input.workflowPath}@${input.ref}` ||
    input.workflowSha !== input.sourceCommit
  ) {
    throw new Error('Connector health workflow identity does not match source SHA/ref.');
  }
  if ((await input.readHead()).trim() !== input.sourceCommit) {
    throw new Error('Checked-out HEAD does not equal github.sha.');
  }
  if ((await input.readStatus()).trim() !== '') {
    throw new Error('Connector health source worktree must be clean.');
  }
}
