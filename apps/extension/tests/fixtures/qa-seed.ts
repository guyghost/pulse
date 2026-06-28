/**
 * Playwright helpers for the QA seed.
 *
 * Imports the pure `buildQaSeed` from `src/dev/qa-seed` and produces:
 *  - `buildQaSeedInitScript(now, variant)`: a JS string that seeds
 *    `window.localStorage` BEFORE the app (and chrome-stubs) initialize.
 *    Pass it to `page.addInitScript({ content })`.
 *  - `buildQaSeedStorageState(now, origin, variant)`: a `storageState`-compatible
 *    object usable with `browser.newContext({ storageState })` / `context.storageState()`.
 *
 * The localStorage keys are written verbatim (no runtime dependency on the app),
 * so the page boots already seeded.
 */
import { buildQaSeed, QA_LOCALSTORAGE_KEYS, type QaSeed } from '../../src/dev/qa-seed';

export { buildQaSeed, QA_LOCALSTORAGE_KEYS };
export type { QaSeed };

export type QaProfileVariant = 'complete' | 'incomplete';

function buildSeedEntries(now: Date, variant: QaProfileVariant): Array<[string, unknown]> {
  const seed = buildQaSeed(now);
  const profile = variant === 'incomplete' ? seed.profileIncomplete : seed.profile;
  return [
    [QA_LOCALSTORAGE_KEYS.missions, seed.missions],
    [QA_LOCALSTORAGE_KEYS.favorites, seed.favorites],
    [QA_LOCALSTORAGE_KEYS.hidden, seed.hidden],
    [QA_LOCALSTORAGE_KEYS.seen, seed.seen],
    [QA_LOCALSTORAGE_KEYS.savedViews, seed.savedViews],
    [QA_LOCALSTORAGE_KEYS.alertPreferences, seed.alertPreferences],
    [QA_LOCALSTORAGE_KEYS.profile, profile],
    [QA_LOCALSTORAGE_KEYS.trackings, seed.trackings],
    [QA_LOCALSTORAGE_KEYS.health, seed.healthSnapshots],
  ];
}

/**
 * Returns a self-contained JS snippet that populates localStorage.
 *
 * Usage:
 *   const script = buildQaSeedInitScript(new Date('2026-06-15T12:00:00Z'));
 *   await page.addInitScript({ content: script });
 *   await page.goto('http://localhost:5176/src/sidepanel/index.html');
 */
export function buildQaSeedInitScript(
  now: Date = new Date(),
  variant: QaProfileVariant = 'complete'
): string {
  const entries = buildSeedEntries(now, variant);
  // JSON-stringify the [key, value] pairs once; the IIFE re-stringifies each
  // value so localStorage holds valid JSON (matching how chrome-stubs read it).
  const payload = JSON.stringify(entries);
  return [
    '(function(){try{',
    'var entries=' + payload + ';',
    'for(var i=0;i<entries.length;i++){',
    'window.localStorage.setItem(entries[i][0],JSON.stringify(entries[i][1]));',
    '}',
    '}catch(e){console.warn("[qa-seed] init failed",e);}',
    '})();',
  ].join('');
}

/**
 * storageState-compatible object. Each localStorage entry is pre-stringified
 * (the exact shape chrome-stubs read via JSON.parse).
 */
export function buildQaSeedStorageState(
  now: Date = new Date(),
  origin = 'http://localhost:5176',
  variant: QaProfileVariant = 'complete'
): {
  cookies: unknown[];
  origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>;
} {
  const entries = buildSeedEntries(now, variant);
  const localStorage = entries.map(([name, value]) => ({
    name,
    value: JSON.stringify(value),
  }));
  return {
    cookies: [],
    origins: [{ origin, localStorage }],
  };
}
