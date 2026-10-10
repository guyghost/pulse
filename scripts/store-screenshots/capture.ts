/**
 * Raw Chrome Web Store captures of the unpacked MissionPulse side panel.
 *
 * The extension sources, manifest and build config are not modified. Demo
 * missions are the existing parser-regression fixtures, written into a fresh
 * Chrome profile at runtime. Client labels are sanitized in this script only.
 * The captures show the shipped panel with no overlay.
 *
 * Usage (repo root): pnpm store-screenshots
 * Skip the rebuild when dist is already the committed 0.2.5 package:
 *   STORE_SCREENSHOTS_SKIP_BUILD=1 pnpm store-screenshots
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { chromium, type Page } from '@playwright/test';

import { loadDemoCatalogue, serializeMissions } from './demo-missions';
import { attachSidePanel, type PanelDriver } from './panel-driver';

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const EXTENSION_ROOT = resolve(REPO_ROOT, 'apps/extension');
const DIST_PATH = resolve(EXTENSION_ROOT, 'dist');
const OUTPUT_DIR = resolve(REPO_ROOT, 'docs/store-screenshots/0.2.5');
const PANEL_DIR = resolve(OUTPUT_DIR, 'panel');
const EXPECTED_VERSION = '0.2.5';
const WINDOW_WIDTH = 1280;
const WINDOW_HEIGHT = 800;
const PANEL_TARGET_WIDTH = 420;
const DEBUG_PORT = 9333;

const BLOCKED_HOSTS = [
  'www.free-work.com',
  'free-work.com',
  'www.lehibou.com',
  'lehibou.com',
  'hiway-missions.fr',
  'app.cherry-pick.io',
  'www.cherry-pick.io',
  'cherry-pick.io',
  'jhgjtlkfewuiiofxfrvh.supabase.co',
  'ai-gateway.vercel.sh',
  'www.malt.fr',
  'malt.fr',
  'www.collective.work',
  'collective.work',
];

interface ScreenSpec {
  readonly id: string;
  readonly file: string;
  readonly prepare: (panel: PanelDriver) => Promise<void>;
}

function readCommittedVersion(): { packageVersion: string; manifestVersion: string } {
  const packageJson = JSON.parse(readFileSync(resolve(EXTENSION_ROOT, 'package.json'), 'utf8')) as {
    version?: string;
  };
  const manifest = JSON.parse(
    readFileSync(resolve(EXTENSION_ROOT, 'src/manifest.json'), 'utf8')
  ) as { version?: string };
  return {
    packageVersion: packageJson.version ?? '',
    manifestVersion: manifest.version ?? '',
  };
}

function buildExtension(): void {
  if (process.env.STORE_SCREENSHOTS_SKIP_BUILD === '1') {
    return;
  }
  for (const args of [
    ['--filter', '@pulse/ui', 'build'],
    ['--filter', '@pulse/extension', 'build'],
  ]) {
    const result = spawnSync('pnpm', args, { cwd: REPO_ROOT, stdio: 'inherit' });
    if (result.status !== 0) {
      throw new Error(`Extension build failed: pnpm ${args.join(' ')}`);
    }
  }
}

function assertBuiltVersion(): string {
  const built = JSON.parse(readFileSync(resolve(DIST_PATH, 'manifest.json'), 'utf8')) as {
    version?: string;
  };
  if (built.version !== EXPECTED_VERSION) {
    throw new Error(
      `Built manifest version is ${built.version ?? 'missing'}, expected ${EXPECTED_VERSION}.`
    );
  }
  return built.version;
}

function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  const signature = bytes.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') {
    throw new Error(`${path} is not a PNG.`);
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function chromeWindowIds(): string[] {
  const ids = new Set<string>();
  for (const className of ['chrome', 'chromium', 'google-chrome']) {
    const output = spawnSync('xdotool', ['search', '--class', className], { encoding: 'utf8' });
    if (output.status !== 0) {
      continue;
    }
    for (const line of output.stdout.split('\n')) {
      const id = line.trim();
      if (id) {
        ids.add(id);
      }
    }
  }
  return [...ids];
}

interface WindowGeometry {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function windowGeometry(id: string): WindowGeometry {
  const output = run('xwininfo', ['-id', id]);
  const read = (label: string): number => {
    const match = output.match(new RegExp(`${label}:\\s+(-?\\d+)`));
    if (!match) {
      throw new Error(`xwininfo did not report ${label} for ${id}.`);
    }
    return Number(match[1]);
  };
  return {
    id,
    x: read('Absolute upper-left X'),
    y: read('Absolute upper-left Y'),
    width: read('Width'),
    height: read('Height'),
  };
}

function focusWindow(id: string): void {
  spawnSync('xdotool', ['windowactivate', '--sync', id]);
  spawnSync('xdotool', ['windowmove', '--sync', id, '0', '0']);
}

function resizeWindow(id: string, width: number, height: number): WindowGeometry {
  focusWindow(id);
  let geometry = windowGeometry(id);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const nextWidth = width + (width - geometry.width);
    const nextHeight = height + (height - geometry.height);
    run('xdotool', [
      'windowsize',
      '--sync',
      id,
      String(Math.max(200, nextWidth)),
      String(Math.max(200, nextHeight)),
    ]);
    geometry = windowGeometry(id);
    if (geometry.width === width && geometry.height === height) {
      return geometry;
    }
  }
  throw new Error(
    `Chrome window settled at ${geometry.width}x${geometry.height}, expected ${width}x${height}.`
  );
}

function captureWindow(geometry: WindowGeometry, path: string): void {
  run('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'x11grab',
    '-video_size',
    `${geometry.width}x${geometry.height}`,
    '-i',
    `${process.env.DISPLAY ?? ':1'}+${geometry.x},${geometry.y}`,
    '-frames:v',
    '1',
    path,
  ]);
  const size = pngSize(path);
  if (size.width !== WINDOW_WIDTH || size.height !== WINDOW_HEIGHT) {
    throw new Error(
      `${path} is ${size.width}x${size.height}, expected ${WINDOW_WIDTH}x${WINDOW_HEIGHT}.`
    );
  }
}

async function ensureNameHelper(page: Page): Promise<void> {
  await page.evaluate('globalThis.__name = (target) => target');
}

async function settle(panel: PanelDriver): Promise<void> {
  await panel.evaluate<boolean>(`() => document.fonts.status === 'loaded' || true`);
  await new Promise((resolve) => setTimeout(resolve, 450));
}

async function seedExtension(page: Page, missions: unknown[], profile: unknown): Promise<void> {
  await ensureNameHelper(page);
  await page.waitForFunction(
    () =>
      Boolean(
        document.querySelector('[aria-label="Navigation principale"]') ||
        document.body.textContent?.includes('Commencer')
      ),
    { timeout: 30_000 }
  );

  await page.evaluate(async () => {
    await chrome.runtime.sendMessage({ type: 'GET_FEED_MISSIONS' });
  });

  const seeded = await page.evaluate(async (records) => {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    let open: IDBDatabase | null = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const databases = await indexedDB.databases();
      const existing = databases.find((entry) => entry.name === 'missionpulse');
      if (existing && (existing.version ?? 0) >= 5) {
        open = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('missionpulse');
          request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
          request.onsuccess = () => resolve(request.result);
        });
        if (open.objectStoreNames.contains('missions')) {
          break;
        }
        open.close();
        open = null;
      }
      await sleep(250);
    }
    if (!open || !open.objectStoreNames.contains('missions')) {
      throw new Error('missions store is missing');
    }
    await new Promise<void>((resolve, reject) => {
      const tx = open.transaction('missions', 'readwrite');
      const store = tx.objectStore('missions');
      store.clear();
      for (const record of records) {
        store.put(record);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('mission seed failed'));
    });
    open.close();
    return records.length;
  }, missions);
  if (seeded !== missions.length) {
    throw new Error(`Seeded ${seeded} missions, expected ${missions.length}.`);
  }

  // A fresh profile has no connector sync time, so the feed starts a live scan.
  // Hosts are blocked for this capture, and a failed scan replaces the fixture
  // feed with an empty error state. Record one successful local sync per
  // seeded platform so the panel keeps the stored missions.
  await page.evaluate(async () => {
    const open = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('missionpulse');
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
      request.onsuccess = () => resolve(request.result);
    });
    const now = Date.now();
    const statuses = [
      ['free-work', 'Free-Work'],
      ['lehibou', 'LeHibou'],
      ['hiway', 'Hiway'],
      ['cherry-pick', 'Cherry Pick'],
    ].map(([connectorId, connectorName]) => ({
      connectorId,
      connectorName,
      lastState: 'done',
      missionsCount: 1,
      error: null,
      lastSyncAt: now,
      lastSuccessAt: now,
    }));
    await new Promise<void>((resolve, reject) => {
      const tx = open.transaction('connector_status', 'readwrite');
      const store = tx.objectStore('connector_status');
      for (const status of statuses) {
        store.put(status);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('connector status seed failed'));
    });
    open.close();
  });

  const settingsResult = await page.evaluate(async () => {
    const read = (await chrome.runtime.sendMessage({ type: 'GET_SETTINGS_RELEASE' })) as {
      type?: string;
      payload?: {
        status?: string;
        snapshot?: { revision: number; settings: Record<string, unknown> };
      };
    };
    const snapshot = read.payload?.snapshot;
    if (!snapshot) {
      return { ok: false, detail: read };
    }
    const requestId = crypto.randomUUID();
    const mutation = (await chrome.runtime.sendMessage({
      type: 'MUTATE_SETTINGS_RELEASE',
      payload: {
        kind: 'save_settings',
        requestId,
        baseRevision: snapshot.revision,
        settings: {
          ...snapshot.settings,
          theme: 'light',
          autoScan: false,
          notifications: true,
        },
      },
    })) as { payload?: { status?: string; reason?: string } };
    return { ok: mutation.payload?.status === 'settled', detail: mutation.payload ?? mutation };
  });
  if (!settingsResult.ok) {
    throw new Error(`Could not persist light theme: ${JSON.stringify(settingsResult.detail)}`);
  }

  const consent = await page.evaluate(async () => {
    const read = (await chrome.runtime.sendMessage({ type: 'GET_SETTINGS_RELEASE' })) as {
      payload?: { snapshot?: { revision: number; onboardingCompleted?: boolean } };
    };
    const snapshot = read.payload?.snapshot;
    if (!snapshot) {
      return { ok: false, detail: 'no snapshot' };
    }
    if (snapshot.onboardingCompleted) {
      return { ok: true, detail: 'already completed' };
    }
    const mutation = (await chrome.runtime.sendMessage({
      type: 'MUTATE_SETTINGS_RELEASE',
      payload: {
        kind: 'set_consent',
        requestId: crypto.randomUUID(),
        baseRevision: snapshot.revision,
        targetConsent: true,
      },
    })) as { payload?: { status?: string } };
    return { ok: mutation.payload?.status === 'settled', detail: mutation.payload ?? mutation };
  });
  if (!consent.ok) {
    throw new Error(`Could not mark onboarding complete: ${JSON.stringify(consent.detail)}`);
  }

  const profileSaved = await page.evaluate(async (value) => {
    const response = (await chrome.runtime.sendMessage({
      type: 'SAVE_PROFILE',
      payload: value,
    })) as { type?: string; payload?: unknown };
    return response.type === 'PROFILE_RESULT' && response.payload !== null;
  }, profile);
  if (!profileSaved) {
    throw new Error('Profile seed was rejected.');
  }

  await page.evaluate(async () => {
    await chrome.runtime.sendMessage({ type: 'SET_FEED_TOUR_SEEN' });
  });

  await page.waitForFunction(
    async () => {
      const response = (await chrome.runtime.sendMessage({ type: 'GET_FEED_MISSIONS' })) as {
        payload?: Array<{ score?: number | null }>;
      };
      return (
        Array.isArray(response.payload) &&
        response.payload.some((mission) => typeof mission.score === 'number')
      );
    },
    { timeout: 20_000 }
  );

  const stored = await page.evaluate(async () => {
    const response = (await chrome.runtime.sendMessage({ type: 'GET_FEED_MISSIONS' })) as {
      payload?: Array<{ source?: string; title?: string; score?: number | null }>;
    };
    const missions = Array.isArray(response.payload) ? response.payload : [];
    return missions.map(
      (mission) => `${mission.source}:${mission.score ?? 'none'}:${mission.title ?? ''}`
    );
  });
  console.log(`Feed after seed: ${stored.join(' | ') || 'empty'}`);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await ensureNameHelper(page);
  await page.waitForFunction(
    () => {
      const text = document.body?.innerText ?? '';
      return (
        text.includes('Développeur React Senior') ||
        text.includes('Expert Splunk') ||
        text.includes('Tous les connecteurs ont échoué')
      );
    },
    { timeout: 20_000 }
  );
  const visible = await page.evaluate(() =>
    (document.body?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 500)
  );
  console.log(`Seed page after reload: ${visible}`);
  if (
    !visible.includes('Développeur React Senior') &&
    !visible.includes('Expert Splunk') &&
    !visible.includes('Lead Java')
  ) {
    throw new Error('Fixture missions are not visible after reload.');
  }
}

async function openDockedPanel(extensionId: string, seedPage: Page): Promise<PanelDriver> {
  const windowId = await seedPage.evaluate(async () => (await chrome.windows.getCurrent()).id);
  await seedPage.evaluate((id) => {
    const button = document.createElement('button');
    button.id = 'store-open-side-panel';
    button.textContent = 'Ouvrir le panneau';
    button.style.position = 'fixed';
    button.style.zIndex = '2147483647';
    button.style.left = '8px';
    button.style.top = '8px';
    button.addEventListener('click', () => {
      chrome.sidePanel
        .open({ windowId: id })
        .then(() => {
          button.dataset.opened = 'true';
        })
        .catch((error: unknown) => {
          button.dataset.error = error instanceof Error ? error.message : String(error);
        });
    });
    document.body.appendChild(button);
  }, windowId);
  await seedPage.locator('#store-open-side-panel').click();
  await seedPage.waitForFunction(
    () => {
      const button = document.querySelector('#store-open-side-panel');
      return (
        button instanceof HTMLButtonElement &&
        (button.dataset.opened === 'true' || Boolean(button.dataset.error))
      );
    },
    { timeout: 10_000 }
  );
  const openError = await seedPage.locator('#store-open-side-panel').getAttribute('data-error');
  if (openError) {
    throw new Error(`chrome.sidePanel.open failed: ${openError}`);
  }

  const panel = await attachSidePanel(DEBUG_PORT, extensionId);
  await seedPage.close();
  return panel;
}

async function dragDivider(fromX: number, toX: number, y: number): Promise<void> {
  run('xdotool', ['mousemove', '--sync', String(fromX), String(y)]);
  await new Promise((resolve) => setTimeout(resolve, 80));
  run('xdotool', ['mousedown', '1']);
  await new Promise((resolve) => setTimeout(resolve, 80));
  for (let step = 1; step <= 8; step += 1) {
    const x = Math.round(fromX + ((toX - fromX) * step) / 8);
    run('xdotool', ['mousemove', '--sync', String(x), String(y)]);
  }
  run('xdotool', ['mouseup', '1']);
  run('xdotool', ['mousemove', '--sync', '1910', '1190']);
  await new Promise((resolve) => setTimeout(resolve, 200));
}

async function resizeSidePanel(panel: PanelDriver, windowId: string): Promise<number> {
  let current = await panel.innerWidth();
  const geometry = windowGeometry(windowId);
  const y = geometry.y + 160;
  const estimated = geometry.x + geometry.width - current;
  for (const offset of [0, -6, 6, -14, 14, -24, 24]) {
    if (Math.abs(current - PANEL_TARGET_WIDTH) <= 12) {
      break;
    }
    const before = current;
    const dividerX = Math.round(estimated + offset);
    const destinationX = dividerX + (current - PANEL_TARGET_WIDTH);
    await dragDivider(dividerX, destinationX, y);
    current = await panel.innerWidth();
    if (current !== before) {
      console.log(`Side panel divider hit at x=${dividerX}, width ${before} -> ${current}.`);
      break;
    }
  }
  return current;
}

async function dismissOverlays(panel: PanelDriver): Promise<void> {
  const hasClose = await panel.evaluate<boolean>(
    `async () => Boolean(document.querySelector('[aria-label="Fermer l\\'investigation"]'))`
  );
  if (hasClose) {
    await panel.clickNamed("Fermer l'investigation");
    await panel.waitUntilGone('[aria-label="Fermer l\'investigation"]');
  }
  const hasTour = await panel.evaluate<boolean>(
    `async () => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('Passer'))`
  );
  if (hasTour) {
    await panel.clickNamed('Passer');
  }
}

async function prepareFeed(panel: PanelDriver): Promise<void> {
  await dismissOverlays(panel);
  await panel.clickNamed('Missions');
  await panel.waitForText('free-work');
  await dismissOverlays(panel);
  await panel.resetScroll();
  for (const source of ['free-work', 'lehibou', 'hiway', 'cherry-pick']) {
    await panel.waitForText(source);
    const inView = await panel.textInView(source);
    console.log(`Feed source ${source} in view: ${inView}`);
  }
}

async function prepareFeedScrolled(panel: PanelDriver): Promise<void> {
  await prepareFeed(panel);
  const platforms = await panel.scrollFeedToPlatforms(3);
  console.log(`Scrolled feed platforms: ${platforms.join(', ')}`);
}

async function prepareDetail(panel: PanelDriver): Promise<void> {
  await prepareFeed(panel);
  await panel.clickNamed('Afficher les détails');
  await panel.waitForText('Analyser');
  await panel.clickNamed('Analyser');
  await panel.waitForText('Investigation');
  await panel.resetScroll();
  await panel.requireTextInView('Investigation');
}

async function prepareFilters(panel: PanelDriver): Promise<void> {
  await dismissOverlays(panel);
  await panel.clickNamed('Profil');
  await panel.waitForText('Bonjour Alex');
  await panel.resetScroll();
  await panel.waitForText('Remote');
  await panel.requireTextInView('Remote');
  await panel.requireTextInView('TJM');
}

const SHIPPED_SOURCE_NAMES = ['Free-Work', 'LeHibou', 'Hiway', 'Cherry Pick'] as const;

async function alignContainingText(panel: PanelDriver, text: string): Promise<void> {
  const aligned = await panel.evaluate<boolean>(
    `(needle) => {
      const nodes = [...document.querySelectorAll('p, h2, h3, span')];
      const element = nodes.find((node) => {
        if (node.childElementCount > 2) {
          return false;
        }
        return (node.textContent ?? '').trim().includes(needle);
      });
      if (!element) {
        return false;
      }
      let scroller = element.parentElement;
      while (scroller) {
        const style = getComputedStyle(scroller);
        if (/(auto|scroll)/.test(style.overflowY) && scroller.scrollHeight > scroller.clientHeight) {
          const top =
            element.getBoundingClientRect().top -
            scroller.getBoundingClientRect().top +
            scroller.scrollTop;
          scroller.scrollTop = top;
          return true;
        }
        scroller = scroller.parentElement;
      }
      return false;
    }`,
    text
  );
  if (!aligned) {
    throw new Error(`Could not align "${text}" to the top of its scroll container.`);
  }
}

async function prepareSources(panel: PanelDriver): Promise<void> {
  await dismissOverlays(panel);
  await panel.clickNamed('Réglages');
  await panel.waitForText('Sources incluses dans cette version');
  const expanded = await panel.attribute('#settings-trigger-sources', 'aria-expanded');
  if (expanded !== 'true') {
    await panel.clickSelector('#settings-trigger-sources');
    await panel.waitForText('Sources incluses dans cette version');
  }
  for (const name of SHIPPED_SOURCE_NAMES) {
    await panel.waitForText(name);
  }
  const started = Date.now();
  while (Date.now() - started < 12_000) {
    const checking = await panel.evaluate<boolean>(
      `() => (document.querySelector('#settings-panel-sources')?.textContent ?? '').includes('Vérification en cours')`
    );
    if (!checking) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  await alignContainingText(panel, 'Sources incluses dans cette version');
  let missing: string[] = [];
  for (const name of SHIPPED_SOURCE_NAMES) {
    const inView = await panel.textInView(name);
    console.log(`Settings source ${name} in view: ${inView}`);
    if (!inView) {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    await alignContainingText(panel, 'Free-Work');
    missing = [];
    for (const name of SHIPPED_SOURCE_NAMES) {
      const inView = await panel.textInView(name);
      console.log(`Settings source ${name} in view after list align: ${inView}`);
      if (!inView) {
        missing.push(name);
      }
    }
  }
  if (missing.length > 0) {
    throw new Error(`Enabled sources are not fully visible: ${missing.join(', ')}`);
  }
}

async function prepareAlerts(panel: PanelDriver): Promise<void> {
  await dismissOverlays(panel);
  await panel.clickNamed('Réglages');
  await panel.waitForText('Alertes prioritaires');
  await panel.clickSelector('#settings-trigger-alerts');
  await panel.waitForText('Alerte prioritaire');
  await panel.alignToScrollTop('#settings-panel-alerts');
  await panel.requireTextInView('Alerte prioritaire');
  await panel.requireTextInView('Stacks requises');
  await panel.requireTextInView('TJM min');
}

async function preparePrivacy(panel: PanelDriver): Promise<void> {
  await dismissOverlays(panel);
  await panel.clickNamed('Réglages');
  await panel.waitForText('Intelligence artificielle');
  const expanded = await panel.attribute('#settings-trigger-account', 'aria-expanded');
  if (expanded !== 'true') {
    await panel.clickSelector('#settings-trigger-account');
  }
  await panel.waitForText('Dans votre navigateur');
  await panel.alignToScrollTop('#settings-panel-account h3');
  await panel.requireTextInView('Dans votre navigateur');
  await panel.requireTextInView('Gemini Nano');
}

const SCREENS: ScreenSpec[] = [
  { id: '01-feed', file: '01-feed.png', prepare: prepareFeed },
  { id: '01b-feed-scrolled', file: '01b-feed-scrolled.png', prepare: prepareFeedScrolled },
  { id: '02-mission-detail', file: '02-mission-detail.png', prepare: prepareDetail },
  { id: '03-filters-settings', file: '03-filters-settings.png', prepare: prepareFilters },
  { id: '03b-sources', file: '03b-sources.png', prepare: prepareSources },
  { id: '04-alerts', file: '04-alerts.png', prepare: prepareAlerts },
  { id: '05-local-privacy', file: '05-local-privacy.png', prepare: preparePrivacy },
];

async function main(): Promise<void> {
  const committed = readCommittedVersion();
  if (
    committed.packageVersion !== EXPECTED_VERSION ||
    committed.manifestVersion !== EXPECTED_VERSION
  ) {
    throw new Error(
      `Committed version is package ${committed.packageVersion} / manifest ${committed.manifestVersion}, expected ${EXPECTED_VERSION}.`
    );
  }
  console.log(
    `Committed version ${committed.manifestVersion} (package ${committed.packageVersion}).`
  );

  buildExtension();
  const builtVersion = assertBuiltVersion();
  console.log(`Built unpacked extension ${builtVersion} at ${DIST_PATH}.`);

  const catalogue = loadDemoCatalogue();
  console.log(
    `Demo missions: ${catalogue.missions.map((mission) => `${mission.source}:${mission.title}`).join(' | ')}`
  );
  console.log(`Demo data audit: ${JSON.stringify(catalogue.audit, null, 2)}`);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(PANEL_DIR, { recursive: true });

  const profileDir = mkdtempSync(resolve(tmpdir(), 'missionpulse-store-'));
  const windowsBefore = new Set(chromeWindowIds());
  const hostRules = BLOCKED_HOSTS.map((host) => `MAP ${host} 127.0.0.1`).join(', ');
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: null,
    colorScheme: 'light',
    locale: 'fr-FR',
    ignoreDefaultArgs: ['--enable-automation', '--disable-extensions'],
    args: [
      `--disable-extensions-except=${DIST_PATH}`,
      `--load-extension=${DIST_PATH}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-popup-blocking',
      '--hide-crash-restore-bubble',
      '--disable-infobars',
      '--force-device-scale-factor=1',
      '--ozone-platform=x11',
      '--window-size=1280,800',
      '--window-position=0,0',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--host-resolver-rules=${hostRules}`,
    ],
  });
  await context.addInitScript('globalThis.__name = (target) => target;');

  let windowId = '';
  let panel: PanelDriver | undefined;
  try {
    const seedPage = context.pages()[0] ?? (await context.newPage());
    await seedPage.goto('about:blank');
    let worker = context.serviceWorkers()[0];
    if (!worker) {
      worker = await context.waitForEvent('serviceworker', { timeout: 30_000 });
    }
    const extensionId = new URL(worker.url()).host;
    console.log(`Extension id ${extensionId}.`);

    const extensionPage = await context.newPage();
    await extensionPage.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
    await seedExtension(extensionPage, serializeMissions(catalogue.missions), catalogue.profile);

    panel = await openDockedPanel(extensionId, extensionPage);

    const created = chromeWindowIds().filter((id) => !windowsBefore.has(id));
    windowId = created[created.length - 1] ?? chromeWindowIds().at(-1) ?? '';
    if (!windowId) {
      throw new Error('Could not find the Chrome window.');
    }
    const geometry = resizeWindow(windowId, WINDOW_WIDTH, WINDOW_HEIGHT);
    const panelWidth = await resizeSidePanel(panel, windowId);
    console.log(`Side panel width ${panelWidth}px (target ~${PANEL_TARGET_WIDTH}).`);
    resizeWindow(windowId, WINDOW_WIDTH, WINDOW_HEIGHT);
    run('xdotool', ['mousemove', '--sync', '1910', '1190']);

    const dark = await panel.isDark();
    const pixelRatio = await panel.devicePixelRatio();
    if (dark || pixelRatio !== 1) {
      throw new Error(
        `Expected light theme at 100% zoom, observed dark=${dark} dpr=${pixelRatio}.`
      );
    }

    for (const screen of SCREENS) {
      await screen.prepare(panel);
      await settle(panel);
      if (screen.id === '02-mission-detail') {
        const drawerOpen = await panel.evaluate<boolean>(
          `() => Boolean(document.querySelector('[aria-label="Investigation mission"]'))`
        );
        if (!drawerOpen) {
          await panel.clickNamed('Analyser');
          await panel.waitForText('Investigation');
        }
      }
      const overlay = await panel.evaluate<boolean>(
        `() => Boolean(document.querySelector('[data-store-exemple], .score-flow__example-badge'))`
      );
      if (overlay) {
        throw new Error(`${screen.id} contains a capture overlay inside the panel.`);
      }
      if (screen.id === '02-mission-detail') {
        await panel.pause();
      }
      const panelPath = resolve(PANEL_DIR, screen.file);
      const windowPath = resolve(OUTPUT_DIR, screen.file);
      try {
        await panel.screenshot(panelPath);
        const freshGeometry = windowGeometry(windowId);
        if (freshGeometry.width !== WINDOW_WIDTH || freshGeometry.height !== WINDOW_HEIGHT) {
          resizeWindow(windowId, WINDOW_WIDTH, WINDOW_HEIGHT);
        }
        captureWindow(windowGeometry(windowId), windowPath);
      } finally {
        if (screen.id === '02-mission-detail') {
          await panel.resume();
        }
      }
      const panelSize = pngSize(panelPath);
      if (panelSize.width !== panelWidth && Math.abs(panelSize.width - panelWidth) > 2) {
        console.log(
          `${screen.id} panel crop is ${panelSize.width}x${panelSize.height} (viewport ${panelWidth}).`
        );
      }
      console.log(`Captured ${screen.id}: window ${windowPath}, panel ${panelPath}.`);
    }

    console.log(`Profile discarded after capture: ${profileDir}`);
  } finally {
    panel?.close();
    await context.close().catch(() => undefined);
    rmSync(profileDir, { recursive: true, force: true });
  }

  const report = SCREENS.map((screen) => {
    const windowPath = resolve(OUTPUT_DIR, screen.file);
    const panelPath = resolve(PANEL_DIR, screen.file);
    return {
      id: screen.id,
      version: builtVersion,
      window: { path: windowPath, ...pngSize(windowPath) },
      panel: { path: panelPath, ...pngSize(panelPath) },
    };
  });
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
