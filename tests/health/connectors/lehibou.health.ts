import { join } from 'node:path';
import type { HealthCheckResult } from '../types';

const MISSIONS_URL = 'https://www.lehibou.com/freelance/missions';
const TIMEOUT = parseInt(process.env.HEALTH_CHECK_TIMEOUT ?? '60000', 10);

export async function runLeHibouHealthCheck(screenshotDir: string): Promise<HealthCheckResult> {
  const { chromium } = await import('@playwright/test');
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    const response = await page.goto(MISSIONS_URL, {
      timeout: TIMEOUT,
      waitUntil: 'networkidle',
    });

    const responseTime = Date.now() - startTime;

    if (!response || !response.ok()) {
      const screenshotPath = join(screenshotDir, 'lehibou-error.png');
      await page.screenshot({ path: screenshotPath });

      return {
        connectorId: 'lehibou',
        connectorName: 'LeHibou',
        status: 'failed',
        responseTimeMs: responseTime,
        timestamp,
        error: `Page returned status ${response?.status() ?? 'no response'}`,
        screenshotPath,
      };
    }

    await page.waitForTimeout(3000);

    const missionLinks = await page.locator('a[href*="/annonce/"]').count();
    const screenshotPath = join(screenshotDir, 'lehibou-missions.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const hasLoginPrompt = (await page.locator('text=/connexion|login|inscri/i').count()) > 0;

    if (missionLinks === 0 && !hasLoginPrompt) {
      return {
        connectorId: 'lehibou',
        connectorName: 'LeHibou',
        status: 'failed',
        responseTimeMs: responseTime,
        timestamp,
        error:
          'No mission cards found and no login prompt visible - site structure may have changed',
        missionsFound: 0,
        screenshotPath,
      };
    }

    return {
      connectorId: 'lehibou',
      connectorName: 'LeHibou',
      status: 'ok',
      responseTimeMs: responseTime,
      timestamp,
      missionsFound: missionLinks,
      screenshotPath,
      metadata: {
        requiresAuth: hasLoginPrompt,
        pageLoadComplete: true,
      },
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';

    let screenshotPath: string | undefined;
    try {
      screenshotPath = join(screenshotDir, 'lehibou-error.png');
      await page.screenshot({ path: screenshotPath });
    } catch {
      // Ignore screenshot errors
    }

    return {
      connectorId: 'lehibou',
      connectorName: 'LeHibou',
      status: isTimeout ? 'timeout' : 'failed',
      responseTimeMs: responseTime,
      timestamp,
      error: error instanceof Error ? error.message : String(error),
      screenshotPath,
    };
  } finally {
    await browser.close();
  }
}
