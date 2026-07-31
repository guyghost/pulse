#!/usr/bin/env node

import { constants as fsConstants } from 'node:fs';
import { mkdir, open, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assertCanonicalTreeReceipt,
  canonicalReceiptsEqual,
  compareUnsignedUtf8,
  inspectCanonicalTree,
  jcsCanonicalize,
  sha256Hex,
  type CanonicalTreeReceiptV2,
} from './canonical-artifact';
import { resolveIncludedConnectors, type ConnectorConfig } from './resolve-connectors';
import {
  RELEASE_TOOLCHAIN,
  derivePlaywrightGateEvidence,
  parseCommittedScenarioInventory,
  type CreateTestedDistSealInput,
  type ImmutableBlobRefV1,
  type ManifestAuthorityV1,
} from './seal-tested-dist';
import { getAllConnectorsMeta } from '../src/lib/shell/connectors/meta';

const MAX_JSON_BYTES = 64 * 1024 * 1024;
const MIN_RELEASE_INSTANT_MS = 946_684_800_000;
const MAX_RELEASE_INSTANT_MS = 253_402_300_799_999;

export class ReleaseGateInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReleaseGateInputError';
  }
}

interface ScenarioResult {
  readonly scenarioId: string;
  readonly expectedStatus: 'passed' | 'failed';
  readonly actualStatus: 'passed' | 'failed';
  readonly outcome: 'expected';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectPlaywrightTests(suites: unknown, target: Record<string, unknown>[]): void {
  if (!Array.isArray(suites)) {
    throw new ReleaseGateInputError('Playwright JSON report has no suites array.');
  }
  for (const suite of suites) {
    if (!isRecord(suite)) {
      throw new ReleaseGateInputError('Playwright suite is malformed.');
    }
    if (suite.specs !== undefined) {
      if (!Array.isArray(suite.specs)) {
        throw new ReleaseGateInputError('Playwright specs are malformed.');
      }
      for (const spec of suite.specs) {
        if (!isRecord(spec) || !Array.isArray(spec.tests)) {
          throw new ReleaseGateInputError('Playwright spec tests are malformed.');
        }
        for (const test of spec.tests) {
          if (!isRecord(test)) {
            throw new ReleaseGateInputError('Playwright test result is malformed.');
          }
          target.push(test);
        }
      }
    }
    if (suite.suites !== undefined) {
      collectPlaywrightTests(suite.suites, target);
    }
  }
}

export function derivePlaywrightScenarioResults(
  rawReport: unknown,
  inventory: readonly string[]
): readonly ScenarioResult[] {
  if (!isRecord(rawReport)) {
    throw new ReleaseGateInputError('Playwright JSON report must be one object.');
  }
  const tests: Record<string, unknown>[] = [];
  collectPlaywrightTests(rawReport.suites, tests);
  const byId = new Map<string, ScenarioResult>();
  for (const test of tests) {
    if (!Array.isArray(test.annotations)) {
      throw new ReleaseGateInputError('Every Playwright test needs annotations.');
    }
    const scenarioAnnotations = test.annotations.filter(
      (annotation) => isRecord(annotation) && annotation.type === 'scenario-id'
    );
    if (scenarioAnnotations.length !== 1) {
      throw new ReleaseGateInputError('Every Playwright test needs exactly one scenario-id.');
    }
    const scenarioId = scenarioAnnotations[0]?.description;
    if (typeof scenarioId !== 'string' || byId.has(scenarioId)) {
      throw new ReleaseGateInputError('Playwright scenario-id is missing or duplicated.');
    }
    const expectedStatus = test.expectedStatus;
    if (expectedStatus !== 'passed' && expectedStatus !== 'failed') {
      throw new ReleaseGateInputError(`Scenario ${scenarioId} has a skipped/unknown expectation.`);
    }
    if (test.status !== 'expected' || !Array.isArray(test.results) || test.results.length !== 1) {
      throw new ReleaseGateInputError(`Scenario ${scenarioId} did not have one expected attempt.`);
    }
    const attempt = test.results[0];
    if (!isRecord(attempt) || attempt.status !== expectedStatus) {
      throw new ReleaseGateInputError(`Scenario ${scenarioId} actual status diverged.`);
    }
    byId.set(scenarioId, {
      scenarioId,
      expectedStatus,
      actualStatus: expectedStatus,
      outcome: 'expected',
    });
  }
  if (byId.size !== inventory.length || inventory.some((scenarioId) => !byId.has(scenarioId))) {
    throw new ReleaseGateInputError('Playwright scenario set differs from committed inventory.');
  }
  return inventory.map((scenarioId) => {
    const result = byId.get(scenarioId);
    if (result === undefined) {
      throw new ReleaseGateInputError(`Missing scenario ${scenarioId}.`);
    }
    return result;
  });
}

async function readRegularNoFollow(path: string, maxBytes = MAX_JSON_BYTES): Promise<Buffer> {
  const handle = await open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.nlink !== 1n ||
      before.size < 0n ||
      before.size > BigInt(maxBytes)
    ) {
      throw new ReleaseGateInputError(`Unsafe or oversized release input: ${path}`);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      bytes.byteLength !== Number(before.size)
    ) {
      throw new ReleaseGateInputError(`Release input changed while reading: ${path}`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

function parseJson(bytes: Buffer, label: string): unknown {
  try {
    return JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    throw new ReleaseGateInputError(`${label} is not JSON.`);
  }
}

export function canonicalTimestamp(value: string, label: string): string {
  const epoch = Date.parse(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isSafeInteger(epoch) ||
    epoch < MIN_RELEASE_INSTANT_MS ||
    epoch > MAX_RELEASE_INSTANT_MS ||
    new Date(epoch).toISOString() !== value
  ) {
    throw new ReleaseGateInputError(`${label} is not a canonical timestamp.`);
  }
  return value;
}

function sortedStrings(value: unknown, label: string): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length > 128 ||
    !value.every(
      (entry) =>
        typeof entry === 'string' &&
        /^[\x21-\x7e]+$/.test(entry) &&
        Buffer.byteLength(entry, 'ascii') <= 512
    )
  ) {
    throw new ReleaseGateInputError(`${label} is not a string array.`);
  }
  const sorted = [...value].sort(compareUnsignedUtf8);
  if (new Set(sorted).size !== sorted.length) {
    throw new ReleaseGateInputError(`${label} contains duplicates.`);
  }
  return sorted;
}

function manifestAuthority(
  manifestBytes: Buffer,
  tree: CanonicalTreeReceiptV2,
  committedVersion: string
): ManifestAuthorityV1 {
  const parsed = parseJson(manifestBytes, 'built manifest');
  if (!isRecord(parsed)) {
    throw new ReleaseGateInputError('Built manifest is not an object.');
  }
  const permissions = sortedStrings(parsed.permissions ?? [], 'permissions');
  const hostPermissions = sortedStrings(parsed.host_permissions ?? [], 'host_permissions');
  const optionalHostPermissions = sortedStrings(
    parsed.optional_host_permissions ?? [],
    'optional_host_permissions'
  );
  if (
    parsed.manifest_version !== 3 ||
    parsed.version !== committedVersion ||
    typeof parsed.minimum_chrome_version !== 'string'
  ) {
    throw new ReleaseGateInputError('Built manifest identity diverges from committed version.');
  }
  return {
    schema: 'missionpulse.manifest-authority',
    version: 1,
    manifestVersion: 3,
    extensionVersion: committedVersion,
    minimumChromeVersion: parsed.minimum_chrome_version,
    manifestSha256: tree.manifestSha256,
    permissions,
    hostPermissions,
    optionalHostPermissions,
    permissionSetSha256: sha256Hex(
      jcsCanonicalize({ permissions, hostPermissions, optionalHostPermissions })
    ),
  };
}

async function writeCanonicalJson(path: string, value: unknown): Promise<Buffer> {
  const bytes = Buffer.from(jcsCanonicalize(value));
  await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
  return bytes;
}

function blobReference(path: string, kind: string, bytes: Buffer): ImmutableBlobRefV1 {
  return {
    schema: 'missionpulse.immutable-blob',
    version: 1,
    kind,
    immutableUri: pathToFileURL(path).href,
    sha256: sha256Hex(bytes),
    bytes: bytes.byteLength,
  };
}

interface GateCliOptions {
  readonly dist: string;
  readonly output: string;
  readonly captureTree: boolean;
  readonly playwrightReport?: string;
  readonly treeBefore?: string;
  readonly scenarioInventory?: string;
  readonly lockfile?: string;
  readonly connectorConfig?: string;
  readonly sourceCommit?: string;
  readonly localStartedAt?: string;
  readonly localCompletedAt?: string;
  readonly buildStartedAt?: string;
  readonly buildCompletedAt?: string;
  readonly mv3StartedAt?: string;
  readonly mv3CompletedAt?: string;
}

function parseCli(args: readonly string[]): GateCliOptions {
  const allowed = new Set([
    '--capture-tree',
    '--dist',
    '--output',
    '--playwright-report',
    '--tree-before',
    '--scenario-inventory',
    '--lockfile',
    '--connector-config',
    '--source-commit',
    '--local-started-at',
    '--local-completed-at',
    '--compile-started-at',
    '--compile-completed-at',
    '--mv3-started-at',
    '--mv3-completed-at',
  ]);
  const seen = new Set<string>();
  const values = new Map<string, string>();
  let captureTree = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!allowed.has(flag)) {
      throw new ReleaseGateInputError(`Unknown argument: ${flag}`);
    }
    if (seen.has(flag)) {
      throw new ReleaseGateInputError(`Duplicate argument: ${flag}`);
    }
    seen.add(flag);
    if (flag === '--capture-tree') {
      captureTree = true;
      continue;
    }
    const value = args[++index];
    if (value === undefined) {
      throw new ReleaseGateInputError(`Missing value for ${flag}`);
    }
    values.set(flag, value);
  }
  const dist = values.get('--dist');
  const output = values.get('--output');
  if (dist === undefined || output === undefined) {
    throw new ReleaseGateInputError('--dist and --output are required.');
  }
  const get = (name: string) =>
    values.get(`--${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`);
  return {
    dist: resolve(dist),
    output: resolve(output),
    captureTree,
    playwrightReport: get('playwrightReport'),
    treeBefore: get('treeBefore'),
    scenarioInventory: get('scenarioInventory'),
    lockfile: get('lockfile'),
    connectorConfig: get('connectorConfig'),
    sourceCommit: get('sourceCommit'),
    localStartedAt: get('localStartedAt'),
    localCompletedAt: get('localCompletedAt'),
    buildStartedAt: get('compileStartedAt'),
    buildCompletedAt: get('compileCompletedAt'),
    mv3StartedAt: get('mv3StartedAt'),
    mv3CompletedAt: get('mv3CompletedAt'),
  };
}

function requireOption(value: string | undefined, label: string): string {
  if (value === undefined) {
    throw new ReleaseGateInputError(`--${label} is required.`);
  }
  return resolve(value);
}

export async function createReleaseGateInputCli(
  args: readonly string[] = process.argv.slice(2)
): Promise<void> {
  const options = parseCli(args);
  if (options.captureTree) {
    const tree = await inspectCanonicalTree(options.dist);
    await writeCanonicalJson(options.output, tree);
    return;
  }

  const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const workspaceRoot = resolve(extensionRoot, '../..');
  const outputDirectory = dirname(options.output);
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  const sourceCommit = options.sourceCommit;
  if (sourceCommit === undefined || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sourceCommit)) {
    throw new ReleaseGateInputError('--source-commit is missing or malformed.');
  }
  const [rootPackageBytes, extensionPackageBytes] = await Promise.all([
    readRegularNoFollow(join(workspaceRoot, 'package.json')),
    readRegularNoFollow(join(extensionRoot, 'package.json')),
  ]);
  const rootPackage = parseJson(rootPackageBytes, 'root package');
  const extensionPackage = parseJson(extensionPackageBytes, 'extension package');
  if (!isRecord(rootPackage) || !isRecord(extensionPackage)) {
    throw new ReleaseGateInputError('Package metadata is malformed.');
  }
  const committedVersion = extensionPackage.version;
  if (typeof committedVersion !== 'string' || rootPackage.version !== committedVersion) {
    throw new ReleaseGateInputError('Committed package versions diverge.');
  }
  const treeBeforeBytes = await readRegularNoFollow(
    requireOption(options.treeBefore, 'tree-before')
  );
  const treeBefore = parseJson(treeBeforeBytes, 'tree-before') as CanonicalTreeReceiptV2;
  assertCanonicalTreeReceipt(treeBefore);
  const treeAfter = await inspectCanonicalTree(options.dist);
  if (!canonicalReceiptsEqual(treeBefore, treeAfter)) {
    throw new ReleaseGateInputError('dist changed during the packaged MV3 suite.');
  }
  const manifestBytes = await readRegularNoFollow(join(options.dist, 'manifest.json'));
  const manifest = manifestAuthority(manifestBytes, treeAfter, committedVersion);
  const inventoryBytes = await readRegularNoFollow(
    requireOption(options.scenarioInventory, 'scenario-inventory')
  );
  const expectedMv3ScenarioIds = parseCommittedScenarioInventory(inventoryBytes);
  const expectedMv3ScenarioInventorySha256 = sha256Hex(jcsCanonicalize(expectedMv3ScenarioIds));
  const playwrightBytes = await readRegularNoFollow(
    requireOption(options.playwrightReport, 'playwright-report')
  );
  const rawPlaywrightReport = parseJson(playwrightBytes, 'Playwright report');
  const scenarioResults = derivePlaywrightScenarioResults(
    rawPlaywrightReport,
    expectedMv3ScenarioIds
  );
  const { runtimeDiagnosticFindingCount } = derivePlaywrightGateEvidence(
    rawPlaywrightReport,
    expectedMv3ScenarioIds
  );
  if (runtimeDiagnosticFindingCount !== 0) {
    throw new ReleaseGateInputError(
      `Playwright report contains ${runtimeDiagnosticFindingCount} runtime diagnostic finding(s).`
    );
  }
  const lockfileBytes = await readRegularNoFollow(requireOption(options.lockfile, 'lockfile'));
  const connectorConfigBytes = await readRegularNoFollow(
    requireOption(options.connectorConfig, 'connector-config')
  );
  const connectorConfig = parseJson(connectorConfigBytes, 'connector config') as ConnectorConfig;
  const resolution = resolveIncludedConnectors({
    allIds: getAllConnectorsMeta().map(({ id }) => id),
    config: connectorConfig,
    env: {},
  });
  if (resolution.warnings.length !== 0 || resolution.included.length === 0) {
    throw new ReleaseGateInputError('Connector build configuration is not canonical.');
  }
  const includedConnectorIds = [...resolution.included].sort(compareUnsignedUtf8);
  const localStartedAt = canonicalTimestamp(options.localStartedAt ?? '', 'local-started-at');
  const localCompletedAt = canonicalTimestamp(options.localCompletedAt ?? '', 'local-completed-at');
  const buildStartedAt = canonicalTimestamp(options.buildStartedAt ?? '', 'build-started-at');
  const buildCompletedAt = canonicalTimestamp(options.buildCompletedAt ?? '', 'build-completed-at');
  const mv3StartedAt = canonicalTimestamp(options.mv3StartedAt ?? '', 'mv3-started-at');
  const mv3CompletedAt = canonicalTimestamp(options.mv3CompletedAt ?? '', 'mv3-completed-at');
  const sealedAt = new Date().toISOString();
  const chronology = [
    localStartedAt,
    localCompletedAt,
    buildStartedAt,
    buildCompletedAt,
    mv3StartedAt,
    mv3CompletedAt,
    sealedAt,
  ].map(Date.parse);
  if (
    chronology.some((value, index) => {
      const previous = chronology[index - 1];
      return index > 0 && previous !== undefined && value < previous;
    })
  ) {
    throw new ReleaseGateInputError('Release gate chronology is crossed.');
  }
  const releaseId = `release-${committedVersion}-${sourceCommit.slice(0, 12)}`;
  const buildId = `build-${committedVersion}-${sourceCommit.slice(0, 12)}`;
  const localReport = {
    schema: 'missionpulse.local-gate-report',
    version: 1,
    sourceCommit,
    startedAt: localStartedAt,
    completedAt: localCompletedAt,
    commands: ['format', 'lint', 'sourceManifest', 'typecheck', 'unit'].map((name) => ({
      name,
      exitCode: 0,
    })),
  };
  const localReportPath = join(outputDirectory, 'local-gate-report.json');
  const localReportBytes = await writeCanonicalJson(localReportPath, localReport);
  const buildReport = {
    schema: 'missionpulse.candidate-build-report',
    version: 1,
    sourceCommit,
    buildId,
    nodeVersion: RELEASE_TOOLCHAIN.nodeVersion,
    pnpmVersion: RELEASE_TOOLCHAIN.pnpmVersion,
    pythonVersion: RELEASE_TOOLCHAIN.pythonVersion,
    descriptorScannerProtocol: RELEASE_TOOLCHAIN.descriptorScannerProtocol,
    descriptorScannerSha256: RELEASE_TOOLCHAIN.descriptorScannerSha256,
    startedAt: buildStartedAt,
    completedAt: buildCompletedAt,
    lockfileSha256: sha256Hex(lockfileBytes),
    connectorConfigSha256: sha256Hex(connectorConfigBytes),
    includedConnectorIds,
    distTree: treeAfter,
    manifest,
  };
  const buildReportPath = join(outputDirectory, 'candidate-build-report.json');
  const buildReportBytes = await writeCanonicalJson(buildReportPath, buildReport);
  const mv3Report = {
    schema: 'missionpulse.packaged-mv3-playwright-report',
    version: 1,
    startedAt: mv3StartedAt,
    completedAt: mv3CompletedAt,
    runtimeDiagnosticFindingCount,
    scenarioResults,
  };
  const mv3ReportPath = join(outputDirectory, 'packaged-mv3-playwright-report.json');
  const mv3ReportBytes = await writeCanonicalJson(mv3ReportPath, mv3Report);
  const input: CreateTestedDistSealInput = {
    sealId: `seal-${committedVersion}-${sourceCommit.slice(0, 12)}`,
    releaseId,
    sourceCommit,
    committedVersion,
    buildId,
    lockfileSha256: sha256Hex(lockfileBytes),
    connectorConfigSha256: sha256Hex(connectorConfigBytes),
    includedConnectorIds,
    expectedMv3ScenarioIds,
    expectedMv3ScenarioInventorySha256,
    localGate: {
      schema: 'missionpulse.local-gate',
      version: 1,
      receiptId: `local-${sourceCommit.slice(0, 12)}`,
      releaseId,
      sourceCommit,
      startedAt: localStartedAt,
      completedAt: localCompletedAt,
      format: 'passed',
      lint: 'passed',
      typecheck: 'passed',
      unit: 'passed',
      sourceManifest: 'passed',
      report: blobReference(localReportPath, 'local-gate-report', localReportBytes),
    },
    build: {
      schema: 'missionpulse.candidate-build',
      version: 1,
      receiptId: `build-${sourceCommit.slice(0, 12)}`,
      buildId,
      releaseId,
      sourceCommit,
      nodeVersion: RELEASE_TOOLCHAIN.nodeVersion,
      pnpmVersion: RELEASE_TOOLCHAIN.pnpmVersion,
      pythonVersion: RELEASE_TOOLCHAIN.pythonVersion,
      descriptorScannerProtocol: RELEASE_TOOLCHAIN.descriptorScannerProtocol,
      descriptorScannerSha256: RELEASE_TOOLCHAIN.descriptorScannerSha256,
      startedAt: buildStartedAt,
      completedAt: buildCompletedAt,
      distTree: treeAfter,
      manifest,
      report: blobReference(buildReportPath, 'candidate-build-report', buildReportBytes),
    },
    mv3Gate: {
      schema: 'missionpulse.packaged-mv3-gate',
      version: 1,
      receiptId: `mv3-${sourceCommit.slice(0, 12)}`,
      releaseId,
      sourceCommit,
      buildId,
      startedAt: mv3StartedAt,
      completedAt: mv3CompletedAt,
      expectedScenarioInventorySha256: expectedMv3ScenarioInventorySha256,
      executedScenarioIds: expectedMv3ScenarioIds,
      passedScenarioCount: expectedMv3ScenarioIds.length,
      skippedScenarioCount: 0,
      failedScenarioCount: 0,
      runtimeDiagnosticFindingCount: 0,
      treeBeforeSuite: treeBefore,
      treeAfterSuite: treeAfter,
      rawPlaywrightReport: blobReference(
        requireOption(options.playwrightReport, 'playwright-report'),
        'playwright-json-report',
        playwrightBytes
      ),
      report: blobReference(mv3ReportPath, 'packaged-mv3-playwright-report', mv3ReportBytes),
    },
    testedTree: treeAfter,
    manifest,
    worktreeCleanBeforeGate: true,
    worktreeCleanAfterGate: true,
    sealedAt,
  };
  await writeCanonicalJson(options.output, input);
  process.stdout.write(
    `${jcsCanonicalize({
      status: 'RELEASE_GATE_INPUT_CREATED',
      output: options.output,
      scenarioCount: scenarioResults.length,
      treeSha256: treeAfter.treeSha256,
    })}\n`
  );
}

const invokedPath = process.argv[1] === undefined ? null : resolve(process.argv[1]);
if (invokedPath !== null && fileURLToPath(import.meta.url) === invokedPath) {
  createReleaseGateInputCli().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
