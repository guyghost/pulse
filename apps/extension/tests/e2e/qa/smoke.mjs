// Smoke test for the QA harness: seed snapshot + boot + feed screenshot + console dump.
import {
  buildSeedSnapshot,
  launchContext,
  gotoApp,
  navigate,
  screenshot,
  dumpConsole,
  STORAGE_STATE_PATH,
} from './qa-harness.mjs';

const findings = {};
const t0 = Date.now();

const seed = await buildSeedSnapshot();
findings.seed = seed;
console.log('seed:', seed);

const { browser, context, page, consoleErrors, pageFailures } = await launchContext({
  storageState: STORAGE_STATE_PATH,
});
try {
  await gotoApp(page);
  const visible = await page.locator('[data-testid="mission-feed-anchor"]').count();
  findings.feedAnchorPresent = visible > 0;
  findings.shot = await screenshot(page, '00-smoke-feed');
  for (const dest of ['profile', 'cv', 'applications', 'tjm', 'settings', 'feed']) {
    try {
      await navigate(page, dest);
      findings['nav_' + dest] = 'ok';
    } catch (e) {
      findings['nav_' + dest] = 'FAIL: ' + e.message;
    }
  }
  await navigate(page, 'feed');
  await screenshot(page, '00-smoke-feed-after-nav');
  dumpConsole('smoke', { consoleErrors, pageFailures });
  findings.consoleErrorCount = consoleErrors.length;
  findings.consoleErrors = consoleErrors.slice(0, 20);
  findings.pageErrors = pageFailures.slice(0, 10);
} finally {
  await browser.close();
}

findings.durationMs = Date.now() - t0;
console.log(JSON.stringify(findings, null, 2));
