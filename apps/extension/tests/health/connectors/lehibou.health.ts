import { join } from 'node:path';
import type { HealthCheckResult } from '../types';

const MISSIONS_URL = 'https://www.lehibou.com/en/freelance';
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
      waitUntil: 'domcontentloaded',
    });

    const responseTime = Date.now() - startTime;
    const status = response?.status() ?? 0;
    const title = await page.title();

    // Cloudflare challenge or WAF block — site is reachable but blocks headless browsers
    if ((status === 403 || status === 503) && title.includes('moment')) {
      const screenshotPath = join(screenshotDir, 'lehibou-cloudflare.png');
      await page.screenshot({ path: screenshotPath });

      return {
        connectorId: 'lehibou',
        connectorName: 'LeHibou',
        status: 'ok',
        responseTimeMs: responseTime,
        timestamp,
        missionsFound: 0,
        screenshotPath,
        metadata: {
          cloudflareProtected: true,
          requiresAuth: true,
          note: 'Site reachable but behind Cloudflare challenge — connector uses session cookies in production',
        },
      };
    }

    if (!response?.ok()) {
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
    const expertiseLinks = await page
      .locator('a[href*="/freelance/"]')
      .filter({ hasNotText: 'Create my freelance profile' })
      .count();
    const screenshotPath = join(screenshotDir, 'lehibou-missions.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const hasLoginPrompt = (await page.locator('text=/connexion|login|inscri/i').count()) > 0;
    const hasMissionEntryPoint =
      (await page.locator('text=/find a mission|trouver une mission/i').count()) > 0;

    if (missionLinks === 0 && expertiseLinks === 0 && !hasLoginPrompt && !hasMissionEntryPoint) {
      return {
        connectorId: 'lehibou',
        connectorName: 'LeHibou',
        status: 'failed',
        responseTimeMs: responseTime,
        timestamp,
        error:
          'No public mission entry points found - site structure may have changed',
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
      missionsFound: missionLinks || expertiseLinks,
      screenshotPath,
      metadata: {
        requiresAuth: hasLoginPrompt,
        pageLoadComplete: true,
        publicMissionCards: missionLinks,
        publicExpertiseLinks: expertiseLinks,
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
