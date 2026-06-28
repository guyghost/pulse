// QA harness for MissionPulse Phase B interactive QA.
//
// Owns NO source changes. This file lives under tests/e2e/qa/ and is NOT picked
// up by the Playwright runner (no *.test.* / *.spec.* suffix). It is driven by
// run-qa.mjs via plain `node`.
//
// Seeding strategy: the QA seed fixture (tests/fixtures/qa-seed.ts) imports the
// app's src modules (TS + $lib alias) which plain node/tsx cannot resolve, so we
// seed the running app the sanctioned dev way: DevPanel "Inject QA seed (500)"
// (applyQaSeedToLocalStorage + reload). We then snapshot window.localStorage
// into a storageState JSON file and reuse it as the baseline for every isolated
// per-bug context, honouring the "boots with ~500 missions + full profile"
// requirement without re-running the TS fixture in node.
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export const BASE_URL = 'http://localhost:5176/src/sidepanel/index.html';
export const SHOTS_DIR = '/Users/guy/Developer/dev/pulse/reports/qa/screenshots';
export const STORAGE_STATE_PATH = '/tmp/qa-storage-state.json';

// Side-panel-ish viewport (narrow) to surface overflow/a11y issues.
export const VIEWPORT = { width: 400, height: 760 };

if (!existsSync(SHOTS_DIR)) mkdirSync(SHOTS_DIR, { recursive: true });

const NAV_LABEL = {
  feed: 'Feed',
  profile: 'Profil',
  cv: 'CV',
  applications: 'Suivi',
  tjm: 'TJM',
  settings: 'Réglages',
};

/**
 * Launch a browser + context. If a seed storageState snapshot exists, use it so
 * the app boots already seeded; otherwise pass null to boot the default mock
 * state (used only for the initial seeding pass).
 */
export async function launchContext({ storageState = undefined, viewport = VIEWPORT } = {}) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState,
    viewport,
    deviceScaleFactor: 2,
  });
  const consoleErrors = [];
  const consoleAll = [];
  const pageFailures = [];
  const page = await context.newPage();
  page.on('console', (msg) => {
    const t = msg.type();
    const text = msg.text();
    consoleAll.push({ type: t, text });
    if (t === 'error') consoleErrors.push(text);
  });
  page.on('pageerror', (err) => pageFailures.push(String(err)));
  return { browser, context, page, consoleErrors, consoleAll, pageFailures };
}

export async function gotoApp(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  // Allow Svelte + chrome stubs + initial feed load to settle.
  await page.waitForTimeout(900);
  return page;
}

/** Click a main nav button by its visible label. */
export async function navigate(page, name) {
  const label = NAV_LABEL[name] ?? name;
  // Prefer aria-label match, fall back to visible text.
  const sel = `nav[aria-label="Main navigation"] button`;
  const candidates = page.locator(sel);
  const count = await candidates.count();
  for (let i = 0; i < count; i++) {
    const el = candidates.nth(i);
    const aria = await el.getAttribute('aria-label');
    const txt = (await el.innerText()).trim();
    if (aria === label || txt === label || txt.includes(label)) {
      await el.click();
      await page.waitForTimeout(600);
      return;
    }
  }
  throw new Error(`nav item "${label}" not found among ${count} buttons`);
}

export async function screenshot(page, name, opts = {}) {
  const path = resolve(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: opts.fullPage ?? false });
  return path;
}

/**
 * One-time seeding pass: boot default app, open DevPanel (Ctrl+Shift+D), click
 * "Inject QA seed (500)", wait for reload, then snapshot localStorage to a
 * storageState JSON file used by all later contexts.
 */
export async function buildSeedSnapshot() {
  if (existsSync(STORAGE_STATE_PATH)) {
    return { reused: true, path: STORAGE_STATE_PATH };
  }
  const { browser, context, page } = await launchContext({ storageState: undefined });
  try {
    await gotoApp(page);
    await openDevPanel(page);
    await page.getByTitle('Inject QA seed (500) puis recharger', { exact: false }).click({ timeout: 4000 }).catch(async () => {
      // Fall back to text match.
      await page.getByText('Inject QA seed (500)').click({ timeout: 4000 });
    });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);
    await snapshotStorage(page, STORAGE_STATE_PATH);
  } finally {
    await browser.close();
  }
  return { reused: false, path: STORAGE_STATE_PATH };
}

export async function openDevPanel(page) {
  // The DevPanel toggle listens for Ctrl+Shift+D.
  await page.keyboard.press('Control+Shift+KeyD');
  await page.waitForTimeout(250);
}

/** Read window.localStorage into a Playwright storageState-shaped object. */
export async function snapshotStorage(page, path = STORAGE_STATE_PATH) {
  const entries = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const name = window.localStorage.key(i);
      out.push({ name, value: window.localStorage.getItem(name) });
    }
    return out;
  });
  const state = {
    cookies: [],
    origins: [{ origin: 'http://localhost:5176', localStorage: entries }],
  };
  writeFileSync(path, JSON.stringify(state, null, 2));
  return state;
}

/**
 * Prepend a localStorage patch init script to a context, applied before the app
 * boots on every navigation. `overrides` is a map of storageKey -> JS-value
 * (will be JSON.stringified). Used to stage edge states (e.g. accepted mission
 * with a past nextActionAt, inverted TJM target).
 */
export function patchStorageBeforeBoot(context, overrides) {
  const payload = JSON.stringify(overrides);
  const script = [
    '(function(){try{',
    'var o=' + payload + ';',
    'for(var k in o){if(Object.prototype.hasOwnProperty.call(o,k)){',
    'window.localStorage.setItem(k, typeof o[k]==="string"?o[k]:JSON.stringify(o[k]));',
    '}}',
    '}catch(e){console.warn("[qa-patch] failed",e);}',
    '})();',
  ].join('');
  context.addInitScript({ content: script });
}

/**
 * Wrap chrome.runtime.sendMessage at runtime (after boot) so that messages whose
 * `type` is in `failTypes` reject with the given error. Used to exercise failure
 * paths (restore backup, alert-save) that the dev stubs otherwise satisfy.
 */
export async function injectSendMessageFailure(page, failTypes, errMsg = 'qa-injected-failure') {
  await page.evaluate(
    ({ failTypes, errMsg }) => {
      const chromeRef = window.chrome;
      if (!chromeRef || !chromeRef.runtime || !chromeRef.runtime.sendMessage) return false;
      if (chromeRef.runtime.__qaWrapped) return true;
      const orig = chromeRef.runtime.sendMessage.bind(chromeRef.runtime);
      chromeRef.runtime.sendMessage = async (message) => {
        if (message && failTypes.includes(message.type)) {
          throw new Error(errMsg);
        }
        return orig(message);
      };
      chromeRef.runtime.__qaWrapped = true;
      return true;
    },
    { failTypes, errMsg }
  );
}

/** Return current page key from the app navigation store (best-effort). */
export async function currentPage(page) {
  return await page.evaluate(() => {
    // There is no global hook; infer from the active nav button aria-pressed.
    const btns = Array.from(document.querySelectorAll('nav[aria-label="Main navigation"] button'));
    const active = btns.find((b) => b.getAttribute('aria-current') === 'page' || b.getAttribute('aria-pressed') === 'true');
    return active ? (active.getAttribute('aria-label') || active.innerText || '').trim() : null;
  });
}

export function dumpConsole(label, { consoleErrors, pageFailures }) {
  if (consoleErrors.length || pageFailures.length) {
    console.log(`[console:${label}] errors=${consoleErrors.length} pageerrors=${pageFailures.length}`);
    for (const e of consoleErrors.slice(0, 12)) console.log('  ERR:', e.slice(0, 240));
    for (const e of pageFailures.slice(0, 6)) console.log('  PAGEERR:', e.slice(0, 240));
  }
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
export function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2));
}
