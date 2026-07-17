import { createHash } from 'node:crypto';
import { chmod, link, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import {
  PYTHON_RUNTIME_INVENTORY_PROBE_SOURCE,
  ReleaseRuntimeProbeError,
  attestPythonExecutableAtPath,
  collectPythonRuntimeInventory,
  parseLinuxProcessStatus,
  verifyEffectiveLoadedObjectProbe,
  verifyPythonRuntimeInventoryProbe,
} from '../../../scripts/release-runtime/runtime-probe';
import type { VerifiedExecutionImageAuthorityV1 } from '../../../scripts/release-runtime/proof';

const temporaryRoots: string[] = [];

function executionImageAuthority(
  baseImageObjects: VerifiedExecutionImageAuthorityV1['baseImageObjects']
): VerifiedExecutionImageAuthorityV1 {
  return {
    schema: 'missionpulse.verified-execution-image-authority',
    version: 1,
    platform: 'linux/amd64',
    indexSha256: '8'.repeat(64),
    manifestSha256: '9'.repeat(64),
    configSha256: 'a'.repeat(64),
    layerSha256: ['c'.repeat(64)],
    diffIdSha256: ['d'.repeat(64)],
    finalRootInventorySha256: 'b'.repeat(64),
    baseImageObjects,
    baseImageObjectsSha256: createHash('sha256')
      .update(JSON.stringify(['missionpulse-verified-base-image-objects', 1, baseImageObjects]))
      .digest('hex'),
  };
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'missionpulse-runtime-'));
  temporaryRoots.push(root);
  return root;
}

async function createRuntimeFixture(): Promise<{
  parent: string;
  executable: string;
  library: string;
}> {
  const parent = await temporaryRoot();
  const python = join(parent, 'python');
  const bin = join(python, 'bin');
  const lib = join(python, 'lib');
  await mkdir(bin, { recursive: true });
  await mkdir(lib);
  const executable = join(bin, 'python3.14');
  const library = join(lib, 'module.so');
  await writeFile(executable, Buffer.from('ELF-python'));
  await writeFile(library, Buffer.from('loaded-library'));
  await symlink('../bin/python3.14', join(lib, 'python-link'));
  await chmod(executable, 0o555);
  await chmod(library, 0o444);
  await chmod(bin, 0o555);
  await chmod(lib, 0o555);
  await chmod(python, 0o555);
  return { parent, executable, library };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map(async (root) => {
      await chmod(join(root, 'python'), 0o755).catch(() => undefined);
      await chmod(join(root, 'python', 'bin'), 0o755).catch(() => undefined);
      await chmod(join(root, 'python', 'lib'), 0o755).catch(() => undefined);
      await rm(root, { recursive: true });
    })
  );
});

describe('Python standalone runtime inventory', () => {
  it('parses the exact Linux privilege proof', () => {
    expect(
      parseLinuxProcessStatus(
        ['Name:\tnode', 'CapEff:\t0000000000000000', 'NoNewPrivs:\t1'].join('\n')
      )
    ).toEqual({
      effectiveCapabilitiesHex: '0000000000000000',
      noNewPrivileges: true,
    });
  });

  it.each([
    ['retained capability', 'CapEff:\t0000000000000001\nNoNewPrivs:\t1'],
    ['new privileges allowed', 'CapEff:\t0000000000000000\nNoNewPrivs:\t0'],
    ['duplicate authority', 'CapEff:\t0000000000000000\nCapEff:\t0000000000000000\nNoNewPrivs:\t1'],
  ])('rejects a %s process status', (_label, status) => {
    expect(() => parseLinuxProcessStatus(status)).toThrow(ReleaseRuntimeProbeError);
  });

  it('derives the canonical directory, file and in-root symlink inventory from real bytes', async () => {
    const fixture = await createRuntimeFixture();
    const inventory = await collectPythonRuntimeInventory(fixture.parent);
    const entries = [
      ['python/bin', 'd', '0555', 0, ''],
      [
        'python/bin/python3.14',
        'f',
        '0555',
        10,
        createHash('sha256').update('ELF-python').digest('hex'),
      ],
      ['python/lib', 'd', '0555', 0, ''],
      [
        'python/lib/module.so',
        'f',
        '0444',
        14,
        createHash('sha256').update('loaded-library').digest('hex'),
      ],
      ['python/lib/python-link', 'l', 'link', 17, '../bin/python3.14'],
    ];
    const expectedTreeSha256 = createHash('sha256')
      .update(JSON.stringify(['missionpulse-python-runtime-tree', 1, entries]))
      .digest('hex');

    expect(inventory.proof).toEqual({
      entryCount: 5,
      fileCount: 2,
      directoryCount: 2,
      symlinkCount: 1,
      regularFileBytes: 24,
      treeSha256: expectedTreeSha256,
      executableSha256: createHash('sha256').update('ELF-python').digest('hex'),
    });
    expect(inventory.entries).toEqual(entries);
  });

  it('rejects a symlink whose normalized target escapes the Python root', async () => {
    const parent = await temporaryRoot();
    await mkdir(join(parent, 'python', 'lib'), { recursive: true });
    await symlink('../../../outside', join(parent, 'python', 'lib', 'escape'));

    await expect(collectPythonRuntimeInventory(parent)).rejects.toThrow(ReleaseRuntimeProbeError);
  });

  it('rejects hard-link aliases instead of hashing the same inode twice', async () => {
    const parent = await temporaryRoot();
    const python = join(parent, 'python');
    await mkdir(join(python, 'bin'), { recursive: true });
    const executable = join(python, 'bin', 'python3.14');
    await writeFile(executable, 'ELF-python');
    await link(executable, join(python, 'alias'));
    await chmod(executable, 0o555);
    await chmod(join(python, 'bin'), 0o555);
    await chmod(python, 0o555);

    await expect(collectPythonRuntimeInventory(parent)).rejects.toThrow(ReleaseRuntimeProbeError);
  });

  it('uses descriptor-relative no-follow traversal in the production inventory helper', () => {
    expect(PYTHON_RUNTIME_INVENTORY_PROBE_SOURCE).toContain('dir_fd=');
    expect(PYTHON_RUNTIME_INVENTORY_PROBE_SOURCE).toContain('follow_symlinks=False');
    expect(PYTHON_RUNTIME_INVENTORY_PROBE_SOURCE).toContain('O_NOFOLLOW');
    expect(PYTHON_RUNTIME_INVENTORY_PROBE_SOURCE).toContain('os.listdir(directory_descriptor)');
  });

  it('strictly verifies the descriptor-relative inventory helper output', async () => {
    const fixture = await createRuntimeFixture();
    const collected = await collectPythonRuntimeInventory(fixture.parent);
    const verified = verifyPythonRuntimeInventoryProbe(
      JSON.stringify({
        schema: 'missionpulse.python-runtime-inventory-probe',
        version: 1,
        entries: collected.entries,
      }),
      fixture.parent
    );

    expect(verified.proof).toEqual(collected.proof);
    expect(verified.entries).toEqual(collected.entries);
  });

  it('holds and revalidates exact executable bytes across helper execution', async () => {
    const root = await temporaryRoot();
    const executable = await realpath(root).then((canonicalRoot) =>
      join(canonicalRoot, 'python3.14')
    );
    const bytes = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.from('fixture')]);
    await writeFile(executable, bytes);
    await chmod(executable, 0o555);
    const attested = await attestPythonExecutableAtPath(
      executable,
      createHash('sha256').update(bytes).digest('hex')
    );
    try {
      await expect(attested.revalidate()).resolves.toBeUndefined();
      await chmod(executable, 0o755);
      await writeFile(
        executable,
        Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.from('changed')]).subarray(
          0,
          bytes.byteLength
        )
      );
      await expect(attested.revalidate()).rejects.toThrow(ReleaseRuntimeProbeError);
    } finally {
      await attested.close();
    }
  });
});

describe('effective loaded object proof', () => {
  it('reopens and hashes every mapped object rather than trusting helper output', async () => {
    const fixture = await createRuntimeFixture();
    const baseObject = join(await temporaryRoot(), 'loader.so');
    await writeFile(baseObject, 'base-loader');
    await chmod(baseObject, 0o444);
    const inventory = await collectPythonRuntimeInventory(fixture.parent);
    const entries = [baseObject, fixture.library]
      .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
      .map((path) => {
        const content = path === baseObject ? 'base-loader' : 'loaded-library';
        return {
          path,
          bytes: Buffer.byteLength(content),
          sha256: createHash('sha256').update(content).digest('hex'),
        };
      });

    const proof = await verifyEffectiveLoadedObjectProbe(
      JSON.stringify({
        schema: 'missionpulse.effective-loaded-objects-probe',
        version: 1,
        entries,
      }),
      inventory,
      executionImageAuthority(entries.filter((entry) => entry.path === baseObject))
    );

    expect(proof.entries).toEqual(
      entries.map((entry) => ({
        path: entry.path,
        source: entry.path.startsWith(`${inventory.absoluteRuntimeRoot}/`)
          ? 'python-runtime'
          : 'base-image',
        bytes: entry.bytes,
        sha256: entry.sha256,
      }))
    );
  });

  it('rejects a same-size loaded-object rewrite', async () => {
    const fixture = await createRuntimeFixture();
    const inventory = await collectPythonRuntimeInventory(fixture.parent);
    const originalSha256 = createHash('sha256').update('loaded-library').digest('hex');
    const raw = JSON.stringify({
      schema: 'missionpulse.effective-loaded-objects-probe',
      version: 1,
      entries: [{ path: fixture.library, bytes: 14, sha256: originalSha256 }],
    });
    await chmod(fixture.library, 0o644);
    await writeFile(fixture.library, 'hostile-change');

    await expect(
      verifyEffectiveLoadedObjectProbe(raw, inventory, executionImageAuthority([]))
    ).rejects.toThrow(ReleaseRuntimeProbeError);
  });

  it('rejects a symlink retarget instead of following it', async () => {
    const fixture = await createRuntimeFixture();
    const inventory = await collectPythonRuntimeInventory(fixture.parent);
    const objectRoot = await temporaryRoot();
    const target = join(objectRoot, 'target.so');
    const mappedPath = join(objectRoot, 'mapped.so');
    await writeFile(target, 'base-loader');
    await symlink(target, mappedPath);
    const raw = JSON.stringify({
      schema: 'missionpulse.effective-loaded-objects-probe',
      version: 1,
      entries: [
        {
          path: mappedPath,
          bytes: 11,
          sha256: createHash('sha256').update('base-loader').digest('hex'),
        },
      ],
    });

    await expect(
      verifyEffectiveLoadedObjectProbe(
        raw,
        inventory,
        executionImageAuthority([
          {
            path: mappedPath,
            bytes: 11,
            sha256: createHash('sha256').update('base-loader').digest('hex'),
          },
        ])
      )
    ).rejects.toThrow(ReleaseRuntimeProbeError);
  });

  it('rejects a mapped object that is not in either content authority', async () => {
    const fixture = await createRuntimeFixture();
    const inventory = await collectPythonRuntimeInventory(fixture.parent);
    const baseObject = join(await temporaryRoot(), 'unknown.so');
    await writeFile(baseObject, 'base-loader');
    const raw = JSON.stringify({
      schema: 'missionpulse.effective-loaded-objects-probe',
      version: 1,
      entries: [
        {
          path: baseObject,
          bytes: 11,
          sha256: createHash('sha256').update('base-loader').digest('hex'),
        },
      ],
    });

    await expect(
      verifyEffectiveLoadedObjectProbe(raw, inventory, executionImageAuthority([]))
    ).rejects.toThrow(ReleaseRuntimeProbeError);
  });
});
