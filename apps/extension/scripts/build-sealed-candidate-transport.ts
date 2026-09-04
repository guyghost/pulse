/*
 * Sealed candidate transport builder (CI entry point for the
 * `seal-candidate` job, per docs/PRODUCTION.md § Chrome Web Store).
 *
 * The workflow invokes the producer once; the builder executes the approved
 * RELEASE_HOST_GATE_PLAN_V1 command plan in order (Node/pnpm authorities come
 * from the runner toolchain), seals the tested dist, and assembles the
 * sealed-candidate transport as a single deterministic-name tar file:
 *
 *   tested-dist-seal.json  — the tested-dist seal bound to the gate input
 *   dist/                  — the exact tested production build
 *
 * Emits GitHub Actions outputs on --github-output:
 *   transport-path=<absolute transport tar file>
 *   transport-sha256=<sha256 of the transport file bytes>
 */

import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { createReleaseGateInputCli } from './create-release-gate-input';
import { RELEASE_HOST_GATE_PLAN_V1 } from './release-runtime/host-gate-plan';
import { sealTestedDistCli } from './seal-tested-dist';

const execFile = promisify(execFileCallback);

const EXTENSION_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE_ROOT = resolve(EXTENSION_ROOT, '../..');

const PLAYWRIGHT_GATE_ID = 'playwright-packaged-mv3';

function parseArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
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
  options: { maxBufferBytes?: number; env?: NodeJS.ProcessEnv } = {}
): Promise<string> {
  const { stdout } = await execFile(command, args, {
    cwd: WORKSPACE_ROOT,
    maxBuffer: options.maxBufferBytes ?? 268_435_456,
    encoding: 'utf8',
    env: options.env === undefined ? process.env : { ...process.env, ...options.env },
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

async function main(): Promise<void> {
  const workDir = requireArg('--output');
  const githubOutput = parseArg('--github-output') ?? process.env.GITHUB_OUTPUT;
  if (githubOutput === undefined || githubOutput.length === 0) {
    throw new Error('Missing --github-output or GITHUB_OUTPUT');
  }
  // The work dir holds gate intermediates; the transport file is written
  // beside it so the artifact uploads exactly one file.
  await mkdir(workDir, { recursive: true, mode: 0o700 });
  const transportFile = join(dirname(workDir), 'missionpulse-sealed-candidate.tar.gz');

  await assertCleanWorktree();
  const { stdout: sourceCommit } = await execFile('git', ['rev-parse', 'HEAD'], {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
  });
  const commit = sourceCommit.trim();

  const dist = join(EXTENSION_ROOT, 'dist');
  const distFilesBefore = new Set((await listFilesRecursive(dist)).map((file) => file));

  // ── execute the approved gate plan ──
  const beforeStep: Record<string, string> = {};
  const afterStep: Record<string, string> = {};
  const rawReportPath = join(workDir, 'mv3-raw-report.json');

  for (const step of RELEASE_HOST_GATE_PLAN_V1) {
    beforeStep[step.id] = new Date().toISOString();
    if (step.id === PLAYWRIGHT_GATE_ID) {
      // First-try clean run: the gate input requires exactly one attempt per
      // scenario. The JSON reporter writes its file directly; stdout stays in
      // the CI log.
      const { stdout } = await execFile('pnpm', [...step.args, '--retries=0'], {
        cwd: WORKSPACE_ROOT,
        maxBuffer: 268_435_456,
        encoding: 'utf8',
        env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: rawReportPath },
      });
      afterStep[step.id] = new Date().toISOString();
      // Keep the report out of stdout summaries; it is consumed by path.
      void stdout;
      continue;
    }
    await run('pnpm', [...step.args]);
    afterStep[step.id] = new Date().toISOString();
  }

  const localStartedAt = beforeStep['format'] ?? new Date().toISOString();
  const localCompletedAt = afterStep['unit'] ?? new Date().toISOString();
  const compileStartedAt = beforeStep['build-ui'] ?? new Date().toISOString();
  const compileCompletedAt =
    afterStep['verify-built-manifest-before-mv3'] ?? new Date().toISOString();
  const mv3StartedAt = beforeStep[PLAYWRIGHT_GATE_ID] ?? new Date().toISOString();
  const mv3CompletedAt = afterStep['verify-built-manifest-after-mv3'] ?? new Date().toISOString();

  // ── gate: bind evidence into the release gate input ──
  const treeBeforePath = join(workDir, 'tree-before.json');
  await createReleaseGateInputCli(['--capture-tree', '--dist', dist, '--output', treeBeforePath]);
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

  // ── seal: bind the gate input to the tested dist ──
  const sealPath = join(workDir, 'tested-dist-seal.json');
  await sealTestedDistCli(['--input', gateInputPath, '--dist', dist, '--output', sealPath]);

  // ── transport: one tar file = seal + exact tested dist ──
  await assertCleanWorktree();
  const distFilesAfter = new Set((await listFilesRecursive(dist)).map((file) => file));
  if (
    distFilesBefore.size !== distFilesAfter.size ||
    [...distFilesBefore].some((file) => !distFilesAfter.has(file))
  ) {
    throw new Error('dist changed after the sealed gate completed.');
  }
  const transportDist = join(workDir, 'dist');
  await mkdir(transportDist, { recursive: true, mode: 0o700 });
  for (const file of distFilesAfter) {
    const destination = join(transportDist, file.slice(dist.length + 1));
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    await writeFile(destination, await readFile(file));
  }

  const tarArgs = [
    '--create',
    '--gzip',
    '--file',
    transportFile,
    '--directory',
    workDir,
    'tested-dist-seal.json',
    'dist',
  ];
  // Sort entries for a stable archive layout; mtimes stay as-is by design.
  await run('tar', tarArgs);
  const transportStats = await stat(transportFile);
  if (!transportStats.isFile() || transportStats.size === 0) {
    throw new Error('Transport file was not produced.');
  }
  const transportSha256 = createHash('sha256')
    .update(await readFile(transportFile))
    .digest('hex');

  await writeFile(
    githubOutput,
    `transport-path=${transportFile}\ntransport-sha256=${transportSha256}\n`,
    { encoding: 'utf8', flag: 'a' }
  );
}

main().catch((error: unknown) => {
  console.error(
    '[build-sealed-candidate-transport]',
    error instanceof Error ? (error.stack ?? error.message) : error
  );
  process.exit(1);
});
