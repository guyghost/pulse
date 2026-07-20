import { afterEach, describe, expect, it } from 'vitest';
import {
  access,
  chmod,
  link,
  mkdir,
  mkdtemp,
  rename,
  rm,
  symlink,
  truncate,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  CanonicalArtifactError,
  DEFAULT_CANONICAL_TREE_LIMITS,
  RELEASE_DESCRIPTOR_SCANNER,
  inspectCanonicalTree,
  scannerScriptDescriptorPath,
  sha256Hex,
  validateCanonicalRelativePaths,
} from '../../../scripts/canonical-artifact';

const roots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'missionpulse-canonical-'));
  roots.push(root);
  return root;
}

function scannerRuntime(scriptPath: string, expectedScriptSha256: string, timeoutMs = 2_000) {
  return {
    executablePath: 'python3',
    scriptPath,
    expectedProtocol: RELEASE_DESCRIPTOR_SCANNER.protocol,
    expectedPythonVersion: RELEASE_DESCRIPTOR_SCANNER.pythonVersion,
    expectedScriptSha256,
    timeoutMs,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('canonical artifact tree v2', () => {
  it('sorts by unsigned UTF-8 bytes and ignores source mode/mtime variation', async () => {
    const first = await temporaryRoot();
    const second = await temporaryRoot();
    for (const root of [first, second]) {
      await mkdir(join(root, 'assets'));
      await writeFile(join(root, 'manifest.json'), '{"manifest_version":3,"version":"0.2.2"}');
      await writeFile(join(root, 'assets', 'Z.js'), 'Z');
      await writeFile(join(root, 'assets', 'a.js'), 'a');
    }
    await utimes(join(first, 'assets', 'a.js'), new Date(1_000), new Date(1_000));
    await utimes(join(second, 'assets', 'a.js'), new Date(9_000), new Date(9_000));

    const left = await inspectCanonicalTree(first);
    const right = await inspectCanonicalTree(second);

    expect(left).toEqual(right);
    expect(left.algorithm).toBe('missionpulse-tree-sha256-v2');
    expect(left.entries.map(({ path }) => path)).toEqual([
      'assets/Z.js',
      'assets/a.js',
      'manifest.json',
    ]);
    expect(left.entries.every(({ mode }) => mode === '0644')).toBe(true);
    expect(left.treeSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(left.manifestSha256).toBe(left.entries.at(-1)?.sha256);
  });

  it('rejects symlinks and hard-link aliases instead of following them', async () => {
    const symlinkRoot = await temporaryRoot();
    await writeFile(join(symlinkRoot, 'manifest.json'), '{}');
    await symlink('manifest.json', join(symlinkRoot, 'alias.json'));

    await expect(inspectCanonicalTree(symlinkRoot)).rejects.toMatchObject({
      code: 'TREE_NON_REGULAR_ENTRY',
    });

    const hardLinkRoot = await temporaryRoot();
    await writeFile(join(hardLinkRoot, 'manifest.json'), '{}');
    await link(join(hardLinkRoot, 'manifest.json'), join(hardLinkRoot, 'alias.json'));
    await expect(inspectCanonicalTree(hardLinkRoot)).rejects.toMatchObject({
      code: 'TREE_HARD_LINK_ALIAS',
    });
  });

  it('rejects traversal, backslashes, case collisions and Unicode normalization collisions', () => {
    for (const paths of [
      ['../escape'],
      ['dir\\file'],
      ['Readme', 'README'],
      ['caf\u00e9.txt', 'cafe\u0301.txt'],
    ]) {
      expect(() => validateCanonicalRelativePaths(paths)).toThrow(CanonicalArtifactError);
    }
  });

  it('enforces file-count and UTF-8 path-byte limits before allocation', () => {
    expect(() =>
      validateCanonicalRelativePaths(['a', 'b'], {
        maxFiles: 1,
        maxDirectories: 1,
        maxPathBytes: 10,
        maxTotalPathBytes: 10,
        maxFileBytes: 10,
        maxTotalBytes: 10,
      })
    ).toThrowError(CanonicalArtifactError);
    expect(() =>
      validateCanonicalRelativePaths(['é'], {
        maxFiles: 1,
        maxDirectories: 1,
        maxPathBytes: 1,
        maxTotalPathBytes: 1,
        maxFileBytes: 10,
        maxTotalBytes: 10,
      })
    ).toThrowError(CanonicalArtifactError);
  });

  it('uses the reviewed 512 MiB file bound and rejects an oversized sparse file before reading it', async () => {
    expect(DEFAULT_CANONICAL_TREE_LIMITS).toMatchObject({
      maxDirectories: 20_000,
      maxFileBytes: 536_870_912,
      maxTotalPathBytes: 16_777_216,
    });

    const root = await temporaryRoot();
    await writeFile(join(root, 'manifest.json'), '{}');
    await writeFile(join(root, 'oversized.bin'), '');
    await truncate(join(root, 'oversized.bin'), 536_870_913);

    await expect(inspectCanonicalTree(root)).rejects.toMatchObject({
      code: 'TREE_LIMIT_EXCEEDED',
    });
  });

  it('enforces maxDirectories before descending into another directory', async () => {
    const root = await temporaryRoot();
    await writeFile(join(root, 'manifest.json'), '{}');
    await mkdir(join(root, 'one'));
    await writeFile(join(root, 'one', 'file.js'), 'x');

    await expect(
      inspectCanonicalTree(root, {
        ...DEFAULT_CANONICAL_TREE_LIMITS,
        maxDirectories: 1,
      })
    ).rejects.toMatchObject({ code: 'TREE_LIMIT_EXCEEDED' });
  });

  it('fails closed without following a replacement when the admitted root pathname is swapped', async () => {
    const root = await temporaryRoot();
    const admitted = join(root, 'admitted');
    const moved = join(root, 'moved');
    const replacement = join(root, 'replacement');
    await mkdir(admitted);
    await mkdir(replacement);
    await writeFile(join(admitted, 'manifest.json'), 'original');
    await writeFile(join(replacement, 'manifest.json'), 'replacement');

    let hookCalled = false;
    await expect(
      inspectCanonicalTree(admitted, DEFAULT_CANONICAL_TREE_LIMITS, {
        afterRootOpened: async () => {
          hookCalled = true;
          await rename(admitted, moved);
          await symlink(replacement, admitted);
        },
      })
    ).rejects.toMatchObject({ code: 'TREE_CHANGED_DURING_READ' });
    expect(hookCalled).toBe(true);
    expect((await inspectCanonicalTree(replacement)).manifestSha256).toBeTruthy();
  });

  it('pins the scanner protocol, script digest and descriptor paths on macOS/Linux', () => {
    expect(RELEASE_DESCRIPTOR_SCANNER).toMatchObject({
      protocol: 'missionpulse.descriptor-scanner.v1',
      pythonVersion: '3.14.5',
      scriptSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(scannerScriptDescriptorPath('darwin')).toBe('/dev/fd/4');
    expect(scannerScriptDescriptorPath('linux')).toBe('/proc/self/fd/4');
    expect(() => scannerScriptDescriptorPath('win32')).toThrowError(CanonicalArtifactError);
  });

  it('fails closed when the pinned scanner interpreter is absent', async () => {
    const root = await temporaryRoot();
    await writeFile(join(root, 'manifest.json'), '{}');
    const scriptPath = resolve(import.meta.dirname, '../../../scripts/canonical-artifact-scan.py');

    await expect(
      inspectCanonicalTree(
        root,
        DEFAULT_CANONICAL_TREE_LIMITS,
        {},
        {
          ...scannerRuntime(scriptPath, RELEASE_DESCRIPTOR_SCANNER.scriptSha256),
          executablePath: join(root, 'missing-python'),
        }
      )
    ).rejects.toBeInstanceOf(CanonicalArtifactError);
  });

  it('rejects an executable script wrapper even when it forwards the pinned Python version', async () => {
    const root = await temporaryRoot();
    await writeFile(join(root, 'manifest.json'), '{}');
    const wrapperPath = join(root, 'python-wrapper');
    await writeFile(wrapperPath, '#!/bin/sh\nexec python3 "$@"\n');
    await chmod(wrapperPath, 0o755);
    const scriptPath = resolve(import.meta.dirname, '../../../scripts/canonical-artifact-scan.py');

    await expect(
      inspectCanonicalTree(
        root,
        DEFAULT_CANONICAL_TREE_LIMITS,
        {},
        {
          ...scannerRuntime(scriptPath, RELEASE_DESCRIPTOR_SCANNER.scriptSha256),
          executablePath: wrapperPath,
        }
      )
    ).rejects.toMatchObject({ code: 'TREE_ROOT_INVALID' });
  });

  it('ignores PYTHONPATH sitecustomize injection for the descriptor protocol', async () => {
    const root = await temporaryRoot();
    await writeFile(join(root, 'manifest.json'), '{}');
    const injectionRoot = join(root, 'python-injection');
    const markerPath = join(root, 'sitecustomize-ran');
    await mkdir(injectionRoot);
    await writeFile(
      join(injectionRoot, 'sitecustomize.py'),
      `from pathlib import Path\nPath(${JSON.stringify(markerPath)}).write_text("injected")\n`
    );
    const previousPythonPath = process.env.PYTHONPATH;
    process.env.PYTHONPATH = injectionRoot;
    try {
      await inspectCanonicalTree(root);
    } finally {
      if (previousPythonPath === undefined) {
        delete process.env.PYTHONPATH;
      } else {
        process.env.PYTHONPATH = previousPythonPath;
      }
    }

    await expect(access(markerPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each([
    ['partial JSON', 'import sys\nsys.stdout.write(\'{"directoryCount":\')\n', 2_000],
    ['hostile stdout', 'import sys\nsys.stdout.write("x" * (9 * 1024 * 1024))\n', 2_000],
    ['timeout', 'import time\ntime.sleep(5)\n', 25],
    ['signal', 'import os, signal\nos.kill(os.getpid(), signal.SIGTERM)\n', 2_000],
  ])('fails closed on scanner %s', async (_label, source, timeoutMs) => {
    const root = await temporaryRoot();
    await writeFile(join(root, 'manifest.json'), '{}');
    const scriptPath = join(root, 'hostile-scanner.py');
    await writeFile(scriptPath, source);

    await expect(
      inspectCanonicalTree(
        root,
        { ...DEFAULT_CANONICAL_TREE_LIMITS, maxTotalPathBytes: 1024 },
        {},
        scannerRuntime(scriptPath, sha256Hex(source), timeoutMs)
      )
    ).rejects.toBeInstanceOf(CanonicalArtifactError);
  });

  it('rejects scanner script tampering before execution', async () => {
    const root = await temporaryRoot();
    await writeFile(join(root, 'manifest.json'), '{}');
    const scriptPath = resolve(import.meta.dirname, '../../../scripts/canonical-artifact-scan.py');

    await expect(
      inspectCanonicalTree(
        root,
        DEFAULT_CANONICAL_TREE_LIMITS,
        {},
        scannerRuntime(scriptPath, '0'.repeat(64))
      )
    ).rejects.toMatchObject({ code: 'TREE_CHANGED_DURING_READ' });
  });
});
