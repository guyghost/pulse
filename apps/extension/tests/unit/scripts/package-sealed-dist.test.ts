import { afterEach, describe, expect, it } from 'vitest';
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  inspectCanonicalTree,
  jcsCanonicalize,
  sha256Hex,
} from '../../../scripts/canonical-artifact';
import {
  CanonicalZipError,
  buildCanonicalStoreZip,
  createChecksumSidecar,
  extractCanonicalStoreZip,
  inspectCanonicalStoreZip,
  packageSealedDist,
} from '../../../scripts/package-sealed-dist';
import { createTestedDistSeal } from '../../../scripts/seal-tested-dist';

const entries = [
  { path: 'assets/Z.js', bytes: Buffer.from('Z') },
  { path: 'assets/a.js', bytes: Buffer.from('a') },
  {
    path: 'manifest.json',
    bytes: Buffer.from('{"manifest_version":3,"version":"0.2.2"}'),
  },
];

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

function report(seed: string) {
  return {
    schema: 'missionpulse.immutable-blob' as const,
    version: 1 as const,
    kind: 'gate-report',
    immutableUri: `file:///evidence/${seed}.json`,
    sha256: seed.repeat(64).slice(0, 64),
    bytes: 1,
  };
}

async function sealedFixture() {
  const root = await mkdtemp(join(tmpdir(), 'missionpulse-package-only-'));
  roots.push(root);
  const distPath = join(root, 'dist');
  const releasesPath = join(root, 'releases');
  await mkdir(distPath);
  await writeFile(
    join(distPath, 'manifest.json'),
    '{"manifest_version":3,"minimum_chrome_version":"114","permissions":[],"version":"0.2.2"}'
  );
  await writeFile(join(distPath, 'worker.js'), 'export {};');
  const tree = await inspectCanonicalTree(distPath);
  const permissions: string[] = [];
  const hostPermissions: string[] = [];
  const optionalHostPermissions: string[] = [];
  const manifest = {
    schema: 'missionpulse.manifest-authority' as const,
    version: 1 as const,
    manifestVersion: 3 as const,
    extensionVersion: '0.2.2',
    minimumChromeVersion: '114',
    manifestSha256: tree.manifestSha256,
    permissions,
    hostPermissions,
    optionalHostPermissions,
    permissionSetSha256: sha256Hex(
      jcsCanonicalize({ permissions, hostPermissions, optionalHostPermissions })
    ),
  };
  const expectedMv3ScenarioIds = ['navigation.all-tabs'];
  const expectedMv3ScenarioInventorySha256 = sha256Hex(jcsCanonicalize(expectedMv3ScenarioIds));
  const seal = createTestedDistSeal({
    sealId: 'seal-0.2.2',
    releaseId: 'release-0.2.2',
    sourceCommit: 'a'.repeat(40),
    committedVersion: '0.2.2',
    buildId: 'build-0.2.2',
    lockfileSha256: '1'.repeat(64),
    connectorConfigSha256: '2'.repeat(64),
    includedConnectorIds: ['freework'],
    expectedMv3ScenarioIds,
    expectedMv3ScenarioInventorySha256,
    localGate: {
      schema: 'missionpulse.local-gate',
      version: 1,
      receiptId: 'local-1',
      releaseId: 'release-0.2.2',
      sourceCommit: 'a'.repeat(40),
      startedAt: '2026-07-16T08:00:00.000Z',
      completedAt: '2026-07-16T08:01:00.000Z',
      format: 'passed',
      lint: 'passed',
      typecheck: 'passed',
      unit: 'passed',
      sourceManifest: 'passed',
      report: report('1'),
    },
    build: {
      schema: 'missionpulse.candidate-build',
      version: 1,
      receiptId: 'build-1',
      buildId: 'build-0.2.2',
      releaseId: 'release-0.2.2',
      sourceCommit: 'a'.repeat(40),
      nodeVersion: process.versions.node,
      pnpmVersion: '10.32.1',
      pythonVersion: '3.14.6',
      descriptorScannerProtocol: 'missionpulse.descriptor-scanner.v1',
      descriptorScannerSha256: 'e440610e7d2c490a7ebb1b70746ae2a9c243eccd7e4e845f95262ef3e4794c1a',
      startedAt: '2026-07-16T08:01:00.000Z',
      completedAt: '2026-07-16T08:02:00.000Z',
      distTree: tree,
      manifest,
      report: report('2'),
    },
    mv3Gate: {
      schema: 'missionpulse.packaged-mv3-gate',
      version: 1,
      receiptId: 'mv3-1',
      releaseId: 'release-0.2.2',
      sourceCommit: 'a'.repeat(40),
      buildId: 'build-0.2.2',
      startedAt: '2026-07-16T08:02:00.000Z',
      completedAt: '2026-07-16T08:03:00.000Z',
      expectedScenarioInventorySha256: expectedMv3ScenarioInventorySha256,
      executedScenarioIds: expectedMv3ScenarioIds,
      passedScenarioCount: 1,
      skippedScenarioCount: 0,
      failedScenarioCount: 0,
      runtimeDiagnosticFindingCount: 0,
      treeBeforeSuite: tree,
      treeAfterSuite: tree,
      rawPlaywrightReport: report('4'),
      report: report('3'),
    },
    testedTree: tree,
    manifest,
    worktreeCleanBeforeGate: true,
    worktreeCleanAfterGate: true,
    sealedAt: '2026-07-16T08:04:00.000Z',
  });
  return { distPath, releasesPath, root, seal, tree };
}

describe('canonical package-only ZIP', () => {
  it('builds two byte-identical STORE archives with exact canonical metadata', () => {
    const first = buildCanonicalStoreZip(entries);
    const second = buildCanonicalStoreZip(entries);

    expect(first.bytes).toEqual(second.bytes);
    expect(first.receipt).toEqual(second.receipt);
    expect(first.receipt.compression).toBe('store');
    expect(first.receipt.zip64).toBe(false);
    expect(first.receipt.dataDescriptor).toBe(false);
    expect(first.receipt.entries).toHaveLength(entries.length);
    expect(first.receipt.entries.every((entry) => entry.generalPurposeBitFlag === 0x0800)).toBe(
      true
    );
    expect(
      first.receipt.entries.every((entry) => entry.externalFileAttributes === 0x81a40000)
    ).toBe(true);
    expect(inspectCanonicalStoreZip(first.bytes).receipt).toEqual(first.receipt);
  });

  it('rejects a noncanonical method, flag, extra field and trailing bytes', () => {
    const built = buildCanonicalStoreZip(entries).bytes;
    const mutations: Buffer[] = [];
    const centralOffset = built.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));

    const deflate = Buffer.from(built);
    deflate.writeUInt16LE(8, 8);
    mutations.push(deflate);

    const descriptor = Buffer.from(built);
    descriptor.writeUInt16LE(0x0808, 6);
    mutations.push(descriptor);

    const extra = Buffer.from(built);
    extra.writeUInt16LE(1, 28);
    mutations.push(extra);

    const madeBy = Buffer.from(built);
    madeBy.writeUInt16LE(20, centralOffset + 4);
    mutations.push(madeBy);

    const attributes = Buffer.from(built);
    attributes.writeUInt32LE(0, centralOffset + 38);
    mutations.push(attributes);

    const zip64Sentinel = Buffer.from(built);
    zip64Sentinel.writeUInt16LE(0xffff, zip64Sentinel.byteLength - 12);
    mutations.push(zip64Sentinel);

    mutations.push(Buffer.concat([built, Buffer.from([0])]));

    for (const bytes of mutations) {
      expect(() => inspectCanonicalStoreZip(bytes)).toThrowError(CanonicalZipError);
    }
  });

  it('refuses unsorted and traversing input instead of normalizing it silently', () => {
    expect(() => buildCanonicalStoreZip([...entries].reverse())).toThrowError(CanonicalZipError);
    expect(() =>
      buildCanonicalStoreZip([{ path: '../manifest.json', bytes: Buffer.from('{}') }])
    ).toThrowError(CanonicalZipError);
  });

  it('emits the only accepted checksum sidecar representation', () => {
    const { receipt } = buildCanonicalStoreZip(entries);
    const sidecar = createChecksumSidecar(receipt.zipSha256);
    expect(sidecar.bytes.toString('ascii')).toBe(`${receipt.zipSha256}  missionpulse.zip\n`);
    expect(sidecar.receipt.bytes).toBe(83);
    expect(sidecar.receipt.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('packages only sealed bytes, journals every phase, and publishes one immutable bundle', async () => {
    const fixture = await sealedFixture();
    let timestamp = Date.parse('2026-07-16T08:05:00.000Z');
    const now = () => {
      const value = new Date(timestamp).toISOString();
      timestamp += 1_000;
      return value;
    };
    const atomicRenameNoReplace = async (source: string, destination: string) => {
      await expect(access(destination)).rejects.toMatchObject({ code: 'ENOENT' });
      await rename(source, destination);
    };

    const artifact = await packageSealedDist({
      seal: fixture.seal,
      distPath: fixture.distPath,
      releasesPath: fixture.releasesPath,
      artifactId: 'artifact-0.2.2',
      journalId: 'journal-0.2.2',
      ownershipToken: 'operator-owned-token',
      now,
      atomicRenameNoReplace,
    });

    expect(await inspectCanonicalTree(fixture.distPath)).toEqual(fixture.tree);
    expect((await readdir(artifact.bundleDirectoryPath)).sort()).toEqual([
      '.missionpulse-owner.json',
      'missionpulse.zip',
      'missionpulse.zip.sha256',
      'validation.json',
    ]);
    expect(inspectCanonicalStoreZip(await readFile(artifact.zipPath)).receipt).toEqual(
      artifact.zip
    );
    const journalBytes = await readFile(
      join(fixture.releasesPath, '.v0.2.2.journal-0.2.2.journal.jsonl'),
      'utf8'
    );
    const journals = journalBytes
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(journals).toHaveLength(7);
    expect(journals[0]).toMatchObject({
      ownershipTokenSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      verifiedZipReceipt: null,
      history: [
        {
          phase: 'reserved',
          ownedDirectoryIdentitySha256: null,
          ownershipMarkerSha256: null,
        },
      ],
    });
    expect(journals.at(-1)).toMatchObject({
      verifiedZipReceipt: artifact.zip,
      history: expect.arrayContaining([
        {
          phase: 'published',
          ownedDirectoryIdentitySha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          ownershipMarkerSha256: artifact.validationRecord.ownershipMarkerSha256,
          renameIntentAt: artifact.publishedAt,
          treeSha256: artifact.sourceTree.treeSha256,
          archiveSha256: artifact.zip.zipSha256,
          bundleInventorySha256: artifact.bundleInventorySha256,
          at: artifact.validatedAt,
        },
      ]),
    });
    await expect(access(join(fixture.releasesPath, '.package.lock'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(
      packageSealedDist({
        seal: fixture.seal,
        distPath: fixture.distPath,
        releasesPath: fixture.releasesPath,
        artifactId: 'artifact-0.2.2',
        journalId: 'journal-0.2.2',
        now,
        atomicRenameNoReplace,
      })
    ).rejects.toMatchObject({ code: 'PACKAGE_FOREIGN_PATH' });
  });

  it('publishes through the descriptor-relative native no-replace primitive', async () => {
    const fixture = await sealedFixture();
    let timestamp = Date.parse('2026-07-16T08:05:00.000Z');

    const artifact = await packageSealedDist({
      seal: fixture.seal,
      distPath: fixture.distPath,
      releasesPath: fixture.releasesPath,
      artifactId: 'artifact-0.2.2',
      journalId: 'journal-0.2.2',
      now: () => new Date((timestamp += 1_000)).toISOString(),
      probeAtomicRenameNoReplace: async () => undefined,
    });

    expect(artifact.bundleDirectoryPath).toBe(join(fixture.releasesPath, 'v0.2.2'));
    expect(await readFile(join(artifact.bundleDirectoryPath, 'validation.json'), 'utf8')).toBe(
      jcsCanonicalize(artifact.validationRecord)
    );
  });

  it('fails closed on foreign restart residue without adopting or deleting it', async () => {
    const fixture = await sealedFixture();
    await mkdir(fixture.releasesPath);
    const foreign = join(fixture.releasesPath, '.v0.2.2.foreign.staging');
    await mkdir(foreign);
    await writeFile(join(foreign, 'unknown.txt'), 'foreign');

    await expect(
      packageSealedDist({
        seal: fixture.seal,
        distPath: fixture.distPath,
        releasesPath: fixture.releasesPath,
        artifactId: 'artifact-0.2.2',
        journalId: 'journal-0.2.2',
      })
    ).rejects.toMatchObject({ code: 'PACKAGE_RECOVERY_REQUIRED' });
    expect(await readFile(join(foreign, 'unknown.txt'), 'utf8')).toBe('foreign');
  });

  it('rejects a timestamp before sealedAt before creating release state', async () => {
    const fixture = await sealedFixture();

    await expect(
      packageSealedDist({
        seal: fixture.seal,
        distPath: fixture.distPath,
        releasesPath: fixture.releasesPath,
        artifactId: 'artifact-0.2.2',
        journalId: 'journal-0.2.2',
        now: () => '2026-07-16T08:03:59.999Z',
        probeAtomicRenameNoReplace: async () => undefined,
      })
    ).rejects.toMatchObject({ code: 'PACKAGE_CHRONOLOGY_INVALID' });
    await expect(access(fixture.releasesPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects canonical-looking protocol timestamps before year 2000', async () => {
    const fixture = await sealedFixture();

    await expect(
      packageSealedDist({
        seal: fixture.seal,
        distPath: fixture.distPath,
        releasesPath: fixture.releasesPath,
        artifactId: 'artifact-0.2.2',
        journalId: 'journal-0.2.2',
        now: () => '1999-12-31T23:59:59.999Z',
        probeAtomicRenameNoReplace: async () => undefined,
      })
    ).rejects.toMatchObject({ code: 'PACKAGE_INPUT_INVALID' });
    await expect(access(fixture.releasesPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('probes atomic no-replace before any release lock, journal or staging effect', async () => {
    const fixture = await sealedFixture();

    await expect(
      packageSealedDist({
        seal: fixture.seal,
        distPath: fixture.distPath,
        releasesPath: fixture.releasesPath,
        artifactId: 'artifact-0.2.2',
        journalId: 'journal-0.2.2',
        probeAtomicRenameNoReplace: async () => {
          throw new Error('unsupported');
        },
      })
    ).rejects.toMatchObject({ code: 'ATOMIC_NO_REPLACE_UNAVAILABLE' });
    await expect(access(fixture.releasesPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('durably syncs the reserved journal parent before staging creation', async () => {
    const fixture = await sealedFixture();
    let observedBarrier = false;

    await expect(
      packageSealedDist({
        seal: fixture.seal,
        distPath: fixture.distPath,
        releasesPath: fixture.releasesPath,
        artifactId: 'artifact-0.2.2',
        journalId: 'journal-0.2.2',
        probeAtomicRenameNoReplace: async () => undefined,
        afterReservedJournalDurable: async ({ journalPath, stagingPath }) => {
          observedBarrier = true;
          expect(await readFile(journalPath, 'utf8')).toContain('"phase":"reserved"');
          await expect(access(stagingPath)).rejects.toMatchObject({ code: 'ENOENT' });
          throw new Error('simulated crash after durable reservation');
        },
      })
    ).rejects.toThrow('simulated crash after durable reservation');

    expect(observedBarrier).toBe(true);
    await expect(
      access(join(fixture.releasesPath, '.v0.2.2.artifact-0.2.2.staging'))
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('persists and rereads two independently built twin archives', async () => {
    const fixture = await sealedFixture();
    const twins: Array<{ label: string; path: string; identity: string; sha256: string }> = [];
    let timestamp = Date.parse('2026-07-16T08:05:00.000Z');

    await packageSealedDist({
      seal: fixture.seal,
      distPath: fixture.distPath,
      releasesPath: fixture.releasesPath,
      artifactId: 'artifact-0.2.2',
      journalId: 'journal-0.2.2',
      now: () => new Date((timestamp += 1_000)).toISOString(),
      probeAtomicRenameNoReplace: async () => undefined,
      atomicRenameNoReplace: rename,
      onTwinArchivePersisted: async ({ label, path, sha256 }) => {
        const stats = await lstat(path, { bigint: true });
        twins.push({ label, path, identity: `${stats.dev}:${stats.ino}`, sha256 });
      },
    });

    expect(twins.map(({ label }) => label)).toEqual(['zip-a', 'zip-b']);
    expect(new Set(twins.map(({ path }) => path)).size).toBe(2);
    expect(new Set(twins.map(({ identity }) => identity)).size).toBe(2);
    expect(new Set(twins.map(({ sha256 }) => sha256).values()).size).toBe(1);
  });

  it('rehashes all four staged files and refuses a mutation immediately before publication', async () => {
    const fixture = await sealedFixture();
    let timestamp = Date.parse('2026-07-16T08:05:00.000Z');

    await expect(
      packageSealedDist({
        seal: fixture.seal,
        distPath: fixture.distPath,
        releasesPath: fixture.releasesPath,
        artifactId: 'artifact-0.2.2',
        journalId: 'journal-0.2.2',
        now: () => new Date((timestamp += 1_000)).toISOString(),
        probeAtomicRenameNoReplace: async () => undefined,
        atomicRenameNoReplace: rename,
        beforePublication: async ({ validationPath }) => {
          await writeFile(validationPath, '{}');
        },
      })
    ).rejects.toMatchObject({ code: 'PACKAGE_BUNDLE_DRIFT' });
    await expect(access(join(fixture.releasesPath, 'v0.2.2'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('does not follow a staging pathname swapped after descriptor admission', async () => {
    const fixture = await sealedFixture();
    const foreign = join(fixture.root, 'foreign-staging');
    const moved = join(fixture.root, 'owned-staging-moved');
    await mkdir(foreign);
    await writeFile(join(foreign, 'sentinel.txt'), 'foreign');
    let timestamp = Date.parse('2026-07-16T08:05:00.000Z');

    await expect(
      packageSealedDist({
        seal: fixture.seal,
        distPath: fixture.distPath,
        releasesPath: fixture.releasesPath,
        artifactId: 'artifact-0.2.2',
        journalId: 'journal-0.2.2',
        now: () => new Date((timestamp += 1_000)).toISOString(),
        probeAtomicRenameNoReplace: async () => undefined,
        afterStagingCreated: async ({ stagingPath }) => {
          await rename(stagingPath, moved);
          await symlink(foreign, stagingPath);
        },
      })
    ).rejects.toMatchObject({ code: 'PACKAGE_FOREIGN_PATH' });
    expect(await readFile(join(foreign, 'sentinel.txt'), 'utf8')).toBe('foreign');
  });

  it('does not re-resolve a staging pathname swapped after final descriptor identity proof', async () => {
    const fixture = await sealedFixture();
    const moved = join(fixture.root, 'final-owned-staging-moved');
    const replacement = join(fixture.root, 'final-staging-replacement');
    let timestamp = Date.parse('2026-07-16T08:05:00.000Z');

    await expect(
      packageSealedDist({
        seal: fixture.seal,
        distPath: fixture.distPath,
        releasesPath: fixture.releasesPath,
        artifactId: 'artifact-0.2.2',
        journalId: 'journal-0.2.2',
        now: () => new Date((timestamp += 1_000)).toISOString(),
        probeAtomicRenameNoReplace: async () => undefined,
        atomicRenameNoReplace: rename,
        afterPublicationIdentityVerified: async ({ stagingPath }) => {
          await rename(stagingPath, moved);
          await mkdir(replacement);
          await writeFile(join(replacement, 'sentinel.txt'), 'foreign');
          await rename(replacement, stagingPath);
        },
      })
    ).rejects.toMatchObject({ code: 'PACKAGE_FOREIGN_PATH' });

    expect(
      await readFile(
        join(fixture.releasesPath, '.v0.2.2.artifact-0.2.2.staging', 'sentinel.txt'),
        'utf8'
      )
    ).toBe('foreign');
    await expect(access(join(fixture.releasesPath, 'v0.2.2'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('keeps extraction anchored when a parent pathname is swapped for a symlink', async () => {
    const root = await mkdtemp(join(tmpdir(), 'missionpulse-extract-swap-'));
    roots.push(root);
    const destination = join(root, 'extracted');
    const moved = join(root, 'moved-assets');
    const foreign = join(root, 'foreign');
    await mkdir(foreign);
    const built = buildCanonicalStoreZip(entries);

    await expect(
      extractCanonicalStoreZip(built.bytes, destination, {
        beforeFileCreate: async ({ path }) => {
          if (path !== 'assets/Z.js') {
            return;
          }
          await rename(join(destination, 'assets'), moved);
          await symlink(foreign, join(destination, 'assets'));
        },
      })
    ).rejects.toMatchObject({ code: 'ZIP_UNSAFE_PATH' });
    expect(await readdir(foreign)).toEqual([]);
  });
});
