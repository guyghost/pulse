import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CONTROLLER_SOURCE_ALLOWLIST,
  ReleaseControllerBundleError,
  bundleReleaseController,
} from '../../../scripts/release-runtime/bundle-controller';

const temporaryRoots: string[] = [];
const execFile = promisify(execFileCallback);

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'missionpulse-controller-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe('standalone ESM release controller bundle', () => {
  it('bundles the exact committed runtime source inventory with no non-Node import', async () => {
    const root = await temporaryRoot();
    const outputPath = join(root, 'release-controller.bundle.mjs');
    const receipt = await bundleReleaseController(outputPath);
    const bytes = await readFile(outputPath);

    expect(receipt.outputPath).toBe(outputPath);
    expect(receipt.bytes).toBe(bytes.byteLength);
    expect(receipt.bytes).toBeGreaterThan(0);
    expect(receipt.bytes).toBeLessThanOrEqual(16_777_216);
    expect(receipt.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(receipt.sources.map((source) => source.path)).toEqual(
      [...receipt.sources.map((source) => source.path)].sort((left, right) =>
        Buffer.compare(Buffer.from(left), Buffer.from(right))
      )
    );
    expect(receipt.sources.map((source) => source.path)).toEqual(CONTROLLER_SOURCE_ALLOWLIST);
    expect(receipt.esbuildSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.sourceInventorySha256).toBe(
      createHash('sha256')
        .update(JSON.stringify(['missionpulse-release-controller-sources', 1, receipt.sources]))
        .digest('hex')
    );
    expect(receipt.externalImports.every((value) => value.startsWith('node:'))).toBe(true);

    const source = bytes.toString('utf8');
    expect(source).not.toMatch(/\bfrom\s+["'](?:\.{1,2}\/|\/)/);
    const imported = await execFile(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        'const controller = await import(process.argv[1]); process.stdout.write(typeof controller.main);',
        pathToFileURL(outputPath).href,
      ],
      {
        env: { HOME: '/nonexistent', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' },
        encoding: 'utf8',
      }
    );
    expect(imported.stdout).toBe('function');
  });

  it.each(['relative.mjs', '/tmp/not-a-module.js'])(
    'rejects an invalid output path %s',
    async (path) => {
      await expect(bundleReleaseController(path)).rejects.toBeInstanceOf(
        ReleaseControllerBundleError
      );
    }
  );
});
