import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GitReleaseCandidateSourcePort } from '../../../scripts/release-readiness/git-source';

function git(repository: string, args: readonly string[]): string {
  return execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
}

describe('real Git release candidate source', () => {
  it('binds clean HEAD -> commit -> tree -> exact blobs and fails closed on drift', () => {
    const repository = mkdtempSync(join(tmpdir(), 'pulse-release-git-'));
    try {
      git(repository, ['init', '--quiet']);
      git(repository, ['config', 'user.name', 'MissionPulse Test']);
      git(repository, ['config', 'user.email', 'test@missionpulse.invalid']);
      git(repository, ['config', 'commit.gpgsign', 'false']);
      mkdirSync(join(repository, 'apps/extension'), { recursive: true });
      writeFileSync(join(repository, '.gitignore'), 'built-manifest.json\n');
      writeFileSync(join(repository, 'apps/extension/package.json'), '{"version":"0.2.2"}');
      writeFileSync(join(repository, 'apps/extension/connectors.config.json'), '{}');
      git(repository, ['add', '.']);
      git(repository, ['commit', '--quiet', '-m', 'test: source']);
      const sourceCommit = git(repository, ['rev-parse', 'HEAD']);
      const gitTreeObjectId = git(repository, ['rev-parse', 'HEAD^{tree}']);
      const builtManifestPath = join(repository, 'built-manifest.json');
      writeFileSync(builtManifestPath, '{"manifest_version":3,"version":"0.2.2"}');

      const source = new GitReleaseCandidateSourcePort({
        workspaceRoot: repository,
        builtManifestPath,
      });
      expect(
        Buffer.from(
          source.readGitBlob({
            sourceCommit,
            gitTreeObjectId,
            path: 'apps/extension/package.json',
          }) ?? []
        ).toString('utf8')
      ).toBe('{"version":"0.2.2"}');
      writeFileSync(join(repository, 'apps/extension/package.json'), '{"version":"9.9.9"}');
      expect(() =>
        source.readGitBlob({
          sourceCommit,
          gitTreeObjectId,
          path: 'apps/extension/package.json',
        })
      ).toThrow(/clean|drift|HEAD|tree/i);

      writeFileSync(join(repository, 'apps/extension/package.json'), '{"version":"0.2.2"}');
      writeFileSync(join(repository, 'apps/extension/untracked.ts'), 'export {};');
      expect(() =>
        source.readGitBlob({
          sourceCommit,
          gitTreeObjectId,
          path: 'apps/extension/package.json',
        })
      ).toThrow(/untracked|uncommitted|clean/i);
    } finally {
      rmSync(repository, { recursive: true, force: true });
    }
  });
});
