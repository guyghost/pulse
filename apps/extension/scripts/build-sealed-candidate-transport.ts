/*
 * Sealed candidate transport builder (CI entry point for the
 * `seal-candidate` job, per docs/PRODUCTION.md § Chrome Web Store).
 *
 * Runs on the exact clean commit, in order:
 *   1. authorize — root local gate (format, lint, typecheck, unit)
 *   2. compile   — @pulse/ui + extension production build + manifest authority
 *   3. exercise  — packaged MV3 Playwright gate (JSON report captured)
 *   4. gate      — release gate input from tree receipts, inventory, reports
 *   5. seal      — tested-dist seal bound to the gate input
 *   6. transport — seal + tested dist + deterministic aggregate digest
 *
 * Emits GitHub Actions outputs on --github-output:
 *   transport-path=<absolute transport directory>
 *   transport-sha256=<sha256 over the transport files, sorted by path>
 */

import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { createReleaseGateInputCli } from './create-release-gate-input';
import { sealTestedDistCli } from './seal-tested-dist';

const execFile = promisify(execFileCallback);

const EXTENSION_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE_ROOT = resolve(EXTENSION_ROOT, '../..');

function parseArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requireArg(name: string): string {
  const value = parseArg(name);
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return resolve(value);
}

async function run(
  command: string,
  args: readonly string[],
  maxBufferBytes = 67_108_864,
  cwd = WORKSPACE_ROOT
): Promise<string> {
  const { stdout } = await execFile(command, args, {
    cwd,
    maxBuffer: maxBufferBytes,
    encoding: 'utf8',
  });
  return stdout;
}

async function assertCleanWorktree(): Promise<void> {
  const status = await run('git', ['status', '--porcelain=v1', '--untracked-files=all']);
  if (status.length !== 0) {
    throw new Error(`Worktree must be clean before sealing.\n${status}`);
  }
}

async function listFilesRecursive(root: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

/** sha256 over every transport file's bytes, concatenated in path order. */
async function transportDigest(transportDir: string): Promise<string> {
  const files = await listFilesRecursive(transportDir);
  files.sort((a, b) => {
    if (a === b) {
      return 0;
    }
    return a < b ? -1 : 1;
  });
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(await readFile(file));
  }
  return hash.digest('hex');
}

async function main(): Promise<void> {
  const transportDir = requireArg('--output');
  const githubOutput = parseArg('--github-output') ?? process.env.GITHUB_OUTPUT;
  if (githubOutput === undefined || githubOutput.length === 0) {
    throw new Error('Missing --github-output or GITHUB_OUTPUT');
  }
  await mkdir(transportDir, { recursive: true, mode: 0o700 });

  await assertCleanWorktree();
  const { stdout: sourceCommit } = await execFile('git', ['rev-parse', 'HEAD'], {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
  });
  const commit = sourceCommit.trim();

  const dist = join(EXTENSION_ROOT, 'dist');
  const workDir = join(transportDir, '..', 'missionpulse-sealed-candidate-work');

  // ── 1. authorize: local gate ──
  const localStartedAt = new Date().toISOString();
  await run('pnpm', ['format:check']);
  await run('pnpm', ['lint']);
  await run('pnpm', ['typecheck']);
  await run('pnpm', ['test']);
  const localCompletedAt = new Date().toISOString();

  // ── 2. compile: production build + manifest authority ──
  const compileStartedAt = new Date().toISOString();
  await run('pnpm', ['--filter', '@pulse/ui', 'build']);
  await run('pnpm', ['--filter', '@pulse/extension', 'build']);
  await run('pnpm', [
    '--filter',
    '@pulse/extension',
    'verify-manifest',
    'dist/manifest.json',
    '--post-build',
    '--expected-version',
    // The committed extension version is the release authority.
    JSON.parse(await readFile(join(EXTENSION_ROOT, 'package.json'), 'utf8')).version as string,
  ]);
  const compileCompletedAt = new Date().toISOString();

  // ── 3. exercise: packaged MV3 gate ──
  await mkdir(workDir, { recursive: true, mode: 0o700 });
  const treeBeforePath = join(workDir, 'tree-before.json');
  await createReleaseGateInputCli(['--capture-tree', '--dist', dist, '--output', treeBeforePath]);

  const mv3StartedAt = new Date().toISOString();
  // Direct binary: `pnpm exec` prefixes stdout with its own noise, which would
  // corrupt a stdout-captured JSON report. The JSON reporter writes its file
  // via PLAYWRIGHT_JSON_OUTPUT_NAME instead, leaving stdout for the CI log.
  const rawReportPath = join(workDir, 'mv3-raw-report.json');
  try {
    await execFile(
      join(EXTENSION_ROOT, 'node_modules/.bin/playwright'),
      ['test', '--config=playwright.mv3.config.ts', '--reporter=json', '--retries=0'],
      {
        cwd: EXTENSION_ROOT,
        maxBuffer: 268_435_456,
        encoding: 'utf8',
        env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: rawReportPath },
      }
    );
  } catch (error) {
    // Make the CI log actionable: name every scenario that failed first-try.
    try {
      const parsed = JSON.parse(await readFile(rawReportPath, 'utf8')) as {
        suites?: unknown;
        errors?: unknown;
      };
      const failures: string[] = [];
      const walk = (suite: unknown): void => {
        if (!isRecordLike(suite)) {
          return;
        }
        for (const child of Array.isArray(suite.suites) ? suite.suites : []) {
          walk(child);
        }
        for (const test of Array.isArray(suite.tests) ? suite.tests : []) {
          if (!isRecordLike(test)) {
            continue;
          }
          const scenario = (
            test.annotations as Array<{ type?: string; description?: string }>
          )?.find((annotation) => annotation.type === 'scenario-id')?.description;
          const worst = Array.isArray(test.results)
            ? test.results[test.results.length - 1]
            : undefined;
          if (scenario && isRecordLike(worst) && worst.status !== 'passed') {
            failures.push(`${scenario}=${String(worst.status)}`);
          }
        }
      };
      for (const suite of Array.isArray(parsed.suites) ? parsed.suites : []) {
        walk(suite);
      }
      const topErrors = Array.isArray(parsed.errors) ? parsed.errors.length : 0;
      console.error(
        `[build-sealed-candidate-transport] MV3 first-try failures: ${failures.join(', ') || 'none'} (${topErrors} top-level error(s))`
      );
    } catch (parseError) {
      console.error(
        `[build-sealed-candidate-transport] MV3 report unreadable:`,
        parseError instanceof Error ? parseError.message : parseError
      );
    }
    throw error;
  }
  const mv3CompletedAt = new Date().toISOString();

  // ── 4. gate: bind evidence into the release gate input ──
  const gateInputPath = join(workDir, 'final-gate-input.json');
  await createReleaseGateInputCli([
    '--dist',
    dist,
    '--output',
    gateInputPath,
    '--playwright-report',
    rawReportPath,
    '--tree-before',
    treeBeforePath,
    '--scenario-inventory',
    join(EXTENSION_ROOT, 'tests/mv3/scenarios.v1.json'),
    '--lockfile',
    join(WORKSPACE_ROOT, 'pnpm-lock.yaml'),
    '--connector-config',
    join(EXTENSION_ROOT, 'connectors.config.json'),
    '--source-commit',
    commit,
    '--local-started-at',
    localStartedAt,
    '--local-completed-at',
    localCompletedAt,
    '--compile-started-at',
    compileStartedAt,
    '--compile-completed-at',
    compileCompletedAt,
    '--mv3-started-at',
    mv3StartedAt,
    '--mv3-completed-at',
    mv3CompletedAt,
  ]);

  // ── 5. seal: bind the gate input to the tested dist ──
  const sealPath = join(transportDir, 'tested-dist-seal.json');
  await sealTestedDistCli(['--input', gateInputPath, '--dist', dist, '--output', sealPath]);

  // ── 6. transport: seal + exact tested dist + aggregate digest ──
  await assertCleanWorktree();
  const transportDist = join(transportDir, 'dist');
  await mkdir(transportDist, { recursive: true, mode: 0o700 });
  const distFiles = await listFilesRecursive(dist);
  for (const file of distFiles) {
    const destination = join(transportDist, relative(dist, file));
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    await writeFile(destination, await readFile(file));
  }

  const digest = await transportDigest(transportDir);
  await writeFile(githubOutput, `transport-path=${transportDir}\ntransport-sha256=${digest}\n`, {
    encoding: 'utf8',
    flag: 'a',
  });
}

main().catch((error: unknown) => {
  console.error(
    '[build-sealed-candidate-transport]',
    error instanceof Error ? (error.stack ?? error.message) : error
  );
  process.exit(1);
});
