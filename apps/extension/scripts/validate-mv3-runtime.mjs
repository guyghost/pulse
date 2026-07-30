#!/usr/bin/env node

import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const extensionDir = resolve(import.meta.dirname, '..', 'dist');
const assetDir = resolve(extensionDir, 'assets');
const userDataDir = await mkdtemp(resolve(tmpdir(), 'pulse-mv3-runtime-'));
let context;

function assert(condition, code) {
  if (!condition) {
    throw new Error(code);
  }
}

try {
  const assets = await readdir(assetDir);
  const workerAsset = assets.find(
    (asset) => asset.startsWith('form-assist.worker-') && asset.endsWith('.js')
  );
  assert(workerAsset, 'FORM_ASSIST_WORKER_ASSET_MISSING');

  context = await chromium.launchPersistentContext(userDataDir, {
    // The bundled Chromium channel is required for sideloaded extensions.
    // Branded Google Chrome ignores --load-extension starting with Chrome 137.
    channel: 'chromium',
    headless: true,
    timeout: 30_000,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 20_000 });
  }
  const extensionId = new URL(serviceWorker.url()).host;
  assert(extensionId.length > 0, 'EXTENSION_ID_MISSING');

  const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());
  assert(manifest.manifest_version === 3, 'MANIFEST_NOT_MV3');
  assert(manifest.background?.service_worker, 'SERVICE_WORKER_NOT_DECLARED');
  assert(
    !manifest.host_permissions?.some((permission) => permission === '<all_urls>'),
    'ALL_URLS_PERMISSION_FORBIDDEN'
  );
  assert(
    manifest.optional_host_permissions?.includes('https://www.linkedin.com/*'),
    'LINKEDIN_NOT_OPTIONAL'
  );

  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  const response = await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`, {
    waitUntil: 'domcontentloaded',
  });
  assert(response?.ok(), 'SIDE_PANEL_LOAD_FAILED');
  await page.locator('body').waitFor({ state: 'visible' });

  const workerResult = await page.evaluate(
    ({ asset }) =>
      new Promise((resolveWorker) => {
        const worker = new Worker(chrome.runtime.getURL(`assets/${asset}`), {
          type: 'module',
          name: 'missionpulse-preproduction-ai-check',
        });
        const timeout = setTimeout(() => {
          worker.terminate();
          resolveWorker({ ok: false, error: 'WORKER_TIMEOUT' });
        }, 90_000);
        worker.onmessage = (event) => {
          clearTimeout(timeout);
          worker.terminate();
          const result = event.data?.result;
          resolveWorker(
            result?.ok
              ? { ok: true, suggestionCount: result.suggestions?.length ?? 0 }
              : { ok: false, error: result?.error ?? 'WORKER_RESPONSE_INVALID' }
          );
        };
        worker.onerror = () => {
          clearTimeout(timeout);
          worker.terminate();
          resolveWorker({ ok: false, error: 'WORKER_LOAD_FAILED' });
        };
        worker.postMessage({
          requestId: crypto.randomUUID(),
          fields: [
            {
              fieldId: 'candidate-title',
              kind: 'text',
              label: 'Titre professionnel',
              value: '',
              autocomplete: null,
            },
          ],
          profile: {
            firstName: 'Test',
            keywords: ['TypeScript'],
            tjmMin: 500,
            tjmMax: 700,
            location: 'Paris',
            remote: 'any',
            seniority: 'senior',
            jobTitle: 'Développeur TypeScript',
            experiences: [],
            availability: null,
          },
        });
      }),
    { asset: workerAsset }
  );

  assert(
    workerResult.ok || workerResult.error === 'AI_UNAVAILABLE',
    'WORKER_OUTPUT_CONTRACT_INVALID'
  );
  assert(consoleErrors.length === 0, 'SIDE_PANEL_CONSOLE_ERRORS');

  console.log(
    JSON.stringify(
      {
        status: workerResult.ok ? 'passed' : 'unavailable_safe',
        chrome: await serviceWorker.evaluate(() => navigator.userAgent),
        manifestVersion: manifest.manifest_version,
        serviceWorker: 'ready',
        sidePanel: 'loaded_without_console_errors',
        aiWorker: workerResult,
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(
    JSON.stringify({
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    })
  );
  process.exitCode = 1;
} finally {
  await context?.close();
  await rm(userDataDir, { recursive: true, force: true });
}
