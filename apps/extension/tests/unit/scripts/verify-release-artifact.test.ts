import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  inspectCanonicalTree,
  jcsCanonicalize,
  sha256Hex,
} from '../../../scripts/canonical-artifact';
import {
  buildCanonicalStoreZip,
  createChecksumSidecar,
  type PackageValidationRecordV1,
} from '../../../scripts/package-sealed-dist';
import {
  ReleaseArtifactVerificationError,
  RELEASE_CONSUMER_LIMITS,
  verifyReleaseArtifact,
} from '../../../scripts/verify-release-artifact';

const roots: string[] = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'missionpulse-consumer-'));
  roots.push(root);
  const files = [
    {
      path: 'manifest.json',
      bytes: Buffer.from('{"manifest_version":3,"version":"0.2.2","permissions":[]}'),
    },
    { path: 'worker.js', bytes: Buffer.from('export {};') },
  ];
  const built = buildCanonicalStoreZip(files);
  const checksum = createChecksumSidecar(built.receipt.zipSha256);
  const extracted = join(root, 'expected-tree');
  await mkdir(extracted);
  for (const file of files) {
    await writeFile(join(extracted, file.path), file.bytes);
  }
  const tree = await inspectCanonicalTree(extracted);
  const marker = {
    schema: 'missionpulse.package-owner',
    version: 1,
    journalId: 'journal-0.2.2',
    releaseId: 'release-0.2.2',
    sealId: 'seal-0.2.2',
    artifactId: 'artifact-0.2.2',
    releaseNamespace: 'v0.2.2',
    ownershipTokenSha256: 'c'.repeat(64),
  };
  const markerBytes = Buffer.from(jcsCanonicalize(marker));
  const record: PackageValidationRecordV1 = {
    schema: 'missionpulse.package-validation',
    version: 1,
    artifactId: 'artifact-0.2.2',
    releaseId: 'release-0.2.2',
    sealId: 'seal-0.2.2',
    sealSha256: 'a'.repeat(64),
    committedVersion: '0.2.2',
    releaseNamespace: 'v0.2.2',
    sourceTreeSha256: tree.treeSha256,
    extractedTreeSha256: tree.treeSha256,
    ownershipMarkerSha256: sha256Hex(markerBytes),
    zipSha256: built.receipt.zipSha256,
    sidecarSha256: checksum.receipt.sha256,
    entryInventorySha256: built.receipt.entryInventorySha256,
    canonicalZipReceiptSha256: sha256Hex(jcsCanonicalize(built.receipt)),
    validatedAt: '2026-07-16T08:05:00.000Z',
  };
  const bundlePath = join(root, 'bundle');
  await mkdir(bundlePath);
  const zipPath = join(bundlePath, 'missionpulse.zip');
  const checksumPath = join(bundlePath, 'missionpulse.zip.sha256');
  const validationPath = join(bundlePath, 'validation.json');
  await writeFile(join(bundlePath, '.missionpulse-owner.json'), markerBytes);
  await writeFile(zipPath, built.bytes);
  await writeFile(checksumPath, checksum.bytes);
  await writeFile(validationPath, jcsCanonicalize(record));
  return { bundlePath, checksumPath, record, root, validationPath, zipPath };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('release artifact consumer verification', () => {
  it('recomputes all digests and safely extracts the exact canonical tree', async () => {
    const value = await fixture();
    const extractDirectory = join(value.root, 'fresh-extraction');

    const verified = await verifyReleaseArtifact({ ...value, extractDirectory });

    expect(verified.validationRecord).toEqual(value.record);
    expect(verified.extractedTree?.treeSha256).toBe(value.record.extractedTreeSha256);
    expect(
      JSON.parse(await readFile(join(extractDirectory, 'manifest.json'), 'utf8'))
    ).toMatchObject({
      manifest_version: 3,
      version: '0.2.2',
    });
  });

  it('fails closed on sidecar divergence and symlinked consumer input', async () => {
    const value = await fixture();
    await writeFile(value.checksumPath, `${value.record.zipSha256} missionpulse.zip\n`);
    await expect(verifyReleaseArtifact(value)).rejects.toMatchObject({ code: 'SIDECAR_INVALID' });

    const second = await fixture();
    const linkPath = join(second.root, 'linked.zip');
    await symlink('missionpulse.zip', linkPath);
    await expect(verifyReleaseArtifact({ ...second, zipPath: linkPath })).rejects.toBeInstanceOf(
      ReleaseArtifactVerificationError
    );
  });

  it('fails when ZIP bytes change after validation', async () => {
    const value = await fixture();
    await writeFile(value.zipPath, Buffer.from('not a zip'));

    await expect(verifyReleaseArtifact(value)).rejects.toMatchObject({
      code: 'ZIP_NON_CANONICAL',
    });
  });

  it('rejects any unexplained object in the four-file release bundle', async () => {
    const value = await fixture();
    await writeFile(join(value.bundlePath, 'unexpected.txt'), 'unexpected');

    await expect(verifyReleaseArtifact(value)).rejects.toMatchObject({
      code: 'CONSUMER_INPUT_UNSAFE',
    });
  });

  it('rejects oversized JSON from descriptor metadata before reading it', async () => {
    const value = await fixture();
    expect(RELEASE_CONSUMER_LIMITS).toMatchObject({
      maxJsonBytes: 16_777_216,
      maxZipBytes: 2_147_483_648,
    });
    await truncate(value.validationPath, RELEASE_CONSUMER_LIMITS.maxJsonBytes + 1);

    await expect(verifyReleaseArtifact(value)).rejects.toMatchObject({
      code: 'CONSUMER_LIMIT_EXCEEDED',
    });
  });

  it('rejects canonical-looking validation timestamps before year 2000', async () => {
    const value = await fixture();
    await writeFile(
      value.validationPath,
      jcsCanonicalize({ ...value.record, validatedAt: '1999-12-31T23:59:59.999Z' })
    );

    await expect(verifyReleaseArtifact(value)).rejects.toMatchObject({
      code: 'VALIDATION_RECORD_INVALID',
    });
  });
});
