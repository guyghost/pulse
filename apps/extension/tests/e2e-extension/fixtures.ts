import {
  chromium,
  expect,
  test as base,
  type BrowserContext,
  type ConsoleMessage,
  type Page,
  type Worker,
} from '@playwright/test';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
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
  snapshotRuntimeDiagnostics,
  type RuntimeDiagnosticsSnapshot,
} from '../mv3/diagnostics';
import { assertPackagedManifestPermissionContract } from '../mv3/manifest-contract';
import {
  ServiceWorkerBootstrapObserver,
  waitForBrowserCdpWebSocket,
} from '../mv3/service-worker-bootstrap';

const extensionRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const distPath = resolve(extensionRoot, 'dist');
const artifactRoot = resolve(extensionRoot, '../../output/playwright');
const profileRoot = resolve(artifactRoot, 'extension-profiles');
const evidenceRoot = resolve(artifactRoot, 'mv3-evidence');
const serviceWorkerTimeoutMs = 20_000;
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
  context: BrowserContext;
  readonly diagnostics: RuntimeDiagnosticsSnapshot;
  extensionId: string;
  manifest: PackagedManifest;
  sidePanelUrl: string;
  openSidePanel: () => Promise<Page>;
  restartServiceWorkerForProbe: (probeExpression?: string) => Promise<Worker>;
  seedStorage: (values: Record<string, unknown>) => Promise<void>;
  waitForServiceWorker: (wakePage?: Page) => Promise<Worker>;
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

function isExtensionWorker(worker: Worker, extensionId?: string): boolean {
  try {
    const url = new URL(worker.url());
    return (
      url.protocol === 'chrome-extension:' &&
      (extensionId === undefined || url.hostname === extensionId)
    );
  } catch {
    return false;
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
    const sidePanelPath = manifest.side_panel?.default_path;
    if (!sidePanelPath) {
      throw new Error('Packaged manifest does not declare side_panel.default_path.');
    }

    await mkdir(evidenceRoot, { recursive: true });
    await writeFile(
      resolve(evidenceRoot, 'tested-artifact.json'),
      `${JSON.stringify({ artifact: artifactBefore, manifest }, null, 2)}\n`,
      'utf8'
    );

    await mkdir(profileRoot, { recursive: true });
    const userDataDir = await mkdtemp(join(profileRoot, `worker-${testInfo.workerIndex}-`));
    const diagnostics = createRuntimeDiagnostics();

    const context = await chromium
      .launchPersistentContext(userDataDir, {
        channel: 'chromium',
        headless: process.env.PLAYWRIGHT_EXTENSION_HEADLESS !== 'false',
        viewport: { width: 420, height: 900 },
        serviceWorkers: 'allow',
        args: [
          `--disable-extensions-except=${distPath}`,
          `--load-extension=${distPath}`,
          '--remote-debugging-port=0',
          '--no-default-browser-check',
          '--no-first-run',
        ],
      })
      .catch(async (error: unknown) => {
        try {
          await rm(userDataDir, {
            force: true,
            recursive: true,
            maxRetries: 3,
            retryDelay: 100,
          });
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            'Packaged MV3 browser launch and profile cleanup both failed.'
          );
        }
        throw error;
      });
    const setup = await (async () => {
      let observer: ServiceWorkerBootstrapObserver | undefined;
      try {
        const browserCdpWebSocket = await waitForBrowserCdpWebSocket(userDataDir);
        const instrumentedPages = new WeakSet<Page>();
        const instrumentedWorkers = new WeakSet<Worker>();

        const instrumentPage = (page: Page): void => {
          if (instrumentedPages.has(page)) {
            return;
          }
          instrumentedPages.add(page);
          page.on('pageerror', (error) =>
            recordPageError(diagnostics, error.stack ?? error.message)
          );
          page.on('console', (message) => {
            recordConsoleDiagnostic(
              diagnostics,
              'page',
              message.type(),
              formatConsoleMessage(message)
            );
          });
        };

        const instrumentWorker = (worker: Worker): void => {
          if (instrumentedWorkers.has(worker)) {
            return;
          }
          instrumentedWorkers.add(worker);
          worker.on('console', (message) => {
            recordConsoleDiagnostic(
              diagnostics,
              'service_worker',
              message.type(),
              formatConsoleMessage(message)
            );
          });
        };

        context.on('page', instrumentPage);
        context.on('serviceworker', instrumentWorker);
        context.pages().forEach(instrumentPage);
        context.serviceWorkers().forEach(instrumentWorker);

        const firstWorker =
          context.serviceWorkers().find((worker) => isExtensionWorker(worker)) ??
          (await context.waitForEvent('serviceworker', {
            predicate: (worker) => isExtensionWorker(worker),
            timeout: serviceWorkerTimeoutMs,
          }));
        instrumentWorker(firstWorker);

        const extensionId = new URL(firstWorker.url()).hostname;
        const normalizedSidePanelPath = sidePanelPath.replace(/^\/+/, '');
        const sidePanelUrl = `chrome-extension://${extensionId}/${normalizedSidePanelPath}`;
        const controlPage =
          context.pages().find((page) => page.url() === 'about:blank') ?? (await context.newPage());

        observer = new ServiceWorkerBootstrapObserver({
          context,
          controlPage,
          diagnostics,
          extensionId,
          instrumentWorker,
          webSocketUrl: browserCdpWebSocket,
        });
        await observer.start();
        const currentWorker = await observer.restart(firstWorker);
        instrumentWorker(currentWorker);

        for (const page of context.pages()) {
          if (page !== controlPage && page.url() === 'about:blank') {
            await page.close();
          }
        }

        return {
          bootstrapObserver: observer,
          currentWorker,
          extensionId,
          instrumentPage,
          instrumentWorker,
          sidePanelUrl,
        };
      } catch (error) {
        const cleanupErrors: unknown[] = [];
        await observer?.stop().catch((cleanupError: unknown) => cleanupErrors.push(cleanupError));
        await context.close().catch((cleanupError: unknown) => cleanupErrors.push(cleanupError));
        await rm(userDataDir, {
          force: true,
          recursive: true,
          maxRetries: 3,
          retryDelay: 100,
        }).catch((cleanupError: unknown) => cleanupErrors.push(cleanupError));
        if (cleanupErrors.length > 0) {
          throw new AggregateError(
            [error, ...cleanupErrors],
            'Packaged MV3 fixture setup and its cleanup both failed.'
          );
        }
        throw error;
      }
    })();
    const { bootstrapObserver, extensionId, instrumentPage, instrumentWorker, sidePanelUrl } =
      setup;
    let currentWorker = setup.currentWorker;

    const waitForServiceWorker = async (wakePage?: Page): Promise<Worker> => {
      if (context.serviceWorkers().includes(currentWorker)) {
        instrumentWorker(currentWorker);
        return currentWorker;
      }
      const activeWorker = context
        .serviceWorkers()
        .find((worker) => isExtensionWorker(worker, extensionId));
      if (activeWorker) {
        instrumentWorker(activeWorker);
        currentWorker = activeWorker;
        return activeWorker;
      }

      const workerPromise = context.waitForEvent('serviceworker', {
        predicate: (worker) => isExtensionWorker(worker, extensionId),
        timeout: serviceWorkerTimeoutMs,
      });
      const extensionPage =
        wakePage ??
        context.pages().find((page) => page.url().startsWith(`chrome-extension://${extensionId}/`));
      if (!extensionPage) {
        throw new Error('Cannot wake the packaged service worker without an extension page.');
      }

      await extensionPage.evaluate(async () => {
        await chrome.runtime.sendMessage({ type: 'GET_PREMIUM_STATUS' });
      });
      const worker = await workerPromise;
      instrumentWorker(worker);
      currentWorker = worker;
      return worker;
    };

    const restartServiceWorkerForProbe = async (probeExpression?: string): Promise<Worker> => {
      currentWorker = await bootstrapObserver.restart(
        await waitForServiceWorker(),
        probeExpression
      );
      return currentWorker;
    };

    const openSidePanel = async (): Promise<Page> => {
      // Headless Chromium does not expose Chrome's side-panel chrome itself.
      // Loading the manifest's exact built default_path exercises the same
      // packaged extension document without involving Vite or DEV stubs.
      const page = await context.newPage();
      instrumentPage(page);
      await page.goto(sidePanelUrl, { waitUntil: 'domcontentloaded' });
      return page;
    };

    const seedStorage = async (values: Record<string, unknown>): Promise<void> => {
      const worker = await waitForServiceWorker();
      await worker.evaluate(async (entries) => {
        await chrome.storage.local.set(entries);
      }, values);
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
        context,
        get diagnostics() {
          return snapshotRuntimeDiagnostics(diagnostics);
        },
        extensionId,
        manifest,
        openSidePanel,
        restartServiceWorkerForProbe,
        seedStorage,
        sidePanelUrl,
        waitForServiceWorker,
      });
    } catch (error) {
      testError = error;
    }

    let gateError: unknown;
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
      assertNoRuntimeDiagnostics(diagnostics);
    } catch (error) {
      gateError = error;
    } finally {
      const cleanupErrors: unknown[] = [];
      if (hasRuntimeDiagnostics(diagnostics)) {
        await testInfo
          .attach('runtime-diagnostics', {
            body: JSON.stringify(diagnostics, null, 2),
            contentType: 'application/json',
          })
          .catch((cleanupError: unknown) => cleanupErrors.push(cleanupError));
      }
      await bootstrapObserver
        .stop()
        .catch((cleanupError: unknown) => cleanupErrors.push(cleanupError));
      await context.close().catch((cleanupError: unknown) => cleanupErrors.push(cleanupError));
      await rm(userDataDir, {
        force: true,
        recursive: true,
        maxRetries: 3,
        retryDelay: 100,
      }).catch((cleanupError: unknown) => cleanupErrors.push(cleanupError));
      if (cleanupErrors.length > 0) {
        const cleanupError = new AggregateError(
          cleanupErrors,
          'Packaged MV3 fixture cleanup failed.'
        );
        gateError =
          gateError === undefined
            ? cleanupError
            : new AggregateError(
                [gateError, cleanupError],
                'Packaged MV3 gate and cleanup both failed.'
              );
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
