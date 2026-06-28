// DOM probe: dump selectors/text we need for accurate assertions.
import { launchContext, gotoApp, navigate, STORAGE_STATE_PATH } from './qa-harness.mjs';

const { browser, page } = await launchContext({ storageState: STORAGE_STATE_PATH });
const out = {};
async function txt(sel) {
  return await page
    .locator(sel)
    .first()
    .innerText()
    .catch(() => null);
}
try {
  await gotoApp(page);
  out.feedCountBadge = await page
    .locator('[aria-label*="missions dans la liste"]')
    .first()
    .innerText()
    .catch(() => null);
  out.feedAnchorText = await txt('[data-testid="mission-feed-anchor"]');
  out.actionQueueCount = await page.locator('[data-testid="feed-action-queue"] >*').count();
  out.actionQueueText = await txt('[data-testid="feed-action-queue"]');
  out.presets = await page
    .locator('[aria-label="Presets métier du feed"] button')
    .allInnerTexts()
    .catch(() => []);
  out.cardBtnArias = await page.evaluate(() => {
    const card = document.querySelector(
      '[data-testid="mission-feed"] [data-testid="mission-card"], [data-testid="mission-card"], article'
    );
    if (!card) return { found: false };
    const btns = Array.from(card.querySelectorAll('button')).map((b) => ({
      aria: b.getAttribute('aria-label'),
      text: (b.innerText || '').trim().slice(0, 20),
    }));
    return { found: true, btns };
  });
  out.scoreBucketBtns = await page
    .getByText(/Prioritaires|À comparer|À qualifier/, { exact: false })
    .allInnerTexts()
    .catch(() => []);

  await navigate(page, 'applications');
  await page.waitForTimeout(500);
  out.appBody = (
    await page
      .locator('main, .flex.h-full')
      .first()
      .innerText()
      .catch(() => '')
  ).slice(0, 1400);

  await navigate(page, 'cv');
  await page.waitForTimeout(500);
  out.cvLinkedInBtns = await page
    .getByRole('button')
    .filter({ hasText: /LinkedIn/i })
    .allInnerTexts()
    .catch(() => []);

  await navigate(page, 'tjm');
  await page.waitForTimeout(500);
  out.tjmHasRegionControl = await page.getByText(/région|Region/i, { exact: false }).count();
  out.tjmPositioning = await page.getByText(/positionnement/i, { exact: false }).count();

  await navigate(page, 'settings');
  await page.waitForTimeout(500);
  out.settingsButtons = await page
    .getByRole('button')
    .allInnerTexts()
    .catch(() => []);
} finally {
  await browser.close();
}
console.log(JSON.stringify(out, null, 2));
