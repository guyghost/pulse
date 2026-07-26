import { constants as fsConstants } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';

import {
  canonicalReceiptsEqual,
  inspectCanonicalTree,
  type CanonicalTreeReceiptV2,
} from '../../scripts/canonical-artifact';

export interface PackagedArtifactFileEvidence {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface ForbiddenDevFinding {
  readonly path: string;
  readonly signature: string;
}

export interface PackagedArtifactEvidence {
  readonly algorithm: 'missionpulse-tree-sha256-v2';
  readonly fileCount: number;
  readonly treeSha256: string;
  readonly manifestSha256: string;
  readonly entries: CanonicalTreeReceiptV2['entries'];
  readonly files: readonly PackagedArtifactFileEvidence[];
  readonly forbiddenDevFindings: readonly ForbiddenDevFinding[];
}

const FORBIDDEN_DEV_SIGNATURES = [
  '__devPanelReady',
  '__missionpulse_dev_',
  'bridge-logger',
  'chrome-stubs',
  'DevPanel.svelte',
  'qa-seed',
  'src/dev/',
] as const;

export async function inspectPackagedArtifact(root: string): Promise<PackagedArtifactEvidence> {
  const treeBeforeRead = await inspectCanonicalTree(root);
  const files: PackagedArtifactFileEvidence[] = [];
  const forbiddenDevFindings: ForbiddenDevFinding[] = [];

  for (const entry of treeBeforeRead.entries) {
    const absolutePath = join(root, ...entry.path.split('/'));
    const handle = await open(absolutePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    let bytes: Buffer;
    try {
      bytes = await handle.readFile();
    } finally {
      await handle.close();
    }
    files.push({ path: entry.path, bytes: entry.bytes, sha256: entry.sha256 });

    for (const signature of FORBIDDEN_DEV_SIGNATURES) {
      if (bytes.includes(Buffer.from(signature))) {
        forbiddenDevFindings.push({ path: entry.path, signature });
      }
    }
  }

  const treeAfterRead = await inspectCanonicalTree(root);
  if (!canonicalReceiptsEqual(treeBeforeRead, treeAfterRead)) {
    throw new Error('Packaged MV3 artifact changed during canonical DEV-signature inspection.');
  }

  return {
    ...treeBeforeRead,
    files,
    forbiddenDevFindings,
  };
}

export function assertArtifactUnchanged(
  before: PackagedArtifactEvidence,
  after: PackagedArtifactEvidence
): void {
  const beforeTree: CanonicalTreeReceiptV2 = {
    algorithm: before.algorithm,
    fileCount: before.fileCount,
    treeSha256: before.treeSha256,
    manifestSha256: before.manifestSha256,
    entries: before.entries,
  };
  const afterTree: CanonicalTreeReceiptV2 = {
    algorithm: after.algorithm,
    fileCount: after.fileCount,
    treeSha256: after.treeSha256,
    manifestSha256: after.manifestSha256,
    entries: after.entries,
  };
  if (!canonicalReceiptsEqual(beforeTree, afterTree)) {
    throw new Error(
      `Packaged MV3 artifact changed during the test: ${before.treeSha256} -> ${after.treeSha256}`
    );
  }
}

export function assertNoForbiddenDevArtifacts(evidence: PackagedArtifactEvidence): void {
  if (evidence.forbiddenDevFindings.length === 0) {
    return;
  }
  const findings = evidence.forbiddenDevFindings
    .map((finding) => `${finding.path}: ${finding.signature}`)
    .join(', ');
  throw new Error(`Packaged MV3 artifact contains forbidden DEV signatures: ${findings}`);
}
