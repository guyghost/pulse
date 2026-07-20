import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  assertArtifactUnchanged,
  assertNoForbiddenDevArtifacts,
  inspectPackagedArtifact,
} from '../../mv3/artifact';

const temporaryRoots: string[] = [];

async function temporaryArtifact(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'missionpulse-mv3-artifact-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true }))
  );
});

describe('packaged MV3 artifact evidence', () => {
  it('computes the same deterministic tree digest regardless of creation order', async () => {
    const first = await temporaryArtifact();
    const second = await temporaryArtifact();
    await mkdir(join(first, 'assets'));
    await writeFile(join(first, 'manifest.json'), '{"manifest_version":3}\n');
    await writeFile(join(first, 'assets', 'worker.js'), 'console.log("ready");\n');
    await mkdir(join(second, 'assets'));
    await writeFile(join(second, 'assets', 'worker.js'), 'console.log("ready");\n');
    await writeFile(join(second, 'manifest.json'), '{"manifest_version":3}\n');

    const firstEvidence = await inspectPackagedArtifact(first);
    const secondEvidence = await inspectPackagedArtifact(second);

    expect(firstEvidence.treeSha256).toBe(secondEvidence.treeSha256);
    expect(firstEvidence.treeSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(firstEvidence.files).toHaveLength(2);
    expect(firstEvidence.files).toEqual(secondEvidence.files);
    expect(firstEvidence.forbiddenDevFindings).toEqual([]);
  });

  it('detects forbidden DEV imports and globals statically inside packaged chunks', async () => {
    const root = await temporaryArtifact();
    await writeFile(join(root, 'manifest.json'), '{"manifest_version":3}\n');
    await writeFile(
      join(root, 'sidepanel.js'),
      'import("../src/dev/chrome-stubs"); window.__devPanelReady = true;\n'
    );

    const evidence = await inspectPackagedArtifact(root);

    expect(evidence.forbiddenDevFindings).toEqual([
      { path: 'sidepanel.js', signature: '__devPanelReady' },
      { path: 'sidepanel.js', signature: 'chrome-stubs' },
      { path: 'sidepanel.js', signature: 'src/dev/' },
    ]);
    expect(() => assertNoForbiddenDevArtifacts(evidence)).toThrowError(/forbidden DEV signatures/i);
  });

  it('fails closed when the packaged tree changes after browser exercise', async () => {
    const root = await temporaryArtifact();
    await writeFile(join(root, 'manifest.json'), '{"manifest_version":3}\n');
    const before = await inspectPackagedArtifact(root);
    await writeFile(join(root, 'late.js'), 'console.error("mutated");\n');
    const after = await inspectPackagedArtifact(root);

    expect(() => assertArtifactUnchanged(before, after)).toThrowError(
      /packaged MV3 artifact changed/i
    );
  });
});
