import { expect, test } from '@playwright/test';
import { dismissFeedTour, SIDE_PANEL } from './helpers';

/**
 * Regression (PR review): the inline OperationalStoryCard only renders inside
 * the hero-content block (`heroCompact || advanced controls || busy || scan
 * summary`). With zero missions and an idle feed that block is skipped, so
 * `storyCoversConnectors` must be false and the ConnectorAlertBar stays the
 * canonical broken-source surface. A broken connector must never leave the
 * feed with zero visible warning. Model: src/models/feed-story.model.md —
 * « Une seule surface d'attention connecteurs ».
 */
test('broken connector alert stays visible on an empty idle feed', async ({ page }) => {
  await page.addInitScript(() => {
    // Empty mission set: the dev stub's auto-scan completes with 0 missions,
    // so the hero stays compact-free once the feed settles.
    window.localStorage.setItem('__missionpulse_dev_missions', '[]');
    // One broken snapshot (circuit open, 5 consecutive failures) mirroring the
    // qa-seed 'hiway' broken variant — deriveHealthStatus() yields 'broken'.
    const now = Date.now();
    window.localStorage.setItem(
      '__missionpulse_dev_health',
      JSON.stringify([
        {
          connectorId: 'hiway',
          circuitState: 'open',
          consecutiveFailures: 5,
          totalFailures: 5,
          totalSuccesses: 3,
          lastSuccessAt: now - 60 * 60_000,
          lastFailureAt: now - 60_000,
          lastStateChangeAt: now - 60_000,
          recentLatenciesMs: [2000, 1800, 2400],
        },
      ])
    );
  });

  await page.goto(SIDE_PANEL);
  await dismissFeedTour(page);

  // The mount auto-scan can hold the hero open for ~4.5s after completion
  // (scan-completion delight); the alert becomes canonical once the feed is
  // idle again. The lazy-loaded ConnectorAlertBar owns this heading.
  await expect(page.getByText('Santé des connecteurs', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
});
