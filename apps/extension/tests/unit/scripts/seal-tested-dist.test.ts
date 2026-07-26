import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  jcsCanonicalize,
  sha256Hex,
  type CanonicalTreeReceiptV2,
} from '../../../scripts/canonical-artifact';
import {
  ReleaseSealError,
  RELEASE_TOOLCHAIN,
  assertPackagedMv3ReportMatchesReceipt,
  assertBuiltManifestMatchesSeal,
  createTestedDistSeal,
  parseCommittedScenarioInventory,
  verifyReferencedGateReports,
  type CreateTestedDistSealInput,
} from '../../../scripts/seal-tested-dist';

const manifestBytes = Buffer.from(
  '{"host_permissions":["https://example.test/*"],"manifest_version":3,"minimum_chrome_version":"114","optional_host_permissions":[],"permissions":["alarms"],"version":"0.2.2"}'
);
const manifestDigest = sha256Hex(manifestBytes);
const tree: CanonicalTreeReceiptV2 = {
  algorithm: 'missionpulse-tree-sha256-v2',
  fileCount: 1,
  treeSha256: sha256Hex(`manifest.json\0${manifestBytes.byteLength}\0${manifestDigest}\n`),
  manifestSha256: manifestDigest,
  entries: [
    {
      path: 'manifest.json',
      bytes: manifestBytes.byteLength,
      sha256: manifestDigest,
      mode: '0644',
    },
  ],
};

const permissions = ['alarms'];
const hostPermissions = ['https://example.test/*'];
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

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

function blobRef(seed: string) {
  return {
    schema: 'missionpulse.immutable-blob' as const,
    version: 1 as const,
    kind: 'gate-report',
    immutableUri: `file:///evidence/${seed}.json`,
    bytes: 10,
    sha256: seed.repeat(64).slice(0, 64),
  };
}

function rawPlaywrightReport(scenarioIds: readonly string[], diagnosticScenarioId?: string) {
  return {
    suites: [
      {
        title: 'packaged MV3',
        specs: scenarioIds.map((scenarioId) => ({
          title: scenarioId,
          tests: [
            {
              annotations: [{ type: 'scenario-id', description: scenarioId }],
              expectedStatus: 'passed',
              status: 'expected',
              results: [
                {
                  status: 'passed',
                  attachments:
                    scenarioId === diagnosticScenarioId
                      ? [{ name: 'runtime-diagnostics', contentType: 'application/json' }]
                      : [],
                },
              ],
            },
          ],
        })),
      },
    ],
  };
}

function validInput(): CreateTestedDistSealInput {
  const scenarioIds = ['navigation.all-tabs', 'runtime.service-worker-reload'];
  const scenarioDigest = sha256Hex(jcsCanonicalize(scenarioIds));
  return {
    sealId: 'seal-0.2.2',
    releaseId: 'release-0.2.2',
    sourceCommit: 'a'.repeat(40),
    committedVersion: '0.2.2',
    buildId: 'build-0.2.2',
    lockfileSha256: '1'.repeat(64),
    connectorConfigSha256: '2'.repeat(64),
    includedConnectorIds: ['freework'],
    expectedMv3ScenarioIds: scenarioIds,
    expectedMv3ScenarioInventorySha256: scenarioDigest,
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
      report: blobRef('4'),
    },
    build: {
      schema: 'missionpulse.candidate-build',
      version: 1,
      receiptId: 'build-receipt-1',
      buildId: 'build-0.2.2',
      releaseId: 'release-0.2.2',
      sourceCommit: 'a'.repeat(40),
      nodeVersion: '22.23.1',
      pnpmVersion: '10.32.1',
      pythonVersion: '3.14.5',
      descriptorScannerProtocol: 'missionpulse.descriptor-scanner.v1',
      descriptorScannerSha256: 'e440610e7d2c490a7ebb1b70746ae2a9c243eccd7e4e845f95262ef3e4794c1a',
      startedAt: '2026-07-16T08:01:00.000Z',
      completedAt: '2026-07-16T08:02:00.000Z',
      distTree: tree,
      manifest,
      report: blobRef('5'),
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
      expectedScenarioInventorySha256: scenarioDigest,
      executedScenarioIds: scenarioIds,
      passedScenarioCount: 2,
      skippedScenarioCount: 0,
      failedScenarioCount: 0,
      runtimeDiagnosticFindingCount: 0,
      treeBeforeSuite: tree,
      treeAfterSuite: tree,
      rawPlaywrightReport: blobRef('7'),
      report: blobRef('6'),
    },
    testedTree: tree,
    manifest,
    worktreeCleanBeforeGate: true,
    worktreeCleanAfterGate: true,
    sealedAt: '2026-07-16T08:04:00.000Z',
  };
}

describe('tested dist seal', () => {
  it('uses one exact reviewed Node and pnpm patch pair', () => {
    expect(RELEASE_TOOLCHAIN).toEqual({
      nodeVersion: '22.23.1',
      pnpmVersion: '10.32.1',
      pythonVersion: '3.14.5',
      descriptorScannerProtocol: 'missionpulse.descriptor-scanner.v1',
      descriptorScannerSha256: 'e440610e7d2c490a7ebb1b70746ae2a9c243eccd7e4e845f95262ef3e4794c1a',
    });
  });

  it('binds complete green local/build/MV3 evidence with a self digest', () => {
    const seal = createTestedDistSeal(validInput());

    expect(seal.sealSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(seal.testedTree).toEqual(tree);
    expect(seal).toMatchObject({
      lockfileSha256: '1'.repeat(64),
      connectorConfigSha256: '2'.repeat(64),
      includedConnectorIds: ['freework'],
    });
    expect(sha256Hex(jcsCanonicalize({ ...seal, sealSha256: undefined }))).toBe(seal.sealSha256);
  });

  it('dereferences and validates the exact local, build and Playwright report bytes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'missionpulse-gate-reports-'));
    roots.push(root);
    let input = validInput();
    const rawPlaywrightPath = join(root, 'playwright.json');
    const rawPlaywrightBytes = Buffer.from(
      jcsCanonicalize(rawPlaywrightReport(input.expectedMv3ScenarioIds))
    );
    await writeFile(rawPlaywrightPath, rawPlaywrightBytes);
    const rawPlaywrightReference = {
      schema: 'missionpulse.immutable-blob' as const,
      version: 1 as const,
      kind: 'playwright-json-report',
      immutableUri: pathToFileURL(rawPlaywrightPath).href,
      bytes: rawPlaywrightBytes.byteLength,
      sha256: sha256Hex(rawPlaywrightBytes),
    };
    input = {
      ...input,
      mv3Gate: { ...input.mv3Gate, rawPlaywrightReport: rawPlaywrightReference },
    };
    const reports = [
      {
        path: join(root, 'local.json'),
        kind: 'local-gate-report',
        value: {
          schema: 'missionpulse.local-gate-report',
          version: 1,
          sourceCommit: input.sourceCommit,
          startedAt: input.localGate.startedAt,
          completedAt: input.localGate.completedAt,
          commands: ['format', 'lint', 'sourceManifest', 'typecheck', 'unit'].map((name) => ({
            name,
            exitCode: 0,
          })),
        },
      },
      {
        path: join(root, 'build.json'),
        kind: 'candidate-build-report',
        value: {
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
        },
      },
      {
        path: join(root, 'mv3.json'),
        kind: 'packaged-mv3-playwright-report',
        value: {
          schema: 'missionpulse.packaged-mv3-playwright-report',
          version: 1,
          startedAt: input.mv3Gate.startedAt,
          completedAt: input.mv3Gate.completedAt,
          runtimeDiagnosticFindingCount: 0,
          scenarioResults: input.expectedMv3ScenarioIds.map((scenarioId) => ({
            scenarioId,
            expectedStatus: 'passed',
            actualStatus: 'passed',
            outcome: 'expected',
          })),
        },
      },
    ] as const;

    for (const report of reports) {
      const bytes = Buffer.from(jcsCanonicalize(report.value));
      await writeFile(report.path, bytes);
      const reference = {
        schema: 'missionpulse.immutable-blob' as const,
        version: 1 as const,
        kind: report.kind,
        immutableUri: pathToFileURL(report.path).href,
        bytes: bytes.byteLength,
        sha256: sha256Hex(bytes),
      };
      if (report.kind === 'local-gate-report') {
        input = { ...input, localGate: { ...input.localGate, report: reference } };
      }
      if (report.kind === 'candidate-build-report') {
        input = { ...input, build: { ...input.build, report: reference } };
      }
      if (report.kind === 'packaged-mv3-playwright-report') {
        input = { ...input, mv3Gate: { ...input.mv3Gate, report: reference } };
      }
    }

    await expect(verifyReferencedGateReports(input)).resolves.toBeUndefined();

    const emptyRawReport = Buffer.from(jcsCanonicalize({ suites: [] }));
    await writeFile(rawPlaywrightPath, emptyRawReport);
    await expect(
      verifyReferencedGateReports({
        ...input,
        mv3Gate: {
          ...input.mv3Gate,
          rawPlaywrightReport: {
            ...rawPlaywrightReference,
            bytes: emptyRawReport.byteLength,
            sha256: sha256Hex(emptyRawReport),
          },
        },
      })
    ).rejects.toMatchObject({ code: 'MV3_SCENARIO_MATRIX_MISMATCH' });

    const diagnosticRawReport = Buffer.from(
      jcsCanonicalize(
        rawPlaywrightReport(input.expectedMv3ScenarioIds, input.expectedMv3ScenarioIds[0])
      )
    );
    await writeFile(rawPlaywrightPath, diagnosticRawReport);
    await expect(
      verifyReferencedGateReports({
        ...input,
        mv3Gate: {
          ...input.mv3Gate,
          rawPlaywrightReport: {
            ...rawPlaywrightReference,
            bytes: diagnosticRawReport.byteLength,
            sha256: sha256Hex(diagnosticRawReport),
          },
        },
      })
    ).rejects.toMatchObject({ code: 'MV3_GATE_NOT_GREEN' });

    await writeFile(rawPlaywrightPath, rawPlaywrightBytes);
    await writeFile(reports[2].path, '{}');
    await expect(verifyReferencedGateReports(input)).rejects.toMatchObject({
      code: 'REPORT_REFERENCE_INVALID',
    });
  });

  it('rejects a declared green MV3 receipt when the structured report omits a scenario', () => {
    const input = validInput();
    const value = {
      schema: 'missionpulse.packaged-mv3-playwright-report',
      version: 1,
      startedAt: input.mv3Gate.startedAt,
      completedAt: input.mv3Gate.completedAt,
      runtimeDiagnosticFindingCount: 0,
      scenarioResults: [
        {
          scenarioId: input.expectedMv3ScenarioIds[0],
          expectedStatus: 'passed',
          actualStatus: 'passed',
          outcome: 'expected',
        },
      ],
    };
    expect(() =>
      assertPackagedMv3ReportMatchesReceipt(Buffer.from(jcsCanonicalize(value)), input)
    ).toThrowError(ReleaseSealError);
    try {
      assertPackagedMv3ReportMatchesReceipt(Buffer.from(jcsCanonicalize(value)), input);
    } catch (error) {
      expect(error).toMatchObject({ code: 'MV3_SCENARIO_MATRIX_MISMATCH' });
    }
  });

  it('binds the actual built manifest bytes and effective permission arrays', () => {
    assertBuiltManifestMatchesSeal(manifestBytes, manifest, tree);
    expect(() =>
      assertBuiltManifestMatchesSeal(
        Buffer.from(manifestBytes.toString('utf8').replace('"alarms"', '"storage"')),
        manifest,
        tree
      )
    ).toThrowError(ReleaseSealError);
  });

  it.each([
    [
      'more than 128 entries',
      Array.from({ length: 129 }, (_, index) => `p-${index.toString().padStart(3, '0')}`),
    ],
    ['an entry larger than 512 ASCII bytes', ['p'.repeat(513)]],
  ])('rejects permission arrays with %s', (_label, oversizedPermissions) => {
    const input = validInput();
    const oversizedManifest = {
      ...input.manifest,
      permissions: oversizedPermissions,
      permissionSetSha256: sha256Hex(
        jcsCanonicalize({
          permissions: oversizedPermissions,
          hostPermissions: input.manifest.hostPermissions,
          optionalHostPermissions: input.manifest.optionalHostPermissions,
        })
      ),
    };
    expect(() =>
      createTestedDistSeal({
        ...input,
        manifest: oversizedManifest,
        build: { ...input.build, manifest: oversizedManifest },
      })
    ).toThrowError(ReleaseSealError);
    try {
      createTestedDistSeal({
        ...input,
        manifest: oversizedManifest,
        build: { ...input.build, manifest: oversizedManifest },
      });
    } catch (error) {
      expect(error).toMatchObject({ code: 'MANIFEST_AUTHORITY_INVALID' });
    }
  });

  it('rejects canonical-looking timestamps before year 2000', () => {
    const input = validInput();
    expect(() =>
      createTestedDistSeal({
        ...input,
        localGate: { ...input.localGate, startedAt: '1999-12-31T23:59:59.999Z' },
      })
    ).toThrowError(ReleaseSealError);
    try {
      createTestedDistSeal({
        ...input,
        localGate: { ...input.localGate, startedAt: '1999-12-31T23:59:59.999Z' },
      });
    } catch (error) {
      expect(error).toMatchObject({ code: 'RECEIPT_CHRONOLOGY_INVALID' });
    }
  });

  it.each([
    [
      'dirty worktree',
      (input: CreateTestedDistSealInput) => ({ ...input, worktreeCleanAfterGate: false }),
      'WORKTREE_DIRTY',
    ],
    [
      'missing scenario',
      (input: CreateTestedDistSealInput) => ({
        ...input,
        mv3Gate: {
          ...input.mv3Gate,
          executedScenarioIds: input.mv3Gate.executedScenarioIds.slice(0, 1),
          passedScenarioCount: 1,
        },
      }),
      'MV3_SCENARIO_MATRIX_MISMATCH',
    ],
    [
      'skipped scenario',
      (input: CreateTestedDistSealInput) => ({
        ...input,
        mv3Gate: { ...input.mv3Gate, skippedScenarioCount: 1 as 0 },
      }),
      'MV3_GATE_NOT_GREEN',
    ],
    [
      'dist mutation',
      (input: CreateTestedDistSealInput) => ({
        ...input,
        mv3Gate: { ...input.mv3Gate, treeAfterSuite: { ...tree, treeSha256: '9'.repeat(64) } },
      }),
      'DIST_TREE_DRIFT',
    ],
    [
      'crossed chronology',
      (input: CreateTestedDistSealInput) => ({ ...input, sealedAt: '2026-07-16T07:59:00.000Z' }),
      'RECEIPT_CHRONOLOGY_INVALID',
    ],
  ])('fails closed for %s', (_label, mutate, expectedCode) => {
    expect(() => createTestedDistSeal(mutate(validInput()))).toThrowError(ReleaseSealError);
    try {
      createTestedDistSeal(mutate(validInput()));
    } catch (error) {
      expect(error).toMatchObject({ code: expectedCode });
    }
  });

  it('accepts only exact newline-free JCS committed scenario inventory bytes', () => {
    const inventory = {
      schema: 'missionpulse.packaged-mv3-scenario-inventory',
      version: 1,
      scenarioIds: ['navigation.all-tabs', 'runtime.service-worker-reload'],
    } as const;
    const bytes = Buffer.from(jcsCanonicalize(inventory));

    expect(parseCommittedScenarioInventory(bytes)).toEqual(inventory.scenarioIds);
    expect(() =>
      parseCommittedScenarioInventory(Buffer.concat([bytes, Buffer.from('\n')]))
    ).toThrowError(/canonical/i);
  });

  it('keeps the repository MV3 matrix committed, canonical, nonempty and exact', () => {
    const bytes = readFileSync(resolve(import.meta.dirname, '../../mv3/scenarios.v1.json'));
    expect(parseCommittedScenarioInventory(bytes)).toEqual([
      'harness.bootstrap-diagnostics',
      'harness.late-diagnostic',
      'harness.page-console',
      'harness.page-error',
      'harness.worker-rejection',
      'navigation.all-tabs',
      'navigation.cold-onboarding',
      'navigation.shortcuts-focus',
      'runtime.service-worker-reload',
    ]);
  });
});
