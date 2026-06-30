#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const VITE_BIN = resolve(ROOT, 'node_modules/.bin/vite');

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith('--'))
    .map((arg) => {
      const [key, value] = arg.slice(2).split('=');
      return [key, value ?? 'true'];
    })
);

const budgetMs = Number(args.get('budget') ?? 50);
const iterations = Number(args.get('iterations') ?? 20);
const warmups = Number(args.get('warmups') ?? 5);
const skipBuild = args.get('skip-build') === 'true';
const outDir = resolve(ROOT, args.get('out-dir') ?? 'reports/performance');
const runLabel = args.get('label') ?? 'local';
const only = new Set(
  (args.get('only') ?? 'extension,landing,dashboard')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

const ports = {
  extension: 4176,
  landing: 5173,
  dashboard: 5174,
};

const servers = [
  {
    id: 'extension',
    cwd: resolve(ROOT, 'apps/extension'),
    url: `http://127.0.0.1:${ports.extension}/src/sidepanel/index.html`,
    env: {},
  },
  {
    id: 'landing',
    cwd: resolve(ROOT, 'apps/landing'),
    url: `http://127.0.0.1:${ports.landing}/`,
    env: {
      MISSIONPULSE_PERF_CACHE_HTML: '1',
      PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      PUBLIC_SUPABASE_ANON_KEY: 'perf-local-anon-key',
    },
  },
  {
    id: 'dashboard',
    cwd: resolve(ROOT, 'apps/dashboard'),
    url: `http://127.0.0.1:${ports.dashboard}/dashboard/`,
    env: {
      MISSIONPULSE_PERF_CACHE_HTML: '1',
      PUBLIC_SUPABASE_URL: '',
      PUBLIC_SUPABASE_ANON_KEY: '',
      PUBLIC_DASHBOARD_BASE_PATH: '/dashboard',
    },
  },
].filter((server) => only.has(server.id));

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveBrowserExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

const defaultProfile = {
  firstName: 'Alice',
  stack: ['TypeScript', 'Svelte', 'Node.js', 'React'],
  tjmMin: 550,
  tjmMax: 750,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  jobTitle: 'Developpeur Fullstack',
  searchKeywords: ['Svelte', 'TypeScript'],
};

const defaultSettings = {
  scanIntervalMinutes: 60,
  enabledConnectors: ['free-work', 'lehibou', 'hiway', 'collective', 'cherry-pick'],
  notifications: true,
  autoScan: false,
  maxSemanticPerScan: 10,
  notificationScoreThreshold: 80,
  respectRateLimits: true,
  customDelayMs: 1000,
  theme: 'light',
};

function makeMission(index) {
  const now = '2026-06-29T08:00:00.000Z';
  const stacks = [
    ['Svelte', 'TypeScript', 'Node.js'],
    ['React', 'TypeScript', 'PostgreSQL'],
    ['Vue.js', 'TypeScript', 'Python'],
    ['Node.js', 'AWS', 'Terraform'],
  ];
  return {
    id: `perf-${index}`,
    title: `Mission TypeScript ${index}`,
    client: index % 3 === 0 ? 'MissionPulse Lab' : 'Client digital',
    description: 'Mission de transformation produit avec stack moderne et equipe autonome.',
    stack: stacks[index % stacks.length],
    tjm: 500 + (index % 8) * 35,
    location: index % 2 === 0 ? 'Paris' : 'Remote',
    remote: index % 2 === 0 ? 'hybrid' : 'full',
    duration: '6 mois',
    startDate: null,
    publishedAt: now,
    url: `https://example.com/missions/${index}`,
    source: 'free-work',
    scrapedAt: now,
    seniority: index % 3 === 0 ? 'senior' : 'confirmed',
    scoreBreakdown: null,
    score: 72 + (index % 24),
    semanticScore: null,
    semanticReason: null,
  };
}

const extensionMissions = Array.from({ length: 80 }, (_, index) => makeMission(index));
const extensionTrackings = extensionMissions.slice(0, 8).map((mission, index) => ({
  missionId: mission.id,
  currentStatus:
    index % 4 === 0
      ? 'applied'
      : index % 4 === 1
        ? 'application_prepared'
        : index % 4 === 2
          ? 'selected'
          : 'detected',
  history: [
    {
      from: null,
      to: 'detected',
      timestamp: Date.parse('2026-06-29T08:00:00.000Z') + index * 1000,
      note: null,
    },
  ],
  generatedAssetIds: [],
  userRating: index % 5 === 0 ? 4 : null,
  notes: '',
  nextActionAt: null,
}));

const extensionTjmAnalysis = {
  trend: 'up',
  confidence: 0.82,
  dataPoints: 24,
  junior: { min: 350, max: 480, median: 420 },
  confirmed: { min: 500, max: 680, median: 590 },
  senior: { min: 650, max: 850, median: 740 },
  trendDetail: 'Les missions TypeScript senior restent au-dessus de la fourchette cible.',
  recommendation: 'Conserver une fourchette haute sur les missions Svelte et TypeScript.',
  lastUpdated: '2026-06-29',
  topStacks: [
    { stack: 'Svelte', average: 720, trend: 'up', sampleCount: 8, lastUpdated: '2026-06-29' },
    { stack: 'TypeScript', average: 690, trend: 'stable', sampleCount: 12, lastUpdated: '2026-06-29' },
  ],
  regionInsights: [
    {
      region: 'ile-de-france',
      label: 'Ile-de-France',
      average: 710,
      min: 590,
      max: 850,
      sampleCount: 14,
      trend: 'up',
    },
    {
      region: 'remote',
      label: 'Remote',
      average: 660,
      min: 540,
      max: 780,
      sampleCount: 10,
      trend: 'stable',
    },
  ],
};

function run(command, commandArgs, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd ?? ROOT,
      env: { ...process.env, ...options.env },
      stdio: options.stdio ?? 'inherit',
    });

    child.on('error', rejectRun);
    child.on('exit', (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(new Error(`${command} ${commandArgs.join(' ')} exited with ${code}`));
    });
  });
}

async function buildApps() {
  for (const server of servers) {
    await run(VITE_BIN, ['build'], {
      cwd: server.cwd,
      env: { NODE_OPTIONS: '--disable-warning=DEP0205', ...server.env },
    });
  }
}

function startServer(server) {
  const child = spawn(
    VITE_BIN,
    [
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(ports[server.id]),
      '--strictPort',
    ],
    {
      cwd: server.cwd,
      env: {
        ...process.env,
        ...server.env,
        HOST: '127.0.0.1',
        PORT: String(ports[server.id]),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  child.stdout.on('data', (chunk) => process.stdout.write(`[${server.id}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${server.id}] ${chunk}`));
  return child;
}

async function waitForServer(url, timeoutMs = 30_000) {
  const started = performance.now();
  let lastError = null;
  while (performance.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status < 500) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

function installExtensionChromeStub(context, options = {}) {
  const payload = {
    onboardingCompleted: options.onboardingCompleted ?? true,
    firstScanDone: options.firstScanDone ?? true,
    premium: options.premium ?? true,
    profile: options.profile === undefined ? defaultProfile : options.profile,
    missions: extensionMissions,
    trackings: extensionTrackings,
    settings: defaultSettings,
    tjmAnalysis: extensionTjmAnalysis,
  };
  payload.forceOnboardingShell =
    payload.onboardingCompleted === false &&
    payload.firstScanDone === false &&
    payload.profile === null;

  return context.addInitScript((state) => {
    const listeners = [];
    const storage = new Map();

    const emit = (message) => {
      for (const listener of listeners) {
        listener(message, { id: 'perf-harness' }, () => {});
      }
    };

    const saveRecord = (key, value) => {
      storage.set(key, value);
      return value;
    };

    const sendMessage = async (message) => {
      switch (message?.type) {
        case 'GET_PREMIUM_STATUS':
          return { type: 'PREMIUM_STATUS_RESULT', payload: state.premium };
        case 'SET_PREMIUM':
          state.premium = message.payload === true;
          return { type: 'PREMIUM_SET', payload: { saved: true } };
        case 'GET_PROFILE':
          return { type: 'PROFILE_RESULT', payload: state.profile };
        case 'SAVE_PROFILE':
          state.profile = message.payload;
          emit({ type: 'PROFILE_UPDATED', payload: state.profile });
          return { type: 'PROFILE_RESULT', payload: state.profile };
        case 'GET_SETTINGS':
          return { type: 'SETTINGS_RESULT', payload: state.settings };
        case 'SAVE_SETTINGS':
          state.settings = message.payload;
          emit({ type: 'SETTINGS_UPDATED', payload: state.settings });
          return { type: 'SETTINGS_SAVED', payload: { saved: true, settings: state.settings } };
        case 'GET_FIRST_SCAN_DONE':
          return { type: 'FIRST_SCAN_DONE_RESULT', payload: state.firstScanDone };
        case 'GET_ONBOARDING_COMPLETED':
          return { type: 'ONBOARDING_COMPLETED_RESULT', payload: state.onboardingCompleted };
        case 'SET_ONBOARDING_COMPLETED':
          state.onboardingCompleted = true;
          return { type: 'ONBOARDING_COMPLETED_SET', payload: { saved: true } };
        case 'CLEAR_ONBOARDING_COMPLETED':
          state.onboardingCompleted = false;
          return { type: 'ONBOARDING_COMPLETED_CLEARED', payload: { cleared: true } };
        case 'GET_PROFILE_BANNER_DISMISSED':
        case 'GET_FEED_TOUR_SEEN':
          return { type: message.type.replace('GET_', '').replace(/$/, '_RESULT'), payload: true };
        case 'SET_PROFILE_BANNER_DISMISSED':
          return { type: 'PROFILE_BANNER_DISMISSED_SET', payload: { saved: true } };
        case 'SET_FEED_TOUR_SEEN':
          return { type: 'FEED_TOUR_SEEN_SET', payload: { saved: true } };
        case 'CLEAR_FEED_TOUR_SEEN':
          return { type: 'FEED_TOUR_SEEN_CLEARED', payload: { cleared: true } };
        case 'GET_FEED_MISSIONS':
          return { type: 'FEED_MISSIONS_RESULT', payload: state.missions };
        case 'GET_FEED_FAVORITES':
          return { type: 'FEED_FAVORITES_RESULT', payload: {} };
        case 'SAVE_FEED_FAVORITES':
          saveRecord('favorites', message.payload);
          return { type: 'FEED_FAVORITES_SAVED', payload: { saved: true } };
        case 'GET_FEED_HIDDEN':
          return { type: 'FEED_HIDDEN_RESULT', payload: {} };
        case 'SAVE_FEED_HIDDEN':
          saveRecord('hidden', message.payload);
          return { type: 'FEED_HIDDEN_SAVED', payload: { saved: true } };
        case 'GET_FEED_SORT':
          return { type: 'FEED_SORT_RESULT', payload: 'score' };
        case 'SAVE_FEED_SORT':
          return { type: 'FEED_SORT_SAVED', payload: { saved: true } };
        case 'GET_FEED_SAVED_VIEWS':
          return { type: 'FEED_SAVED_VIEWS_RESULT', payload: [] };
        case 'SAVE_FEED_SAVED_VIEWS':
          return { type: 'FEED_SAVED_VIEWS_SAVED', payload: { saved: true } };
        case 'GET_SEEN_MISSIONS':
          return { type: 'SEEN_MISSIONS_RESULT', payload: [] };
        case 'SAVE_SEEN_MISSIONS':
          return { type: 'SEEN_MISSIONS_SAVED', payload: { saved: true } };
        case 'GET_PERSISTED_CONNECTOR_STATUSES':
          return { type: 'PERSISTED_CONNECTOR_STATUSES_RESULT', payload: [] };
        case 'GET_CONNECTOR_HEALTH':
          return { type: 'CONNECTOR_HEALTH_RESULT', payload: [] };
        case 'RECHECK_CONNECTOR_HEALTH':
          return { type: 'CONNECTOR_HEALTH_UPDATED', payload: null };
        case 'GET_CONNECTED_ALERT_PREFERENCES':
          return { type: 'CONNECTED_ALERT_PREFERENCES_RESULT', payload: null };
        case 'SAVE_CONNECTED_ALERT_PREFERENCES':
          return { type: 'CONNECTED_ALERT_PREFERENCES_SAVED', payload: { saved: true } };
        case 'GET_ALERT_HISTORY':
          return { type: 'ALERT_HISTORY_RESULT', payload: [] };
        case 'GET_TJM_ANALYSIS':
          return { type: 'TJM_ANALYSIS_RESULT', payload: { analysis: state.tjmAnalysis } };
        case 'GET_TRACKINGS':
          return {
            type: 'TRACKINGS_RESULT',
            payload: message.payload?.status
              ? state.trackings.filter((item) => item.currentStatus === message.payload.status)
              : state.trackings,
          };
        case 'UPDATE_TRACKING':
        case 'UPDATE_TRACKING_DETAILS':
          return {
            type: 'TRACKING_UPDATED',
            payload: state.trackings[0] ?? {
              missionId: message.payload?.missionId ?? 'perf-0',
              currentStatus: 'detected',
              history: [],
              generatedAssetIds: [],
              userRating: null,
              notes: '',
              nextActionAt: null,
            },
          };
        case 'RESTORE_TRACKING':
          return { type: 'TRACKING_RESTORED', payload: message.payload?.tracking ?? null };
        case 'GET_GENERATED_ASSETS':
          return { type: 'GENERATED_ASSETS_RESULT', payload: [] };
        case 'GENERATE_ASSET':
          return {
            type: 'GENERATION_RESULT',
            payload: { ok: false, error: 'PERF_HARNESS_DISABLED' },
          };
        case 'SCAN_START':
          return { type: 'SCAN_COMPLETE', payload: state.missions };
        case 'RESET_NEW_MISSION_COUNT':
          return { type: 'NEW_MISSION_COUNT_RESET', payload: { reset: true } };
        case 'CLEAR_EXTENSION_BADGE':
          return { type: 'EXTENSION_BADGE_CLEARED', payload: { cleared: true } };
        case 'OPEN_EXTERNAL_URL':
          return { type: 'EXTERNAL_URL_OPENED', payload: { opened: true } };
        case 'SHOW_TOAST':
          return { type: 'TOAST_SHOWN' };
        case 'PREVIEW_LINKEDIN_PROFILE':
        case 'IMPORT_LINKEDIN_PROFILE':
          return {
            type:
              message.type === 'PREVIEW_LINKEDIN_PROFILE'
                ? 'LINKEDIN_PROFILE_PREVIEWED'
                : 'LINKEDIN_PROFILE_IMPORTED',
            payload: { extracted: false, imported: false, errorCode: 'PERF', errorMessage: 'Disabled' },
          };
        case 'VERIFY_PROFILE_PAGE':
          return {
            type: 'PROFILE_PAGE_VERIFIED',
            payload: { ok: false, reachable: false, matchedFields: [], missingFields: [] },
          };
        default:
          return { type: 'PERF_HARNESS_NOOP', payload: null };
      }
    };

    const chromeStub = window.chrome && typeof window.chrome === 'object' ? window.chrome : {};
    chromeStub.runtime = {
      id: 'perf-harness',
      sendMessage,
      getURL: (path) => path,
      onMessage: {
        addListener(listener) {
          listeners.push(listener);
        },
        removeListener(listener) {
          const index = listeners.indexOf(listener);
          if (index >= 0) listeners.splice(index, 1);
        },
      },
    };
    chromeStub.storage = {
      local: {
        get: async () => ({}),
        set: async () => undefined,
        remove: async () => undefined,
      },
    };
    chromeStub.tabs = {
      create: async () => undefined,
      query: async () => [],
    };

    try {
      Object.defineProperty(window, 'chrome', {
        configurable: true,
        value: chromeStub,
      });
      Object.defineProperty(window, '__missionPulsePerfForceOnboardingShell', {
        configurable: true,
        value: state.forceOnboardingShell,
      });
    } catch {
      window.chrome = chromeStub;
      window.__missionPulsePerfForceOnboardingShell = state.forceOnboardingShell;
    }
  }, payload);
}

async function ready(locator) {
  await locator.waitFor({ state: 'visible', timeout: 10_000 });
}

async function readyAttached(locator) {
  await locator.waitFor({ state: 'attached', timeout: 10_000 });
}

async function visibleTimestamp(page, selector) {
  const handle = await page.waitForFunction(
    (targetSelector) => {
      const element = document.querySelector(targetSelector);
      if (!element) return false;

      const style = window.getComputedStyle(element);
      const box = element.getBoundingClientRect();
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        box.width <= 0 ||
        box.height <= 0
      ) {
        return false;
      }

      return performance.now();
    },
    selector,
    { timeout: 10_000 }
  );

  return Number(await handle.jsonValue());
}

async function attachedTimestamp(page, selector) {
  const immediate = await page.evaluate((targetSelector) => {
    return document.querySelector(targetSelector) ? performance.now() : null;
  }, selector);

  if (typeof immediate === 'number') {
    return immediate;
  }

  const handle = await page.waitForFunction(
    (targetSelector) => (document.querySelector(targetSelector) ? performance.now() : false),
    selector,
    { timeout: 10_000 }
  );

  return Number(await handle.jsonValue());
}

async function activePageTimestamp(page, selector) {
  const immediate = await page.evaluate((targetSelector) => {
    const element = document.querySelector(targetSelector);
    if (
      element &&
      element.getAttribute('aria-hidden') !== 'true' &&
      !element.hasAttribute('inert')
    ) {
      return performance.now();
    }
    return null;
  }, selector);

  if (typeof immediate === 'number') {
    return immediate;
  }

  const handle = await page.waitForFunction(
    (targetSelector) => {
      const element = document.querySelector(targetSelector);
      if (
        element &&
        element.getAttribute('aria-hidden') !== 'true' &&
        !element.hasAttribute('inert')
      ) {
        return performance.now();
      }
      return false;
    },
    selector,
    { timeout: 10_000 }
  );

  return Number(await handle.jsonValue());
}

function documentShellDuration(page) {
  return page.evaluate(() => window.__missionPulseDocumentShellReady ?? performance.now());
}

function extensionStaticShellDuration(page) {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    return navigation?.responseStart ?? window.__missionPulseInitialShellReady ?? performance.now();
  });
}

function responseStartDuration(page) {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    return navigation?.responseStart ?? performance.now();
  });
}

function webPages() {
  const landingBase = `http://127.0.0.1:${ports.landing}`;
  const dashboardBase = `http://127.0.0.1:${ports.dashboard}`;
  const pages = [];

  if (only.has('landing')) {
    pages.push(
      {
        id: 'landing.home',
        app: 'landing',
        type: 'url',
        url: `${landingBase}/`,
        ready: (page) => ready(page.locator('h1').first()),
        readyAt: (page) => attachedTimestamp(page, 'h1'),
        duration: responseStartDuration,
      },
      {
        id: 'landing.login',
        app: 'landing',
        type: 'url',
        url: `${landingBase}/login`,
        ready: (page) => ready(page.locator('[data-testid="login-email-submit"]')),
        readyAt: (page) => attachedTimestamp(page, '[data-testid="login-email-submit"]'),
        duration: documentShellDuration,
      },
      {
        id: 'landing.register',
        app: 'landing',
        type: 'url',
        url: `${landingBase}/register`,
        ready: (page) => ready(page.locator('[data-testid="register-passkey-submit"]')),
        readyAt: (page) => attachedTimestamp(page, '[data-testid="register-passkey-submit"]'),
        duration: documentShellDuration,
      },
      {
        id: 'landing.register-passkey',
        app: 'landing',
        type: 'url',
        url: `${landingBase}/register/passkey`,
        ready: (page) => ready(page.locator('[data-testid="register-passkey-final-submit"]')),
        readyAt: (page) =>
          attachedTimestamp(page, '[data-testid="register-passkey-final-submit"]'),
        duration: documentShellDuration,
      },
      {
        id: 'landing.privacy',
        app: 'landing',
        type: 'url',
        url: `${landingBase}/privacy`,
        ready: (page) => ready(page.locator('main h1').first()),
        readyAt: (page) => attachedTimestamp(page, 'main h1'),
        duration: documentShellDuration,
      }
    );
  }

  if (only.has('dashboard')) {
    pages.push(
      {
        id: 'dashboard.overview',
        app: 'dashboard',
        type: 'url',
        url: `${dashboardBase}/dashboard/`,
        ready: (page) => ready(page.getByRole('heading', { name: 'Pilotage missions' })),
        readyAt: (page) => visibleTimestamp(page, 'h1'),
        duration: documentShellDuration,
      },
      ...[
        ['applications', '#applications'],
        ['cv', '#cv'],
        ['sync', '#sync'],
      ].map(([name, hash]) => ({
        id: `dashboard.${name}`,
        app: 'dashboard',
        type: 'hash',
        url: `${dashboardBase}/dashboard/`,
        hash,
        ready: (page) => readyAttached(page.locator(`section${hash}`).first()),
        readyAt: (page) => attachedTimestamp(page, `section${hash}`),
      }))
    );
  }

  return pages;
}

function extensionPages() {
  if (!only.has('extension')) return [];
  const url = `http://127.0.0.1:${ports.extension}/src/sidepanel/index.html`;
  return [
    {
      id: 'extension.feed',
      app: 'extension',
      type: 'extension-url',
      url,
      stub: { onboardingCompleted: true },
      ready: (page) => ready(page.locator('[data-testid="feed-scroll-container"]').first()),
      readyAt: (page) => visibleTimestamp(page, '[data-testid="feed-scroll-container"]'),
      duration: extensionStaticShellDuration,
    },
    {
      id: 'extension.onboarding',
      app: 'extension',
      type: 'extension-url',
      url,
      stub: { onboardingCompleted: false, firstScanDone: false, profile: null, premium: false },
      ready: (page) =>
        ready(page.getByRole('heading', { name: 'Configurez votre premier scan' }).first()),
      readyAt: (page) => visibleTimestamp(page, 'h1'),
      duration: extensionStaticShellDuration,
    },
    ...[
      [
        'profile',
        1,
        (page) => ready(page.locator('[data-testid="page-profile"]')),
        (page) => activePageTimestamp(page, '[data-testid="page-profile"]'),
      ],
      [
        'cv',
        2,
        (page) => ready(page.locator('[data-testid="page-cv"]')),
        (page) => activePageTimestamp(page, '[data-testid="page-cv"]'),
      ],
      [
        'applications',
        3,
        (page) => ready(page.locator('[data-testid="page-applications"]')),
        (page) => activePageTimestamp(page, '[data-testid="page-applications"]'),
      ],
      [
        'tjm',
        4,
        (page) => ready(page.locator('[data-testid="page-tjm"]')),
        (page) => activePageTimestamp(page, '[data-testid="page-tjm"]'),
      ],
      [
        'settings',
        5,
        (page) => ready(page.locator('[data-testid="page-settings"]')),
        (page) => activePageTimestamp(page, '[data-testid="page-settings"]'),
      ],
    ].map(([name, navIndex, pageReady, pageReadyAt]) => ({
      id: `extension.${name}`,
      app: 'extension',
      type: 'extension-nav',
      url,
      navIndex,
      ready: pageReady,
      readyAt: pageReadyAt,
    })),
  ];
}

async function collectPageMetrics(page, durationMs) {
  return await page.evaluate((duration) => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const paints = Object.fromEntries(
      performance.getEntriesByType('paint').map((entry) => [entry.name, Math.round(entry.startTime)])
    );
    return {
      durationMs: Math.round(duration * 10) / 10,
      domContentLoadedMs: navigation
        ? Math.round(navigation.domContentLoadedEventEnd - navigation.startTime)
        : null,
      loadEventMs: navigation ? Math.round(navigation.loadEventEnd - navigation.startTime) : null,
      responseStartMs: navigation ? Math.round(navigation.responseStart - navigation.startTime) : null,
      firstPaintMs: paints['first-paint'] ?? null,
      firstContentfulPaintMs: paints['first-contentful-paint'] ?? null,
      transferSize: navigation && 'transferSize' in navigation ? navigation.transferSize : null,
      encodedBodySize: navigation && 'encodedBodySize' in navigation ? navigation.encodedBodySize : null,
    };
  }, durationMs);
}

async function measureUrlPage(page, entry) {
  await page.goto(entry.url, { waitUntil: 'commit' });
  const readyAt = entry.readyAt ? await entry.readyAt(page) : null;
  if (!entry.readyAt) {
    await entry.ready(page);
  }
  const duration = entry.duration
    ? await entry.duration(page)
    : (readyAt ?? (await page.evaluate(() => performance.now())));
  return collectPageMetrics(page, duration);
}

async function measureHashPage(page, entry) {
  await page.goto(entry.url, { waitUntil: 'domcontentloaded' });
  await ready(page.getByRole('heading', { name: 'Pilotage missions' }));
  await page.evaluate(() => {
    window.__missionPulsePerfStart = performance.now();
  });
  await page.evaluate((hash) => {
    window.location.hash = hash;
  }, entry.hash);
  const readyAt = entry.readyAt ? await entry.readyAt(page) : null;
  if (!entry.readyAt) {
    await entry.ready(page);
  }
  const duration = await page.evaluate((timestamp) => {
    const end = timestamp ?? performance.now();
    return end - window.__missionPulsePerfStart;
  }, readyAt);
  return collectPageMetrics(page, duration);
}

async function measureExtensionUrl(browser, entry) {
  const context = await browser.newContext({
    viewport: { width: 400, height: 760 },
    deviceScaleFactor: 2,
  });
  await installExtensionChromeStub(context, entry.stub);
  const page = await context.newPage();
  try {
    return await measureUrlPage(page, entry);
  } catch (error) {
    const diagnostics = await pageDiagnostics(page);
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${diagnostics}`);
  } finally {
    await context.close();
  }
}

async function measureExtensionNav(page, entry) {
  await page.goto(entry.url, { waitUntil: 'commit' });
  await ready(page.locator('nav[aria-label="Main navigation"] button').first());
  await page.locator('[data-initial-shell]').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate(() => {
    window.__missionPulsePerfStart = performance.now();
  });
  await page.locator('nav[aria-label="Main navigation"] button').nth(entry.navIndex).click();
  const readyAt = entry.readyAt ? await entry.readyAt(page) : null;
  if (!entry.readyAt) {
    await entry.ready(page);
  }
  const duration = await page.evaluate((timestamp) => {
    const end = timestamp ?? performance.now();
    return end - window.__missionPulsePerfStart;
  }, readyAt);
  return collectPageMetrics(page, duration);
}

async function sampleEntry(browser, sharedPage, entry, isWarmup = false) {
  const consoleErrors = [];
  const started = performance.now();

  if (sharedPage) {
    sharedPage.removeAllListeners('console');
    sharedPage.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
  }

  let metrics;
  if (entry.type === 'url') {
    metrics = await measureUrlPage(sharedPage, entry);
  } else if (entry.type === 'hash') {
    metrics = await measureHashPage(sharedPage, entry);
  } else if (entry.type === 'extension-url') {
    metrics = await measureExtensionUrl(browser, entry);
  } else if (entry.type === 'extension-nav') {
    metrics = await measureExtensionNav(sharedPage, entry);
  } else {
    throw new Error(`Unsupported entry type: ${entry.type}`);
  }

  return {
    ...metrics,
    wallClockMs: Math.round((performance.now() - started) * 10) / 10,
    warmup: isWarmup,
    consoleErrorCount: consoleErrors.length,
    consoleErrors: consoleErrors.slice(0, 5),
  };
}

async function pageDiagnostics(page) {
  if (!page) return 'No page diagnostics available.';
  const url = page.url();
  const text = await page
    .locator('body')
    .innerText({ timeout: 1000 })
    .catch(() => '');
  return `URL: ${url}\nBody: ${text.replace(/\s+/g, ' ').slice(0, 600)}`;
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function summarize(entry, samples) {
  const durations = samples.map((sample) => sample.durationMs);
  const p50 = percentile(durations, 50);
  const p95 = percentile(durations, 95);
  const max = Math.max(...durations);
  const min = Math.min(...durations);
  const mean = durations.reduce((sum, value) => sum + value, 0) / durations.length;
  return {
    id: entry.id,
    app: entry.app,
    type: entry.type,
    samples: samples.length,
    minMs: Math.round(min * 10) / 10,
    p50Ms: Math.round(p50 * 10) / 10,
    p95Ms: Math.round(p95 * 10) / 10,
    maxMs: Math.round(max * 10) / 10,
    meanMs: Math.round(mean * 10) / 10,
    pass: p95 <= budgetMs,
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# MissionPulse page-load performance');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Label: ${report.label}`);
  lines.push(`Budget: P95 <= ${report.budgetMs} ms`);
  lines.push(`Iterations: ${report.iterations}; warmups: ${report.warmups}`);
  lines.push('');
  lines.push('| Page | App | P50 | P95 | Max | Pass |');
  lines.push('| --- | --- | ---: | ---: | ---: | :---: |');
  for (const row of report.summary) {
    lines.push(
      `| ${row.id} | ${row.app} | ${row.p50Ms ?? 'n/a'} | ${row.p95Ms ?? 'n/a'} | ${row.maxMs ?? 'n/a'} | ${row.pass ? 'yes' : 'no'} |`
    );
  }
  lines.push('');
  lines.push('## Method');
  lines.push('');
  lines.push(
    'Synthetic Chromium run against local Vite preview servers. Metric is browser-side ready time: SvelteKit hard navigations use either responseStart for minimal SSR shells or the document-shell marker after the initial head is parsed, extension hard loads use responseStart for the packaged static shell while still waiting for the shell selector, and SPA/hash transitions mark before the navigation action and measure until the target section/page is present or active. Browser cache stays enabled after warmups.'
  );
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  await mkdir(outDir, { recursive: true });

  if (!skipBuild) {
    await buildApps();
  }

  const children = servers.map(startServer);
  const stopServers = () => {
    for (const child of children) {
      if (!child.killed) child.kill('SIGTERM');
    }
  };
  process.once('SIGINT', () => {
    stopServers();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    stopServers();
    process.exit(143);
  });

  try {
    await Promise.all(servers.map((server) => waitForServer(server.url)));

    const browserExecutable = await resolveBrowserExecutable();
    const browser = await chromium.launch({
      headless: true,
      ...(browserExecutable ? { executablePath: browserExecutable } : {}),
    });
    const webContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
    });
    const webPage = await webContext.newPage();

    const extensionContext = only.has('extension')
      ? await browser.newContext({ viewport: { width: 400, height: 760 }, deviceScaleFactor: 2 })
      : null;
    if (extensionContext) {
      await installExtensionChromeStub(extensionContext, { onboardingCompleted: true });
    }
    const extensionNavPage = extensionContext ? await extensionContext.newPage() : null;

    const entries = [...webPages(), ...extensionPages()];
    const details = [];
    const summary = [];

    try {
      for (const entry of entries) {
        const sharedPage = entry.type.startsWith('extension') ? extensionNavPage : webPage;
        try {
          for (let i = 0; i < warmups; i += 1) {
            await sampleEntry(browser, sharedPage, entry, true);
          }

          const samples = [];
          for (let i = 0; i < iterations; i += 1) {
            samples.push(await sampleEntry(browser, sharedPage, entry, false));
          }

          const row = summarize(entry, samples);
          summary.push(row);
          details.push({ ...entry, samples });
          console.log(
            `${row.pass ? 'PASS' : 'FAIL'} ${row.id}: p50=${row.p50Ms}ms p95=${row.p95Ms}ms max=${row.maxMs}ms`
          );
        } catch (error) {
          const diagnostics = sharedPage ? await pageDiagnostics(sharedPage) : '';
          const row = {
            id: entry.id,
            app: entry.app,
            type: entry.type,
            samples: 0,
            minMs: null,
            p50Ms: null,
            p95Ms: null,
            maxMs: null,
            meanMs: null,
            pass: false,
            error: `${error instanceof Error ? error.message : String(error)}${diagnostics ? `\n${diagnostics}` : ''}`,
          };
          summary.push(row);
          details.push({ ...entry, samples: [], error: row.error });
          console.log(`ERROR ${row.id}: ${row.error}`);
        }
      }
    } finally {
      await webContext.close();
      if (extensionContext) await extensionContext.close();
      await browser.close();
    }

    const report = {
      generatedAt: new Date().toISOString(),
      label: runLabel,
      budgetMs,
      iterations,
      warmups,
      skipBuild,
      browserExecutable,
      summary,
      details,
    };

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = resolve(outDir, `page-load-${stamp}.json`);
    const mdPath = resolve(outDir, `page-load-${stamp}.md`);
    const latestJsonPath = resolve(outDir, 'page-load-latest.json');
    const latestMdPath = resolve(outDir, 'page-load-latest.md');
    const markdown = renderMarkdown(report);

    await writeFile(jsonPath, JSON.stringify(report, null, 2));
    await writeFile(mdPath, markdown);
    await writeFile(latestJsonPath, JSON.stringify(report, null, 2));
    await writeFile(latestMdPath, markdown);

    const failing = summary.filter((row) => !row.pass);
    console.log(`wrote ${jsonPath}`);
    console.log(`wrote ${mdPath}`);
    if (failing.length > 0) {
      console.log(`${failing.length} page(s) exceed ${budgetMs}ms P95.`);
      process.exitCode = 1;
    }
  } finally {
    stopServers();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
