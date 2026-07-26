#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { open, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  assertCanonicalTreeReceipt,
  canonicalReceiptsEqual,
  compareUnsignedUtf8,
  inspectCanonicalTree,
  jcsCanonicalize,
  sha256Hex,
  type CanonicalTreeReceiptV2,
  type Sha256,
} from './canonical-artifact';
import { resolveIncludedConnectors, type ConnectorConfig } from './resolve-connectors';
import { getAllConnectorsMeta } from '../src/lib/shell/connectors/meta';
import { attestPinnedPythonRuntime } from './pinned-python-runtime';

const execFile = promisify(execFileCallback);

export type CanonicalUtcTimestamp = string;
export type CanonicalSemVer = string;

export const RELEASE_TOOLCHAIN = Object.freeze({
  nodeVersion: '22.23.1',
  pnpmVersion: '10.32.1',
  pythonVersion: '3.14.5',
  descriptorScannerProtocol: 'missionpulse.descriptor-scanner.v1',
  descriptorScannerSha256: 'e440610e7d2c490a7ebb1b70746ae2a9c243eccd7e4e845f95262ef3e4794c1a',
});
const MAX_GATE_JSON_BYTES = 16 * 1024 * 1024;
const MIN_RELEASE_INSTANT_MS = 946_684_800_000;
const MAX_RELEASE_INSTANT_MS = 253_402_300_799_999;
const MAX_PERMISSION_ENTRIES = 128;
const MAX_PERMISSION_ASCII_BYTES = 512;

export interface ImmutableBlobRefV1 {
  readonly schema: 'missionpulse.immutable-blob';
  readonly version: 1;
  readonly kind: string;
  readonly immutableUri: string;
  readonly sha256: Sha256;
  readonly bytes: number;
}

export interface ManifestAuthorityV1 {
  readonly schema: 'missionpulse.manifest-authority';
  readonly version: 1;
  readonly manifestVersion: 3;
  readonly extensionVersion: CanonicalSemVer;
  readonly minimumChromeVersion: string;
  readonly manifestSha256: Sha256;
  readonly permissions: readonly string[];
  readonly hostPermissions: readonly string[];
  readonly optionalHostPermissions: readonly string[];
  readonly permissionSetSha256: Sha256;
}

export interface LocalGateReceiptV1 {
  readonly schema: 'missionpulse.local-gate';
  readonly version: 1;
  readonly receiptId: string;
  readonly releaseId: string;
  readonly sourceCommit: string;
  readonly startedAt: CanonicalUtcTimestamp;
  readonly completedAt: CanonicalUtcTimestamp;
  readonly format: 'passed';
  readonly lint: 'passed';
  readonly typecheck: 'passed';
  readonly unit: 'passed';
  readonly sourceManifest: 'passed';
  readonly report: ImmutableBlobRefV1;
}

export interface BuildReceiptV1 {
  readonly schema: 'missionpulse.candidate-build';
  readonly version: 1;
  readonly receiptId: string;
  readonly buildId: string;
  readonly releaseId: string;
  readonly sourceCommit: string;
  readonly nodeVersion: string;
  readonly pnpmVersion: string;
  readonly pythonVersion: string;
  readonly descriptorScannerProtocol: string;
  readonly descriptorScannerSha256: Sha256;
  readonly startedAt: CanonicalUtcTimestamp;
  readonly completedAt: CanonicalUtcTimestamp;
  readonly distTree: CanonicalTreeReceiptV2;
  readonly manifest: ManifestAuthorityV1;
  readonly report: ImmutableBlobRefV1;
}

export interface PackagedMv3GateReceiptV1 {
  readonly schema: 'missionpulse.packaged-mv3-gate';
  readonly version: 1;
  readonly receiptId: string;
  readonly releaseId: string;
  readonly sourceCommit: string;
  readonly buildId: string;
  readonly startedAt: CanonicalUtcTimestamp;
  readonly completedAt: CanonicalUtcTimestamp;
  readonly expectedScenarioInventorySha256: Sha256;
  readonly executedScenarioIds: readonly string[];
  readonly passedScenarioCount: number;
  readonly skippedScenarioCount: 0;
  readonly failedScenarioCount: 0;
  readonly runtimeDiagnosticFindingCount: 0;
  readonly treeBeforeSuite: CanonicalTreeReceiptV2;
  readonly treeAfterSuite: CanonicalTreeReceiptV2;
  readonly rawPlaywrightReport: ImmutableBlobRefV1;
  readonly report: ImmutableBlobRefV1;
}

export interface TestedDistSealV1 {
  readonly schema: 'missionpulse.tested-dist-seal';
  readonly version: 1;
  readonly sealId: string;
  readonly sealSha256: Sha256;
  readonly releaseId: string;
  readonly sourceCommit: string;
  readonly committedVersion: CanonicalSemVer;
  readonly buildId: string;
  readonly lockfileSha256: Sha256;
  readonly connectorConfigSha256: Sha256;
  readonly includedConnectorIds: readonly string[];
  readonly localGate: LocalGateReceiptV1;
  readonly build: BuildReceiptV1;
  readonly mv3Gate: PackagedMv3GateReceiptV1;
  readonly testedTree: CanonicalTreeReceiptV2;
  readonly manifest: ManifestAuthorityV1;
  readonly worktreeCleanBeforeGate: true;
  readonly worktreeCleanAfterGate: true;
  readonly sealedAt: CanonicalUtcTimestamp;
}

export interface CreateTestedDistSealInput {
  readonly sealId: string;
  readonly releaseId: string;
  readonly sourceCommit: string;
  readonly committedVersion: CanonicalSemVer;
  readonly buildId: string;
  readonly lockfileSha256: Sha256;
  readonly connectorConfigSha256: Sha256;
  readonly includedConnectorIds: readonly string[];
  readonly expectedMv3ScenarioIds: readonly string[];
  readonly expectedMv3ScenarioInventorySha256: Sha256;
  readonly localGate: LocalGateReceiptV1;
  readonly build: BuildReceiptV1;
  readonly mv3Gate: PackagedMv3GateReceiptV1;
  readonly testedTree: CanonicalTreeReceiptV2;
  readonly manifest: ManifestAuthorityV1;
  readonly worktreeCleanBeforeGate: boolean;
  readonly worktreeCleanAfterGate: boolean;
  readonly sealedAt: CanonicalUtcTimestamp;
}

export type ReleaseSealErrorCode =
  | 'SEAL_INPUT_INVALID'
  | 'WORKTREE_DIRTY'
  | 'SOURCE_IDENTITY_MISMATCH'
  | 'VERSION_MISMATCH'
  | 'MANIFEST_AUTHORITY_INVALID'
  | 'LOCAL_GATE_NOT_GREEN'
  | 'MV3_GATE_NOT_GREEN'
  | 'MV3_SCENARIO_MATRIX_MISMATCH'
  | 'DIST_TREE_DRIFT'
  | 'RECEIPT_CHRONOLOGY_INVALID'
  | 'REPORT_REFERENCE_INVALID'
  | 'COMMITTED_SCENARIO_INVENTORY_INVALID';

export class ReleaseSealError extends Error {
  readonly code: ReleaseSealErrorCode;
  readonly detail?: Readonly<Record<string, unknown>>;

  constructor(
    code: ReleaseSealErrorCode,
    message: string,
    detail?: Readonly<Record<string, unknown>>
  ) {
    super(`${code}: ${message}`);
    this.name = 'ReleaseSealError';
    this.code = code;
    this.detail = detail;
  }
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SCENARIO_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const CANONICAL_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export interface PlaywrightScenarioResult {
  readonly scenarioId: string;
  readonly expectedStatus: 'passed' | 'failed';
  readonly actualStatus: 'passed' | 'failed';
  readonly outcome: 'expected';
}

export interface PlaywrightGateEvidence {
  readonly scenarioResults: readonly PlaywrightScenarioResult[];
  readonly runtimeDiagnosticFindingCount: number;
}

function snapshot<T>(value: T): T {
  return JSON.parse(jcsCanonicalize(value)) as T;
}

function assertIdentifier(value: string, label: string): void {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new ReleaseSealError('SEAL_INPUT_INVALID', `${label} is not canonical.`);
  }
}

function assertSha256(value: string, label: string): void {
  if (!SHA256_PATTERN.test(value)) {
    throw new ReleaseSealError('SEAL_INPUT_INVALID', `${label} is not a lowercase SHA-256.`);
  }
}

function assertCanonicalSemver(value: string): void {
  if (Buffer.byteLength(value, 'ascii') > 64 || !SEMVER_PATTERN.test(value)) {
    throw new ReleaseSealError('VERSION_MISMATCH', `Version is not canonical SemVer: ${value}`);
  }
  for (const numeric of value.split(/[.+-]/).filter((part) => /^\d+$/.test(part))) {
    if (!Number.isSafeInteger(Number(numeric))) {
      throw new ReleaseSealError('VERSION_MISMATCH', 'SemVer numeric identifier is not safe.');
    }
  }
}

function parseTimestamp(value: string): number {
  if (!CANONICAL_UTC_PATTERN.test(value)) {
    throw new ReleaseSealError(
      'RECEIPT_CHRONOLOGY_INVALID',
      `Timestamp is not canonical: ${value}`
    );
  }
  const epoch = Date.parse(value);
  if (
    !Number.isSafeInteger(epoch) ||
    epoch < MIN_RELEASE_INSTANT_MS ||
    epoch > MAX_RELEASE_INSTANT_MS ||
    new Date(epoch).toISOString() !== value
  ) {
    throw new ReleaseSealError(
      'RECEIPT_CHRONOLOGY_INVALID',
      `Timestamp does not round-trip: ${value}`
    );
  }
  return epoch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectPlaywrightTests(suites: unknown, target: Record<string, unknown>[]): void {
  if (!Array.isArray(suites)) {
    throw new ReleaseSealError(
      'REPORT_REFERENCE_INVALID',
      'Raw Playwright report has no suites array.'
    );
  }
  for (const suite of suites) {
    if (!isRecord(suite)) {
      throw new ReleaseSealError('REPORT_REFERENCE_INVALID', 'Raw Playwright suite is malformed.');
    }
    if (suite.specs !== undefined) {
      if (!Array.isArray(suite.specs)) {
        throw new ReleaseSealError(
          'REPORT_REFERENCE_INVALID',
          'Raw Playwright specs are malformed.'
        );
      }
      for (const spec of suite.specs) {
        if (!isRecord(spec) || !Array.isArray(spec.tests)) {
          throw new ReleaseSealError(
            'REPORT_REFERENCE_INVALID',
            'Raw Playwright spec tests are malformed.'
          );
        }
        for (const test of spec.tests) {
          if (!isRecord(test)) {
            throw new ReleaseSealError(
              'REPORT_REFERENCE_INVALID',
              'Raw Playwright test result is malformed.'
            );
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

export function derivePlaywrightGateEvidence(
  rawReport: unknown,
  inventory: readonly string[]
): PlaywrightGateEvidence {
  if (!isRecord(rawReport)) {
    throw new ReleaseSealError(
      'REPORT_REFERENCE_INVALID',
      'Raw Playwright report must be one object.'
    );
  }
  const tests: Record<string, unknown>[] = [];
  collectPlaywrightTests(rawReport.suites, tests);
  const byId = new Map<string, PlaywrightScenarioResult>();
  let runtimeDiagnosticFindingCount = 0;
  for (const test of tests) {
    if (!Array.isArray(test.annotations)) {
      throw new ReleaseSealError(
        'MV3_SCENARIO_MATRIX_MISMATCH',
        'Every raw Playwright test needs annotations.'
      );
    }
    const scenarioAnnotations = test.annotations.filter(
      (annotation) => isRecord(annotation) && annotation.type === 'scenario-id'
    );
    if (scenarioAnnotations.length !== 1) {
      throw new ReleaseSealError(
        'MV3_SCENARIO_MATRIX_MISMATCH',
        'Every raw Playwright test needs exactly one scenario-id.'
      );
    }
    const scenarioId = scenarioAnnotations[0]?.description;
    if (typeof scenarioId !== 'string' || byId.has(scenarioId)) {
      throw new ReleaseSealError(
        'MV3_SCENARIO_MATRIX_MISMATCH',
        'Raw Playwright scenario-id is missing or duplicated.'
      );
    }
    const expectedStatus = test.expectedStatus;
    if (expectedStatus !== 'passed' && expectedStatus !== 'failed') {
      throw new ReleaseSealError(
        'MV3_GATE_NOT_GREEN',
        `Scenario ${scenarioId} has a skipped or unknown expectation.`
      );
    }
    if (test.status !== 'expected' || !Array.isArray(test.results) || test.results.length !== 1) {
      throw new ReleaseSealError(
        'MV3_GATE_NOT_GREEN',
        `Scenario ${scenarioId} did not have one expected attempt.`
      );
    }
    const attempt = test.results[0];
    if (!isRecord(attempt) || attempt.status !== expectedStatus) {
      throw new ReleaseSealError(
        'MV3_GATE_NOT_GREEN',
        `Scenario ${scenarioId} actual status diverged.`
      );
    }
    if (attempt.attachments !== undefined && !Array.isArray(attempt.attachments)) {
      throw new ReleaseSealError(
        'REPORT_REFERENCE_INVALID',
        `Scenario ${scenarioId} attachments are malformed.`
      );
    }
    if (expectedStatus === 'passed' && Array.isArray(attempt.attachments)) {
      runtimeDiagnosticFindingCount += attempt.attachments.filter(
        (attachment) => isRecord(attachment) && attachment.name === 'runtime-diagnostics'
      ).length;
    }
    byId.set(scenarioId, {
      scenarioId,
      expectedStatus,
      actualStatus: expectedStatus,
      outcome: 'expected',
    });
  }
  if (byId.size !== inventory.length || inventory.some((scenarioId) => !byId.has(scenarioId))) {
    throw new ReleaseSealError(
      'MV3_SCENARIO_MATRIX_MISMATCH',
      'Raw Playwright scenario set differs from committed inventory.'
    );
  }
  return Object.freeze({
    scenarioResults: Object.freeze(
      inventory.map((scenarioId) => {
        const result = byId.get(scenarioId);
        if (result === undefined) {
          throw new ReleaseSealError(
            'MV3_SCENARIO_MATRIX_MISMATCH',
            `Raw Playwright report is missing scenario ${scenarioId}.`
          );
        }
        return Object.freeze({ ...result });
      })
    ),
    runtimeDiagnosticFindingCount,
  });
}

function parseRawPlaywrightReport(bytes: Uint8Array): unknown {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_GATE_JSON_BYTES) {
    throw new ReleaseSealError(
      'REPORT_REFERENCE_INVALID',
      'Raw Playwright report exceeds its byte bound.'
    );
  }
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
  } catch {
    throw new ReleaseSealError('REPORT_REFERENCE_INVALID', 'Raw Playwright report is not JSON.');
  }
}

function assertBlobRef(reference: ImmutableBlobRefV1, label: string): void {
  if (
    reference.schema !== 'missionpulse.immutable-blob' ||
    reference.version !== 1 ||
    !IDENTIFIER_PATTERN.test(reference.kind) ||
    typeof reference.immutableUri !== 'string' ||
    Buffer.byteLength(reference.immutableUri, 'utf8') === 0 ||
    Buffer.byteLength(reference.immutableUri, 'utf8') > 2048 ||
    !Number.isSafeInteger(reference.bytes) ||
    reference.bytes <= 0 ||
    !SHA256_PATTERN.test(reference.sha256)
  ) {
    throw new ReleaseSealError('REPORT_REFERENCE_INVALID', `${label} is not immutable evidence.`);
  }
}

function assertConfiguration(input: CreateTestedDistSealInput): void {
  assertSha256(input.lockfileSha256, 'lockfile digest');
  assertSha256(input.connectorConfigSha256, 'connector config digest');
  if (input.includedConnectorIds.length === 0 || input.includedConnectorIds.length > 128) {
    throw new ReleaseSealError(
      'SEAL_INPUT_INVALID',
      'Included connector set is empty or oversized.'
    );
  }
  const sorted = [...input.includedConnectorIds].sort(compareUnsignedUtf8);
  if (
    new Set(input.includedConnectorIds).size !== input.includedConnectorIds.length ||
    sorted.some((value, index) => value !== input.includedConnectorIds[index]) ||
    input.includedConnectorIds.some((value) => !/^[a-z0-9][a-z0-9-]{0,127}$/.test(value))
  ) {
    throw new ReleaseSealError(
      'SEAL_INPUT_INVALID',
      'Included connector IDs must be canonical, unique and byte-sorted.'
    );
  }
}

function parseCanonicalReport(bytes: Uint8Array, label: string): Record<string, unknown> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_GATE_JSON_BYTES) {
    throw new ReleaseSealError('REPORT_REFERENCE_INVALID', `${label} exceeds its byte bound.`);
  }
  const raw = Buffer.from(bytes).toString('utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ReleaseSealError('REPORT_REFERENCE_INVALID', `${label} is not JSON.`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ReleaseSealError('REPORT_REFERENCE_INVALID', `${label} must be one JSON object.`);
  }
  if (jcsCanonicalize(parsed) !== raw) {
    throw new ReleaseSealError(
      'REPORT_REFERENCE_INVALID',
      `${label} must use exact newline-free JCS.`
    );
  }
  return parsed as Record<string, unknown>;
}

function withoutReport<T extends { readonly report: ImmutableBlobRefV1 }>(
  receipt: T
): Omit<T, 'report'> {
  const { report: _report, ...value } = receipt;
  return value;
}

function assertLocalGateReportMatchesReceipt(
  bytes: Uint8Array,
  input: CreateTestedDistSealInput
): void {
  const report = parseCanonicalReport(bytes, 'local gate report');
  const expectedCommands = ['format', 'lint', 'sourceManifest', 'typecheck', 'unit'].map(
    (name) => ({
      name,
      exitCode: 0,
    })
  );
  const expected = {
    schema: 'missionpulse.local-gate-report',
    version: 1,
    sourceCommit: input.sourceCommit,
    startedAt: input.localGate.startedAt,
    completedAt: input.localGate.completedAt,
    commands: expectedCommands,
  };
  if (jcsCanonicalize(report) !== jcsCanonicalize(expected)) {
    throw new ReleaseSealError(
      'LOCAL_GATE_NOT_GREEN',
      'Local gate report bytes do not prove every required command passed.'
    );
  }
}

function assertBuildReportMatchesReceipt(
  bytes: Uint8Array,
  input: CreateTestedDistSealInput
): void {
  const report = parseCanonicalReport(bytes, 'candidate build report');
  const expected = {
    schema: 'missionpulse.candidate-build-report',
    version: 1,
    sourceCommit: input.sourceCommit,
    buildId: input.buildId,
    nodeVersion: input.build.nodeVersion,
    pnpmVersion: input.build.pnpmVersion,
    pythonVersion: input.build.pythonVersion,
    descriptorScannerProtocol: input.build.descriptorScannerProtocol,
    descriptorScannerSha256: input.build.descriptorScannerSha256,
    startedAt: input.build.startedAt,
    completedAt: input.build.completedAt,
    lockfileSha256: input.lockfileSha256,
    connectorConfigSha256: input.connectorConfigSha256,
    includedConnectorIds: input.includedConnectorIds,
    distTree: input.testedTree,
    manifest: input.manifest,
  };
  if (jcsCanonicalize(report) !== jcsCanonicalize(expected)) {
    throw new ReleaseSealError(
      'SOURCE_IDENTITY_MISMATCH',
      'Build report does not bind the exact toolchain, configuration and tree.'
    );
  }
}

export function assertPackagedMv3ReportMatchesReceipt(
  bytes: Uint8Array,
  input: CreateTestedDistSealInput,
  rawEvidence?: PlaywrightGateEvidence
): void {
  const report = parseCanonicalReport(bytes, 'packaged MV3 Playwright report');
  if (
    report.schema !== 'missionpulse.packaged-mv3-playwright-report' ||
    report.version !== 1 ||
    report.startedAt !== input.mv3Gate.startedAt ||
    report.completedAt !== input.mv3Gate.completedAt ||
    report.runtimeDiagnosticFindingCount !== 0 ||
    !Array.isArray(report.scenarioResults)
  ) {
    throw new ReleaseSealError('MV3_GATE_NOT_GREEN', 'Packaged MV3 report schema is not green.');
  }
  const scenarioIds: string[] = [];
  for (const value of report.scenarioResults) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new ReleaseSealError('MV3_GATE_NOT_GREEN', 'MV3 scenario result is malformed.');
    }
    const result = value as Record<string, unknown>;
    if (
      Object.keys(result).sort().join(',') !== 'actualStatus,expectedStatus,outcome,scenarioId' ||
      typeof result.scenarioId !== 'string' ||
      (result.expectedStatus !== 'passed' && result.expectedStatus !== 'failed') ||
      result.actualStatus !== result.expectedStatus ||
      result.outcome !== 'expected'
    ) {
      throw new ReleaseSealError('MV3_GATE_NOT_GREEN', 'MV3 scenario outcome is not expected.');
    }
    scenarioIds.push(result.scenarioId);
  }
  if (
    jcsCanonicalize(scenarioIds) !== jcsCanonicalize(input.expectedMv3ScenarioIds) ||
    jcsCanonicalize(scenarioIds) !== jcsCanonicalize(input.mv3Gate.executedScenarioIds)
  ) {
    throw new ReleaseSealError(
      'MV3_SCENARIO_MATRIX_MISMATCH',
      'Structured Playwright scenarios do not match the committed inventory.'
    );
  }
  if (
    rawEvidence !== undefined &&
    (report.runtimeDiagnosticFindingCount !== rawEvidence.runtimeDiagnosticFindingCount ||
      jcsCanonicalize(report.scenarioResults) !== jcsCanonicalize(rawEvidence.scenarioResults))
  ) {
    throw new ReleaseSealError(
      'MV3_SCENARIO_MATRIX_MISMATCH',
      'Derived packaged MV3 report differs from the sealed raw Playwright report.'
    );
  }
}

async function readReferencedReport(
  reference: ImmutableBlobRefV1,
  expectedKind: string
): Promise<Buffer> {
  assertBlobRef(reference, expectedKind);
  if (reference.kind !== expectedKind || reference.bytes > MAX_GATE_JSON_BYTES) {
    throw new ReleaseSealError('REPORT_REFERENCE_INVALID', `${expectedKind} reference is invalid.`);
  }
  let path: string;
  try {
    const uri = new URL(reference.immutableUri);
    if (uri.protocol !== 'file:') {
      throw new Error('not a file URI');
    }
    path = fileURLToPath(uri);
  } catch (error) {
    throw new ReleaseSealError(
      'REPORT_REFERENCE_INVALID',
      `${expectedKind} must use a canonical file URI.`,
      { cause: error instanceof Error ? error.message : String(error) }
    );
  }
  const bytes = await readNoFollow(path, MAX_GATE_JSON_BYTES);
  if (bytes.byteLength !== reference.bytes || sha256Hex(bytes) !== reference.sha256) {
    throw new ReleaseSealError(
      'REPORT_REFERENCE_INVALID',
      `${expectedKind} bytes do not match their immutable reference.`
    );
  }
  return bytes;
}

export async function verifyReferencedGateReports(input: CreateTestedDistSealInput): Promise<void> {
  const [localBytes, buildBytes, rawPlaywrightBytes, mv3Bytes] = await Promise.all([
    readReferencedReport(input.localGate.report, 'local-gate-report'),
    readReferencedReport(input.build.report, 'candidate-build-report'),
    readReferencedReport(input.mv3Gate.rawPlaywrightReport, 'playwright-json-report'),
    readReferencedReport(input.mv3Gate.report, 'packaged-mv3-playwright-report'),
  ]);
  assertLocalGateReportMatchesReceipt(localBytes, input);
  assertBuildReportMatchesReceipt(buildBytes, input);
  const rawEvidence = derivePlaywrightGateEvidence(
    parseRawPlaywrightReport(rawPlaywrightBytes),
    input.expectedMv3ScenarioIds
  );
  if (
    rawEvidence.runtimeDiagnosticFindingCount !== input.mv3Gate.runtimeDiagnosticFindingCount ||
    rawEvidence.scenarioResults.length !== input.mv3Gate.passedScenarioCount
  ) {
    throw new ReleaseSealError(
      'MV3_GATE_NOT_GREEN',
      'Raw Playwright evidence does not derive the declared green receipt.'
    );
  }
  assertPackagedMv3ReportMatchesReceipt(mv3Bytes, input, rawEvidence);

  // Keep receipt bodies reachable in this verifier so an added receipt field
  // cannot silently avoid report binding during a future schema extension.
  void withoutReport(input.localGate);
  void withoutReport(input.build);
  void withoutReport(input.mv3Gate);
}

function assertSortedUniqueAscii(values: readonly string[], label: string): void {
  if (values.length > MAX_PERMISSION_ENTRIES) {
    throw new ReleaseSealError(
      'MANIFEST_AUTHORITY_INVALID',
      `${label} exceeds the permission entry bound.`
    );
  }
  const seen = new Set<string>();
  for (const value of values) {
    if (
      !/^[\x21-\x7e]+$/.test(value) ||
      Buffer.byteLength(value, 'ascii') > MAX_PERMISSION_ASCII_BYTES ||
      seen.has(value)
    ) {
      throw new ReleaseSealError('MANIFEST_AUTHORITY_INVALID', `${label} is not canonical.`);
    }
    seen.add(value);
  }
  const sorted = [...values].sort(compareUnsignedUtf8);
  if (sorted.some((value, index) => value !== values[index])) {
    throw new ReleaseSealError('MANIFEST_AUTHORITY_INVALID', `${label} is not byte-sorted.`);
  }
}

function assertManifestAuthority(
  manifest: ManifestAuthorityV1,
  committedVersion: string,
  tree: CanonicalTreeReceiptV2
): void {
  if (
    manifest.schema !== 'missionpulse.manifest-authority' ||
    manifest.version !== 1 ||
    manifest.manifestVersion !== 3 ||
    manifest.extensionVersion !== committedVersion ||
    manifest.manifestSha256 !== tree.manifestSha256 ||
    !/^\d{2,4}$/.test(manifest.minimumChromeVersion)
  ) {
    throw new ReleaseSealError('MANIFEST_AUTHORITY_INVALID', 'Manifest identity does not match.');
  }
  assertSortedUniqueAscii(manifest.permissions, 'permissions');
  assertSortedUniqueAscii(manifest.hostPermissions, 'hostPermissions');
  assertSortedUniqueAscii(manifest.optionalHostPermissions, 'optionalHostPermissions');
  const expectedPermissionDigest = sha256Hex(
    jcsCanonicalize({
      permissions: manifest.permissions,
      hostPermissions: manifest.hostPermissions,
      optionalHostPermissions: manifest.optionalHostPermissions,
    })
  );
  if (manifest.permissionSetSha256 !== expectedPermissionDigest) {
    throw new ReleaseSealError(
      'MANIFEST_AUTHORITY_INVALID',
      'Permission-set digest does not match the effective arrays.'
    );
  }
}

function assertSameIdentity(input: CreateTestedDistSealInput): void {
  const receipts = [input.localGate, input.build, input.mv3Gate];
  if (receipts.some(({ releaseId }) => releaseId !== input.releaseId)) {
    throw new ReleaseSealError('SOURCE_IDENTITY_MISMATCH', 'Release IDs diverge.');
  }
  if (receipts.some(({ sourceCommit }) => sourceCommit !== input.sourceCommit)) {
    throw new ReleaseSealError('SOURCE_IDENTITY_MISMATCH', 'Source commits diverge.');
  }
  if (input.build.buildId !== input.buildId || input.mv3Gate.buildId !== input.buildId) {
    throw new ReleaseSealError('SOURCE_IDENTITY_MISMATCH', 'Build IDs diverge.');
  }
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(input.sourceCommit)) {
    throw new ReleaseSealError('SOURCE_IDENTITY_MISMATCH', 'Source commit is malformed.');
  }
}

function assertTrees(input: CreateTestedDistSealInput): void {
  if (
    !canonicalReceiptsEqual(input.testedTree, input.build.distTree) ||
    !canonicalReceiptsEqual(input.testedTree, input.mv3Gate.treeBeforeSuite) ||
    !canonicalReceiptsEqual(input.testedTree, input.mv3Gate.treeAfterSuite)
  ) {
    throw new ReleaseSealError('DIST_TREE_DRIFT', 'The tested dist changed across the gate.');
  }
  for (const receipt of [
    input.testedTree,
    input.build.distTree,
    input.mv3Gate.treeBeforeSuite,
    input.mv3Gate.treeAfterSuite,
  ]) {
    assertCanonicalTreeReceipt(receipt);
  }
}

function assertScenarioMatrix(input: CreateTestedDistSealInput): void {
  const expected = input.expectedMv3ScenarioIds;
  if (expected.length === 0 || expected.length > 512) {
    throw new ReleaseSealError('MV3_SCENARIO_MATRIX_MISMATCH', 'Scenario matrix must be nonempty.');
  }
  const seen = new Set<string>();
  for (const scenarioId of expected) {
    if (!SCENARIO_ID_PATTERN.test(scenarioId) || seen.has(scenarioId)) {
      throw new ReleaseSealError(
        'MV3_SCENARIO_MATRIX_MISMATCH',
        `Scenario ID is not canonical and unique: ${scenarioId}`
      );
    }
    seen.add(scenarioId);
  }
  const sorted = [...expected].sort(compareUnsignedUtf8);
  if (sorted.some((value, index) => value !== expected[index])) {
    throw new ReleaseSealError('MV3_SCENARIO_MATRIX_MISMATCH', 'Scenario IDs are not sorted.');
  }
  const expectedDigest = sha256Hex(jcsCanonicalize(expected));
  if (
    expectedDigest !== input.expectedMv3ScenarioInventorySha256 ||
    expectedDigest !== input.mv3Gate.expectedScenarioInventorySha256 ||
    jcsCanonicalize(expected) !== jcsCanonicalize(input.mv3Gate.executedScenarioIds)
  ) {
    throw new ReleaseSealError(
      'MV3_SCENARIO_MATRIX_MISMATCH',
      'Executed scenarios do not exactly match the committed matrix.'
    );
  }
  if (
    input.mv3Gate.passedScenarioCount !== expected.length ||
    input.mv3Gate.skippedScenarioCount !== 0 ||
    input.mv3Gate.failedScenarioCount !== 0 ||
    input.mv3Gate.runtimeDiagnosticFindingCount !== 0
  ) {
    throw new ReleaseSealError('MV3_GATE_NOT_GREEN', 'Packaged MV3 gate is not completely green.');
  }
}

function assertLocalGate(input: CreateTestedDistSealInput): void {
  const gate = input.localGate;
  if (
    gate.schema !== 'missionpulse.local-gate' ||
    gate.version !== 1 ||
    gate.format !== 'passed' ||
    gate.lint !== 'passed' ||
    gate.typecheck !== 'passed' ||
    gate.unit !== 'passed' ||
    gate.sourceManifest !== 'passed'
  ) {
    throw new ReleaseSealError('LOCAL_GATE_NOT_GREEN', 'Local gate is incomplete or failed.');
  }
  if (
    input.build.schema !== 'missionpulse.candidate-build' ||
    input.build.version !== 1 ||
    input.mv3Gate.schema !== 'missionpulse.packaged-mv3-gate' ||
    input.mv3Gate.version !== 1 ||
    !IDENTIFIER_PATTERN.test(gate.receiptId) ||
    !IDENTIFIER_PATTERN.test(input.build.receiptId) ||
    !IDENTIFIER_PATTERN.test(input.mv3Gate.receiptId) ||
    input.build.nodeVersion !== RELEASE_TOOLCHAIN.nodeVersion ||
    input.build.pnpmVersion !== RELEASE_TOOLCHAIN.pnpmVersion ||
    input.build.pythonVersion !== RELEASE_TOOLCHAIN.pythonVersion ||
    input.build.descriptorScannerProtocol !== RELEASE_TOOLCHAIN.descriptorScannerProtocol ||
    input.build.descriptorScannerSha256 !== RELEASE_TOOLCHAIN.descriptorScannerSha256
  ) {
    throw new ReleaseSealError('SEAL_INPUT_INVALID', 'Build or MV3 receipt schema is invalid.');
  }
}

function assertChronology(input: CreateTestedDistSealInput): void {
  const timestamps = [
    input.localGate.startedAt,
    input.localGate.completedAt,
    input.build.startedAt,
    input.build.completedAt,
    input.mv3Gate.startedAt,
    input.mv3Gate.completedAt,
    input.sealedAt,
  ].map(parseTimestamp);
  if (timestamps.some((value, index) => index > 0 && value < timestamps[index - 1])) {
    throw new ReleaseSealError(
      'RECEIPT_CHRONOLOGY_INVALID',
      'Gate timestamps are crossed or out of order.'
    );
  }
}

export function parseCommittedScenarioInventory(bytes: Uint8Array): readonly string[] {
  const raw = Buffer.from(bytes).toString('utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ReleaseSealError(
      'COMMITTED_SCENARIO_INVENTORY_INVALID',
      'Committed scenario inventory is not JSON.'
    );
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    (parsed as Record<string, unknown>).schema !== 'missionpulse.packaged-mv3-scenario-inventory' ||
    (parsed as Record<string, unknown>).version !== 1 ||
    !Array.isArray((parsed as Record<string, unknown>).scenarioIds) ||
    Object.keys(parsed).sort().join(',') !== 'scenarioIds,schema,version'
  ) {
    throw new ReleaseSealError(
      'COMMITTED_SCENARIO_INVENTORY_INVALID',
      'Committed scenario inventory schema is invalid.'
    );
  }
  if (jcsCanonicalize(parsed) !== raw) {
    throw new ReleaseSealError(
      'COMMITTED_SCENARIO_INVENTORY_INVALID',
      'Committed scenario inventory must use exact canonical newline-free JCS.'
    );
  }
  const scenarioIds = (parsed as { scenarioIds: unknown[] }).scenarioIds;
  if (!scenarioIds.every((value): value is string => typeof value === 'string')) {
    throw new ReleaseSealError(
      'COMMITTED_SCENARIO_INVENTORY_INVALID',
      'Scenario inventory contains a non-string ID.'
    );
  }
  const probe = createScenarioProbe(scenarioIds);
  return probe;
}

function createScenarioProbe(scenarioIds: readonly string[]): readonly string[] {
  if (scenarioIds.length === 0 || scenarioIds.length > 512) {
    throw new ReleaseSealError(
      'COMMITTED_SCENARIO_INVENTORY_INVALID',
      'Scenario inventory must contain 1..512 IDs.'
    );
  }
  const seen = new Set<string>();
  for (const scenarioId of scenarioIds) {
    if (!SCENARIO_ID_PATTERN.test(scenarioId) || seen.has(scenarioId)) {
      throw new ReleaseSealError(
        'COMMITTED_SCENARIO_INVENTORY_INVALID',
        `Scenario ID is invalid or duplicated: ${scenarioId}`
      );
    }
    seen.add(scenarioId);
  }
  const sorted = [...scenarioIds].sort(compareUnsignedUtf8);
  if (sorted.some((value, index) => value !== scenarioIds[index])) {
    throw new ReleaseSealError(
      'COMMITTED_SCENARIO_INVENTORY_INVALID',
      'Scenario inventory must be sorted by unsigned ASCII bytes.'
    );
  }
  return Object.freeze([...scenarioIds]);
}

export function createTestedDistSeal(inputValue: CreateTestedDistSealInput): TestedDistSealV1 {
  const input = snapshot(inputValue);
  assertIdentifier(input.sealId, 'sealId');
  assertIdentifier(input.releaseId, 'releaseId');
  assertIdentifier(input.buildId, 'buildId');
  assertCanonicalSemver(input.committedVersion);
  assertSha256(input.expectedMv3ScenarioInventorySha256, 'scenario inventory digest');
  assertConfiguration(input);
  if (!input.worktreeCleanBeforeGate || !input.worktreeCleanAfterGate) {
    throw new ReleaseSealError('WORKTREE_DIRTY', 'A tested dist seal requires clean boundaries.');
  }
  assertSameIdentity(input);
  assertLocalGate(input);
  assertTrees(input);
  assertManifestAuthority(input.manifest, input.committedVersion, input.testedTree);
  if (jcsCanonicalize(input.manifest) !== jcsCanonicalize(input.build.manifest)) {
    throw new ReleaseSealError('MANIFEST_AUTHORITY_INVALID', 'Build manifest authority diverges.');
  }
  assertScenarioMatrix(input);
  assertChronology(input);
  assertBlobRef(input.localGate.report, 'local gate report');
  assertBlobRef(input.build.report, 'build report');
  assertBlobRef(input.mv3Gate.rawPlaywrightReport, 'raw Playwright report');
  assertBlobRef(input.mv3Gate.report, 'MV3 aggregate report');

  const unsignedSeal = {
    schema: 'missionpulse.tested-dist-seal' as const,
    version: 1 as const,
    sealId: input.sealId,
    releaseId: input.releaseId,
    sourceCommit: input.sourceCommit,
    committedVersion: input.committedVersion,
    buildId: input.buildId,
    lockfileSha256: input.lockfileSha256,
    connectorConfigSha256: input.connectorConfigSha256,
    includedConnectorIds: input.includedConnectorIds,
    localGate: input.localGate,
    build: input.build,
    mv3Gate: input.mv3Gate,
    testedTree: input.testedTree,
    manifest: input.manifest,
    worktreeCleanBeforeGate: true as const,
    worktreeCleanAfterGate: true as const,
    sealedAt: input.sealedAt,
  };
  return snapshot({
    ...unsignedSeal,
    sealSha256: sha256Hex(jcsCanonicalize(unsignedSeal)),
  }) as TestedDistSealV1;
}

export function assertBuiltManifestMatchesSeal(
  manifestBytes: Uint8Array,
  authority: ManifestAuthorityV1,
  tree: CanonicalTreeReceiptV2
): void {
  if (
    sha256Hex(manifestBytes) !== tree.manifestSha256 ||
    authority.manifestSha256 !== tree.manifestSha256
  ) {
    throw new ReleaseSealError(
      'MANIFEST_AUTHORITY_INVALID',
      'Built manifest bytes do not match the sealed tree.'
    );
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(Buffer.from(manifestBytes).toString('utf8'));
  } catch {
    throw new ReleaseSealError('MANIFEST_AUTHORITY_INVALID', 'Built manifest is not JSON.');
  }
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    throw new ReleaseSealError('MANIFEST_AUTHORITY_INVALID', 'Built manifest is not an object.');
  }
  const record = manifest as Record<string, unknown>;
  const sortedStrings = (value: unknown): readonly string[] | null => {
    if (
      !Array.isArray(value) ||
      value.length > MAX_PERMISSION_ENTRIES ||
      !value.every(
        (entry) =>
          typeof entry === 'string' &&
          /^[\x21-\x7e]+$/.test(entry) &&
          Buffer.byteLength(entry, 'ascii') <= MAX_PERMISSION_ASCII_BYTES
      )
    ) {
      return null;
    }
    return [...(value as string[])].sort(compareUnsignedUtf8);
  };
  const permissions = sortedStrings(record.permissions ?? []);
  const hostPermissions = sortedStrings(record.host_permissions ?? []);
  const optionalHostPermissions = sortedStrings(record.optional_host_permissions ?? []);
  if (
    record.manifest_version !== 3 ||
    record.version !== authority.extensionVersion ||
    record.minimum_chrome_version !== authority.minimumChromeVersion ||
    permissions === null ||
    hostPermissions === null ||
    optionalHostPermissions === null ||
    jcsCanonicalize(permissions) !== jcsCanonicalize(authority.permissions) ||
    jcsCanonicalize(hostPermissions) !== jcsCanonicalize(authority.hostPermissions) ||
    jcsCanonicalize(optionalHostPermissions) !== jcsCanonicalize(authority.optionalHostPermissions)
  ) {
    throw new ReleaseSealError(
      'MANIFEST_AUTHORITY_INVALID',
      'Built manifest fields or effective permission arrays diverge from the seal.'
    );
  }
}

export function assertValidTestedDistSeal(seal: TestedDistSealV1): void {
  if (seal.schema !== 'missionpulse.tested-dist-seal' || seal.version !== 1) {
    throw new ReleaseSealError('SEAL_INPUT_INVALID', 'Tested dist seal schema is invalid.');
  }
  const recreated = createTestedDistSeal({
    ...seal,
    expectedMv3ScenarioIds: seal.mv3Gate.executedScenarioIds,
    expectedMv3ScenarioInventorySha256: seal.mv3Gate.expectedScenarioInventorySha256,
  });
  if (
    recreated.sealSha256 !== seal.sealSha256 ||
    jcsCanonicalize(recreated) !== jcsCanonicalize(seal)
  ) {
    throw new ReleaseSealError('SEAL_INPUT_INVALID', 'Tested dist seal self digest is invalid.');
  }
}

async function readNoFollow(path: string, maxBytes = MAX_GATE_JSON_BYTES): Promise<Buffer> {
  const handle = await open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.nlink !== 1n ||
      before.size < 0n ||
      before.size > BigInt(maxBytes)
    ) {
      throw new ReleaseSealError(
        'SEAL_INPUT_INVALID',
        `Evidence must be one regular file: ${path}`
      );
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      bytes.byteLength !== Number(before.size)
    ) {
      throw new ReleaseSealError('SEAL_INPUT_INVALID', `Evidence changed while reading: ${path}`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

function parseCliArgs(args: readonly string[]): { input: string; output: string; dist: string } {
  let input: string | undefined;
  let output: string | undefined;
  let dist: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--input') {
      input = args[++index];
    } else if (arg === '--output') {
      output = args[++index];
    } else if (arg === '--dist') {
      dist = args[++index];
    } else {
      throw new ReleaseSealError('SEAL_INPUT_INVALID', `Unknown sealer argument: ${arg}`);
    }
  }
  if (input === undefined || output === undefined || dist === undefined) {
    throw new ReleaseSealError(
      'SEAL_INPUT_INVALID',
      'Usage: --input <gate.json> --dist <tested-dist> --output <seal.json>'
    );
  }
  return { input: resolve(input), output: resolve(output), dist: resolve(dist) };
}

export async function sealTestedDistCli(
  args: readonly string[] = process.argv.slice(2)
): Promise<void> {
  const options = parseCliArgs(args);
  const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const workspaceRoot = resolve(extensionRoot, '../..');
  if (
    process.env.CONNECTORS_INCLUDE !== undefined ||
    process.env.CONNECTORS_EXCLUDE !== undefined
  ) {
    throw new ReleaseSealError(
      'SOURCE_IDENTITY_MISMATCH',
      'Connector environment overrides are forbidden at the final seal boundary.'
    );
  }
  const { stdout: statusBefore } = await execFile(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    { cwd: workspaceRoot }
  );
  if (statusBefore.length !== 0) {
    throw new ReleaseSealError('WORKTREE_DIRTY', 'Refusing to seal a dirty worktree.');
  }
  const input = parseCanonicalReport(
    await readNoFollow(options.input),
    'final gate input'
  ) as unknown as CreateTestedDistSealInput;
  await verifyReferencedGateReports(input);
  const { stdout: head } = await execFile('git', ['rev-parse', 'HEAD'], { cwd: workspaceRoot });
  if (head.trim() !== input.sourceCommit) {
    throw new ReleaseSealError('SOURCE_IDENTITY_MISMATCH', 'Current HEAD does not match evidence.');
  }
  const committedPackage = JSON.parse(
    (
      await execFile('git', ['show', `${input.sourceCommit}:apps/extension/package.json`], {
        cwd: workspaceRoot,
      })
    ).stdout
  ) as { version?: unknown };
  if (committedPackage.version !== input.committedVersion) {
    throw new ReleaseSealError(
      'VERSION_MISMATCH',
      'Committed package version does not match evidence.'
    );
  }
  if (
    input.build.nodeVersion !== RELEASE_TOOLCHAIN.nodeVersion ||
    process.versions.node !== RELEASE_TOOLCHAIN.nodeVersion
  ) {
    throw new ReleaseSealError(
      'SOURCE_IDENTITY_MISMATCH',
      'Node toolchain version does not match evidence.'
    );
  }
  const committedRootPackage = JSON.parse(
    (await execFile('git', ['show', `${input.sourceCommit}:package.json`], { cwd: workspaceRoot }))
      .stdout
  ) as { version?: unknown };
  if (committedRootPackage.version !== input.committedVersion) {
    throw new ReleaseSealError('VERSION_MISMATCH', 'Committed root package version diverges.');
  }
  const committedLockfile = (
    await execFile('git', ['show', `${input.sourceCommit}:pnpm-lock.yaml`], { cwd: workspaceRoot })
  ).stdout;
  if (sha256Hex(Buffer.from(committedLockfile, 'utf8')) !== input.lockfileSha256) {
    throw new ReleaseSealError(
      'SOURCE_IDENTITY_MISMATCH',
      'Committed lockfile bytes do not match the gate configuration.'
    );
  }
  const committedConnectorConfig = (
    await execFile('git', ['show', `${input.sourceCommit}:apps/extension/connectors.config.json`], {
      cwd: workspaceRoot,
    })
  ).stdout;
  if (sha256Hex(Buffer.from(committedConnectorConfig, 'utf8')) !== input.connectorConfigSha256) {
    throw new ReleaseSealError(
      'SOURCE_IDENTITY_MISMATCH',
      'Committed connector config bytes do not match the gate configuration.'
    );
  }
  let connectorConfig: ConnectorConfig;
  try {
    connectorConfig = JSON.parse(committedConnectorConfig) as ConnectorConfig;
  } catch {
    throw new ReleaseSealError(
      'SOURCE_IDENTITY_MISMATCH',
      'Committed connector config is not JSON.'
    );
  }
  const connectorResolution = resolveIncludedConnectors({
    allIds: getAllConnectorsMeta().map(({ id }) => id),
    config: connectorConfig,
    env: {},
  });
  const committedIncludedConnectorIds = [...connectorResolution.included].sort(compareUnsignedUtf8);
  if (
    connectorResolution.warnings.length !== 0 ||
    jcsCanonicalize(committedIncludedConnectorIds) !== jcsCanonicalize(input.includedConnectorIds)
  ) {
    throw new ReleaseSealError(
      'SOURCE_IDENTITY_MISMATCH',
      'Included connector set does not match committed build configuration.'
    );
  }
  const scenarioBlob = (
    await execFile(
      'git',
      ['show', `${input.sourceCommit}:apps/extension/tests/mv3/scenarios.v1.json`],
      { cwd: workspaceRoot }
    )
  ).stdout;
  const committedScenarioIds = parseCommittedScenarioInventory(Buffer.from(scenarioBlob, 'utf8'));
  if (
    jcsCanonicalize(committedScenarioIds) !== jcsCanonicalize(input.expectedMv3ScenarioIds) ||
    sha256Hex(jcsCanonicalize(committedScenarioIds)) !== input.expectedMv3ScenarioInventorySha256
  ) {
    throw new ReleaseSealError(
      'MV3_SCENARIO_MATRIX_MISMATCH',
      'Gate input does not match the scenario inventory blob at the source commit.'
    );
  }
  const { stdout: pnpmVersion } = await execFile('pnpm', ['--version'], { cwd: workspaceRoot });
  if (
    pnpmVersion.trim() !== RELEASE_TOOLCHAIN.pnpmVersion ||
    input.build.pnpmVersion !== RELEASE_TOOLCHAIN.pnpmVersion
  ) {
    throw new ReleaseSealError(
      'SOURCE_IDENTITY_MISMATCH',
      'pnpm toolchain version does not match evidence.'
    );
  }
  const pythonExecutable = process.env.PULSE_RELEASE_PYTHON ?? 'python3';
  let pinnedPython;
  try {
    pinnedPython = await attestPinnedPythonRuntime(
      pythonExecutable,
      RELEASE_TOOLCHAIN.pythonVersion
    );
  } catch (error) {
    throw new ReleaseSealError(
      'SOURCE_IDENTITY_MISMATCH',
      'Python descriptor-scanner toolchain is not an attested native binary.',
      { cause: error instanceof Error ? error.message : String(error) }
    );
  }
  await pinnedPython.handle.close();
  if (
    input.build.pythonVersion !== RELEASE_TOOLCHAIN.pythonVersion ||
    input.build.descriptorScannerProtocol !== RELEASE_TOOLCHAIN.descriptorScannerProtocol ||
    input.build.descriptorScannerSha256 !== RELEASE_TOOLCHAIN.descriptorScannerSha256
  ) {
    throw new ReleaseSealError(
      'SOURCE_IDENTITY_MISMATCH',
      'Python descriptor-scanner toolchain does not match evidence.'
    );
  }
  const observedTree = await inspectCanonicalTree(options.dist);
  if (!canonicalReceiptsEqual(observedTree, input.testedTree)) {
    throw new ReleaseSealError('DIST_TREE_DRIFT', 'Current dist does not match the tested tree.');
  }
  const builtManifestBytes = await readNoFollow(join(options.dist, 'manifest.json'));
  assertBuiltManifestMatchesSeal(builtManifestBytes, input.manifest, input.testedTree);
  await execFile(
    'pnpm',
    [
      '--filter',
      '@pulse/extension',
      'verify-manifest',
      options.dist,
      '--post-build',
      '--expected-version',
      input.committedVersion,
    ],
    { cwd: workspaceRoot }
  );

  const seal = createTestedDistSeal(input);
  const { stdout: statusAfter } = await execFile(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    { cwd: workspaceRoot }
  );
  if (statusAfter.length !== 0) {
    throw new ReleaseSealError('WORKTREE_DIRTY', 'Worktree changed during sealing.');
  }
  await writeFile(options.output, jcsCanonicalize(seal), { flag: 'wx', mode: 0o600 });
}

const invokedPath = process.argv[1] === undefined ? null : resolve(process.argv[1]);
if (invokedPath !== null && fileURLToPath(import.meta.url) === invokedPath) {
  sealTestedDistCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
