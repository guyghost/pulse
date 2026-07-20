import { mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ReleaseRuntimeContractError } from '../../../scripts/release-runtime/contract';
import {
  RELEASE_CONTROLLER_EXECUTION_AUTHORITY_PATH,
  main,
  readReleaseControllerExecutionAuthorityFile,
} from '../../../scripts/release-runtime/controller-entry';

const roots: string[] = [];

async function root(): Promise<string> {
  const value = await realpath(await mkdtemp(join(tmpdir(), 'missionpulse-controller-entry-')));
  roots.push(value);
  return value;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true })));
});

describe('release controller production entry', () => {
  it('binds production authority to the single fixed evidence path', () => {
    expect(RELEASE_CONTROLLER_EXECUTION_AUTHORITY_PATH).toBe(
      '/inputs/evidence/release-controller-execution-authority.json'
    );
  });

  it('captures one bounded no-follow authority file as strict JSON', async () => {
    const directory = await root();
    const path = join(directory, 'authority.json');
    await writeFile(path, '{"schema":"sentinel","version":1}');

    await expect(readReleaseControllerExecutionAuthorityFile(path)).resolves.toEqual({
      schema: 'sentinel',
      version: 1,
    });
  });

  it('rejects duplicate JSON authority keys and a symlinked authority', async () => {
    const directory = await root();
    const duplicate = join(directory, 'duplicate.json');
    await writeFile(duplicate, '{"version":1,"version":2}');
    await expect(readReleaseControllerExecutionAuthorityFile(duplicate)).rejects.toThrow();

    const target = join(directory, 'target.json');
    const alias = join(directory, 'alias.json');
    await writeFile(target, '{"version":1}');
    await symlink(target, alias);
    await expect(readReleaseControllerExecutionAuthorityFile(alias)).rejects.toThrow();
  });

  it('accepts no CLI or environment authority override', async () => {
    let authorityRead = false;
    await expect(
      main(['--authority', '/tmp/forged.json'], {
        ports: {
          readExecutionAuthority: async () => {
            authorityRead = true;
            return {};
          },
          observeRuntime: async () => ({}),
          observePayload: async () => ({
            candidateArtifactTree: {} as never,
            evidenceInventory: [],
            controllerBundleSha256: '0'.repeat(64),
          }),
          publishRuntimeEvidence: async () => undefined,
        },
      })
    ).rejects.toBeInstanceOf(ReleaseRuntimeContractError);
    expect(authorityRead).toBe(false);
  });
});
