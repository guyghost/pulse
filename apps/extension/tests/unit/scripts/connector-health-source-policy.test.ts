import { describe, expect, it, vi } from 'vitest';

import { verifyConnectorHealthSource } from '../../../scripts/connector-health/source-policy';

const base = {
  eventKind: 'workflow_dispatch' as const,
  repository: 'guyghost/pulse',
  eventRepository: 'guyghost/pulse',
  ref: 'refs/heads/main',
  refType: 'branch',
  sourceCommit: 'a'.repeat(40),
  workflowPath: '.github/workflows/connector-health.yml' as const,
  workflowRef: 'guyghost/pulse/.github/workflows/connector-health.yml@refs/heads/main',
  workflowSha: 'a'.repeat(40),
  defaultBranch: 'main',
  readHead: vi.fn(async () => 'a'.repeat(40)),
  readStatus: vi.fn(async () => ''),
};

describe('connector-health source admission', () => {
  it('admits exact clean default-branch/ref/SHA/workflow identity without an API decision', async () => {
    await expect(verifyConnectorHealthSource(base)).resolves.toBeUndefined();
  });

  it('rejects feature refs, dirty worktrees and repository/workflow identity drift', async () => {
    await expect(
      verifyConnectorHealthSource({ ...base, ref: 'refs/heads/feature' })
    ).rejects.toThrow(/default branch/i);
    await expect(
      verifyConnectorHealthSource({ ...base, readStatus: async () => ' M package.json' })
    ).rejects.toThrow(/clean/i);
    await expect(
      verifyConnectorHealthSource({ ...base, eventRepository: 'attacker/fork' })
    ).rejects.toThrow(/repository/i);
    await expect(
      verifyConnectorHealthSource({ ...base, workflowSha: 'b'.repeat(40) })
    ).rejects.toThrow(/workflow/i);
    await expect(verifyConnectorHealthSource({ ...base, refType: 'tag' })).rejects.toThrow(
      /branch/i
    );
  });
});
