import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

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
  readonly algorithm: 'sha256';
  readonly treeSha256: string;
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

async function collectFiles(root: string, directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(root, absolutePath)));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(
        `Packaged MV3 artifact contains unsupported entry ${relative(root, absolutePath)}`
      );
    }
    files.push(absolutePath);
  }
  return files;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function inspectPackagedArtifact(root: string): Promise<PackagedArtifactEvidence> {
  const absoluteFiles = await collectFiles(root, root);
  const files: PackagedArtifactFileEvidence[] = [];
  const forbiddenDevFindings: ForbiddenDevFinding[] = [];
  const tree = createHash('sha256');

  for (const absolutePath of absoluteFiles) {
    const path = relative(root, absolutePath).split(sep).join('/');
    const bytes = await readFile(absolutePath);
    const fileSha256 = sha256(bytes);
    files.push({ path, bytes: bytes.byteLength, sha256: fileSha256 });
    tree.update(path, 'utf8');
    tree.update('\0');
    tree.update(String(bytes.byteLength), 'utf8');
    tree.update('\0');
    tree.update(fileSha256, 'utf8');
    tree.update('\n');

    for (const signature of FORBIDDEN_DEV_SIGNATURES) {
      if (bytes.includes(Buffer.from(signature))) {
        forbiddenDevFindings.push({ path, signature });
      }
    }
  }

  return {
    algorithm: 'sha256',
    treeSha256: tree.digest('hex'),
    files,
    forbiddenDevFindings,
  };
}

export function assertArtifactUnchanged(
  before: PackagedArtifactEvidence,
  after: PackagedArtifactEvidence
): void {
  if (before.treeSha256 !== after.treeSha256) {
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
