import { expect, test as base, type ConsoleMessage, type Page } from '@playwright/test';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertArtifactUnchanged,
  assertNoForbiddenDevArtifacts,
  inspectPackagedArtifact,
  type PackagedArtifactEvidence,
} from '../mv3/artifact';
import {
  assertNoRuntimeDiagnostics,
  createRuntimeDiagnostics,
  recordConsoleDiagnostic,
  recordPageError,
  recordWorkerException,
  snapshotRuntimeDiagnostics,
  type RuntimeDiagnosticsSnapshot,
} from '../mv3/diagnostics';
import type { RestartReceiptV1 } from '../mv3/harness/contracts';
import {
  Mv3HarnessController,
  type DetachedWorkerIdentity,
} from '../mv3/harness/mv3-harness-controller';
import type { PlaywrightDiagnostic } from '../mv3/harness/playwright-owner';
import { assertPackagedManifestPermissionContract } from '../mv3/manifest-contract';

const extensionRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const distPath = resolve(extensionRoot, 'dist');
const artifactRoot = resolve(extensionRoot, '../../output/playwright');
const profileRoot = resolve(artifactRoot, 'extension-profiles');
const evidenceRoot = resolve(artifactRoot, 'mv3-evidence');
let suiteArtifact: PackagedArtifactEvidence | undefined;

export interface PackagedManifest {
  manifest_version: number;
  permissions?: string[];
  host_permissions?: string[];
  optional_host_permissions?: string[];
  background?: {
    service_worker?: string;
    type?: string;
  };
  side_panel?: {
    default_path?: string;
  };
}

export interface ExtensionHarness {
  readonly diagnostics: RuntimeDiagnosticsSnapshot;
  readonly extensionId: string;
  readonly manifest: PackagedManifest;
  readonly sidePanelUrl: string;
  evaluateInRestartedServiceWorker: <T>(
    receipt: RestartReceiptV1,
    expression: string
  ) => Promise<T>;
  evaluateInServiceWorker: <T>(expression: string) => Promise<T>;
  openSidePanel: () => Promise<Page>;
  restartServiceWorkerForProbe: (probeExpression?: string) => Promise<RestartReceiptV1>;
  seedStorage: (values: Record<string, unknown>) => Promise<void>;
  waitForServiceWorker: (wakePage?: Page) => Promise<DetachedWorkerIdentity>;
}

interface ExtensionFixtures {
  extension: ExtensionHarness;
}

function formatConsoleMessage(message: ConsoleMessage): string {
  const location = message.location();
  const source = location.url ? ` (${location.url}:${location.lineNumber ?? 0})` : '';
  return `${message.text()}${source}`;
}

function hasRuntimeDiagnostics(diagnostics: RuntimeDiagnosticsSnapshot): boolean {
  return Object.values(diagnostics).some((messages) => messages.length > 0);
}

async function settleRuntimeDiagnostics(): Promise<void> {
  await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 100));
}

function diagnosticText(diagnostic: PlaywrightDiagnostic): string {
  try {
    return JSON.stringify(diagnostic.params);
  } catch {
    return diagnostic.method;
  }
}

export const test = base.extend<ExtensionFixtures>({
  extension: async ({ browserName: _browserName }, use, testInfo) => {
    const manifestPath = resolve(distPath, 'manifest.json');
    await access(manifestPath).catch(() => {
      throw new Error(
        `Packaged extension not found at ${manifestPath}. Run the test:mv3 script so the exact package is built first.`
      );
    });

    const observedArtifact = await inspectPackagedArtifact(distPath);
    if (suiteArtifact === undefined) {
      suiteArtifact = observedArtifact;
    } else {
      assertArtifactUnchanged(suiteArtifact, observedArtifact);
    }
    const artifactBefore = suiteArtifact;
    assertNoForbiddenDevArtifacts(artifactBefore);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as PackagedManifest;
    assertPackagedManifestPermissionContract(manifest);

    await mkdir(evidenceRoot, { recursive: true });
    await writeFile(
      resolve(evidenceRoot, 'tested-artifact.json'),
      `${JSON.stringify({ artifact: artifactBefore, manifest }, null, 2)}\n`,
      'utf8'
    );

    const diagnostics = createRuntimeDiagnostics();
    const controller = await Mv3HarnessController.start({
      artifactSha256: artifactBefore.treeSha256,
      distPath,
      headless: process.env.PLAYWRIGHT_EXTENSION_HEADLESS !== 'false',
      manifest,
      onPlaywrightDiagnostic: (diagnostic) => {
        const message = diagnosticText(diagnostic);
        if (diagnostic.method === 'Runtime.consoleAPICalled') {
          const level =
            typeof diagnostic.params.type === 'string' ? diagnostic.params.type : 'warning';
          recordConsoleDiagnostic(diagnostics, 'service_worker', level, message);
          return;
        }
        if (
          diagnostic.method === 'Runtime.exceptionThrown' ||
          diagnostic.method === 'ServiceWorker.workerErrorReported'
        ) {
          recordWorkerException(diagnostics, message);
        }
      },
      onProtocolFailure: (error) => recordWorkerException(diagnostics, error.message),
      profileRoot,
    });

    const instrumentedPages = new WeakSet<Page>();
    const instrumentPage = (page: Page): void => {
      if (instrumentedPages.has(page)) {
        return;
      }
      instrumentedPages.add(page);
      page.on('pageerror', (error) => recordPageError(diagnostics, error.stack ?? error.message));
      page.on('console', (message) => {
        recordConsoleDiagnostic(diagnostics, 'page', message.type(), formatConsoleMessage(message));
      });
    };

    const openSidePanel = async (): Promise<Page> => {
      const page = await controller.openSidePanel();
      instrumentPage(page);
      return page;
    };

    await testInfo.attach('packaged-manifest', {
      body: JSON.stringify(manifest, null, 2),
      contentType: 'application/json',
    });
    await testInfo.attach('packaged-artifact-before', {
      body: JSON.stringify(artifactBefore, null, 2),
      contentType: 'application/json',
    });

    let testError: unknown;
    try {
      await use({
        get diagnostics() {
          return snapshotRuntimeDiagnostics(diagnostics);
        },
        extensionId: controller.extensionId,
        evaluateInRestartedServiceWorker: (receipt, expression) =>
          controller.evaluateInRestartedServiceWorker(receipt, expression),
        evaluateInServiceWorker: (expression) => controller.evaluateInServiceWorker(expression),
        manifest,
        openSidePanel,
        restartServiceWorkerForProbe: (probeExpression) =>
          controller.restartServiceWorkerForProbe(probeExpression),
        seedStorage: (values) => controller.seedStorage(values),
        sidePanelUrl: controller.sidePanelUrl,
        waitForServiceWorker: async () => controller.currentWorker(),
      });
    } catch (error) {
      testError = error;
    }

    let gateError: unknown;
    let finishedNormally = false;
    try {
      await settleRuntimeDiagnostics();
      const artifactAfter = await inspectPackagedArtifact(distPath);
      await writeFile(
        resolve(evidenceRoot, 'verified-artifact.json'),
        `${JSON.stringify(
          {
            manifest,
            treeSha256BeforeLaunch: artifactBefore.treeSha256,
            treeSha256AfterTest: artifactAfter.treeSha256,
            unchanged: artifactBefore.treeSha256 === artifactAfter.treeSha256,
          },
          null,
          2
        )}\n`,
        'utf8'
      );
      await testInfo.attach('packaged-artifact-after', {
        body: JSON.stringify(artifactAfter, null, 2),
        contentType: 'application/json',
      });
      assertArtifactUnchanged(artifactBefore, artifactAfter);
      assertNoForbiddenDevArtifacts(artifactAfter);
      const diagnosticsSnapshot = snapshotRuntimeDiagnostics(diagnostics);
      const diagnosticsAccepted = !hasRuntimeDiagnostics(diagnosticsSnapshot);
      if (testError === undefined) {
        await controller.finish({
          artifactAfterSha256: artifactAfter.treeSha256,
          diagnosticsAccepted,
        });
        finishedNormally = true;
      }
      assertNoRuntimeDiagnostics(diagnosticsSnapshot);
    } catch (error) {
      gateError = error;
    } finally {
      const cleanupErrors: unknown[] = [];
      if (hasRuntimeDiagnostics(snapshotRuntimeDiagnostics(diagnostics))) {
        await testInfo
          .attach('runtime-diagnostics', {
            body: JSON.stringify(diagnostics, null, 2),
            contentType: 'application/json',
          })
          .catch((error: unknown) => cleanupErrors.push(error));
      }
      if (!finishedNormally) {
        await controller.abort().catch((error: unknown) => cleanupErrors.push(error));
      }
      if (cleanupErrors.length > 0) {
        const cleanupError = new AggregateError(cleanupErrors, 'Packaged MV3 cleanup failed.');
        gateError =
          gateError === undefined
            ? cleanupError
            : new AggregateError([gateError, cleanupError], 'MV3 gate and cleanup both failed.');
      }
    }

    if (testError !== undefined && gateError !== undefined) {
      throw new AggregateError(
        [testError, gateError],
        'The packaged MV3 test and its mandatory teardown gate both failed.'
      );
    }
    if (testError !== undefined) {
      throw testError;
    }
    if (gateError !== undefined) {
      throw gateError;
    }
  },
});

export { expect };
export type { RuntimeDiagnosticsSnapshot };

export function expectNoRuntimeErrors(diagnostics: RuntimeDiagnosticsSnapshot): void {
  assertNoRuntimeDiagnostics(diagnostics);
}
