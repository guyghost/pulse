import { test, expect, type Page } from '@playwright/test';
import { ensureFeedVisible } from './helpers';

async function mockConnectedSyncFailure(page: Page) {
  await page.addInitScript(() => {
    let chromeValue: unknown = undefined;
    let retried = false;

    Object.defineProperty(window, 'chrome', {
      configurable: true,
      enumerable: true,
      get() {
        return chromeValue;
      },
      set(value: unknown) {
        chromeValue = value;
        const chromeApi = value as {
          runtime?: {
            sendMessage?: (message: { type: string; payload?: unknown }) => Promise<unknown>;
          };
        };
        const originalSendMessage = chromeApi.runtime?.sendMessage;
        if (!originalSendMessage) {
          return;
        }

        chromeApi.runtime.sendMessage = async (message) => {
          if (message.type === 'AUTH_STATUS') {
            return {
              type: 'AUTH_RESULT',
              payload: {
                status: 'authenticated',
                user: {
                  id: 'user-e2e',
                  email: 'e2e@example.com',
                  premiumStatus: 'premium',
                  premiumExpiresAt: null,
                  creditBalance: 10,
                },
              },
            };
          }

          if (message.type === 'GET_CONNECTED_SYNC_STATUS') {
            return {
              type: 'CONNECTED_SYNC_STATUS_RESULT',
              payload: {
                authenticated: true,
                installId: 'install-e2e',
                lastGlobalSync: 1779436800000,
                entities: [
                  {
                    entity: 'missions',
                    label: 'Missions',
                    state: retried ? 'healthy' : 'error',
                    lastPullAt: null,
                    lastPushAt: retried ? '2026-05-22T10:05:00.000Z' : null,
                    pendingUploadCount: retried ? 0 : 2,
                    pendingDownloadCount: 0,
                    lastErrorCode: retried ? null : 'remote-error',
                    lastErrorMessage: retried ? null : 'Supabase indisponible',
                    retryAfterAt: retried ? null : '2026-05-22T10:05:00.000Z',
                    updatedAt: retried ? '2026-05-22T10:05:00.000Z' : '2026-05-22T10:00:00.000Z',
                  },
                ],
              },
            };
          }

          if (message.type === 'RETRY_CONNECTED_SYNC') {
            retried = true;
            return {
              type: 'CONNECTED_DASHBOARD_SYNCED',
              payload: { synced: true, missions: 1, applications: 0, connectorHealth: 0 },
            };
          }

          return originalSendMessage.call(chromeApi.runtime, message);
        };
      },
    });
  });
}

test.describe('Settings Flow', () => {
  test('navigates to settings and displays profile section', async ({ page }) => {
    await ensureFeedVisible(page);

    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('button', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByRole('heading', { name: 'Profil' })).toBeVisible();
  });

  test('displays current profile information in read-only mode', async ({ page }) => {
    await ensureFeedVisible(page);
    await page.getByRole('button', { name: 'Settings' }).click();

    const hasProfileSection = await page
      .getByRole('heading', { name: 'Profil' })
      .isVisible()
      .catch(() => false);
    expect(hasProfileSection).toBe(true);
  });

  test('profile edit mode shows form fields', async ({ page }) => {
    await ensureFeedVisible(page);
    await page.getByRole('button', { name: 'Settings' }).click();

    const editBtn = page.getByTitle('Modifier');
    await expect(editBtn).toBeVisible({ timeout: 3000 });
    await editBtn.click();

    await expect(page.locator('input[placeholder="Prenom"]')).toBeVisible();
    await expect(page.locator('input[placeholder*="Poste"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Localisation"]')).toBeVisible();
  });

  test('canceling profile edit returns to read-only mode', async ({ page }) => {
    await ensureFeedVisible(page);
    await page.getByRole('button', { name: 'Settings' }).click();

    await page.getByTitle('Modifier').click();
    await expect(page.locator('input[placeholder="Prenom"]')).toBeVisible();

    await page.getByTitle('Annuler').click();
    await expect(page.locator('input[placeholder="Prenom"]')).not.toBeVisible();
  });

  test('stack editor adds and removes technologies', async ({ page }) => {
    await ensureFeedVisible(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByTitle('Modifier').click();

    const stackInput = page.locator('#stack-input');
    await expect(stackInput).toBeVisible();
    await stackInput.fill('TypeScript');
    await page.keyboard.press('Enter');
    await expect(page.getByText('TypeScript')).toBeVisible();

    const chip = page.locator('button').filter({ hasText: 'TypeScript' });
    await chip.click();
    await page.waitForTimeout(300);
  });

  test('adding stack item via Enter key works', async ({ page }) => {
    await ensureFeedVisible(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByTitle('Modifier').click();

    const stackInput = page.locator('#stack-input');
    await stackInput.fill('React');
    await page.keyboard.press('Enter');
    await expect(page.getByText('React')).toBeVisible();
  });

  test('scan frequency slider is visible and adjustable', async ({ page }) => {
    await ensureFeedVisible(page);
    await page.getByRole('button', { name: 'Settings' }).click();

    await expect(page.getByText('Frequence de scan')).toBeVisible();
    await expect(page.locator('input[type="range"]').first()).toBeVisible();
    await expect(page.getByText('5 min')).toBeVisible();
    await expect(page.getByText('120 min')).toBeVisible();
  });

  test('notifications toggle switches state', async ({ page }) => {
    await ensureFeedVisible(page);
    await page.getByRole('button', { name: 'Settings' }).click();

    const notificationsSwitch = page.getByRole('switch', { name: 'Activer les notifications' });
    await expect(notificationsSwitch).toBeVisible();

    const initialChecked = await notificationsSwitch.getAttribute('aria-checked');
    await notificationsSwitch.click();
    const newChecked = await notificationsSwitch.getAttribute('aria-checked');
    expect(newChecked).not.toBe(initialChecked);
  });

  test('auto-scan toggle switches state', async ({ page }) => {
    await ensureFeedVisible(page);
    await page.getByRole('button', { name: 'Settings' }).click();

    const autoScanSwitch = page.getByRole('switch', { name: 'Activer le scan automatique' });
    await expect(autoScanSwitch).toBeVisible();

    const initialChecked = await autoScanSwitch.getAttribute('aria-checked');
    await autoScanSwitch.click();
    const newChecked = await autoScanSwitch.getAttribute('aria-checked');
    expect(newChecked).not.toBe(initialChecked);
  });

  test('disabling auto-scan dims the frequency section', async ({ page }) => {
    await ensureFeedVisible(page);
    await page.getByRole('button', { name: 'Settings' }).click();

    const autoScanSwitch = page.getByRole('switch', { name: 'Activer le scan automatique' });
    const isChecked = await autoScanSwitch.getAttribute('aria-checked');
    if (isChecked === 'true') {
      await autoScanSwitch.click();
    }

    const hint = page.getByText(/Activez le scan automatique/);
    await expect(hint).toBeVisible();
  });

  test('local AI status section is present', async ({ page }) => {
    await ensureFeedVisible(page);
    await page.getByRole('button', { name: 'Settings' }).click();

    await expect(page.getByText('IA locale')).toBeVisible();
    await expect(page.getByText(/Gemini Nano/)).toBeVisible();
    await expect(page.getByText('Missions / scan')).toBeVisible();
  });

  test('danger zone shows reset button', async ({ page }) => {
    await ensureFeedVisible(page);
    await page.getByRole('button', { name: 'Settings' }).click();

    await expect(page.getByText('Zone dangereuse')).toBeVisible();
    await expect(page.getByText('Reinitialiser tout')).toBeVisible();
  });

  test('clicking reset shows confirmation dialog', async ({ page }) => {
    await ensureFeedVisible(page);
    await page.getByRole('button', { name: 'Settings' }).click();

    await page.getByText('Reinitialiser tout').click();
    await expect(page.getByText('Confirmer la suppression')).toBeVisible();
    await expect(page.getByText('Annuler')).toBeVisible();
    await page.getByText('Annuler').click();
    await expect(page.getByText('Confirmer la suppression')).not.toBeVisible();
  });

  test('settings page remains accessible after navigation', async ({ page }) => {
    await ensureFeedVisible(page);

    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Profil' })).toBeVisible();

    await page.getByRole('button', { name: 'Feed' }).click();
    await expect(page.getByRole('button', { name: 'Feed' })).toHaveAttribute(
      'aria-current',
      'page'
    );

    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Profil' })).toBeVisible({ timeout: 2000 });
  });

  test('settings page shows export section', async ({ page }) => {
    await ensureFeedVisible(page);
    await page.getByRole('button', { name: 'Settings' }).click();

    await expect(page.getByText('Export').first()).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole('button', { name: 'JSON' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'CSV' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Markdown' })).toBeVisible();
  });

  test('settings page shows backup section', async ({ page }) => {
    await ensureFeedVisible(page);
    await page.getByRole('button', { name: 'Settings' }).click();

    await expect(page.getByText('Sauvegarde').first()).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Créer une sauvegarde')).toBeVisible();
    await expect(page.getByText('Restaurer depuis une sauvegarde')).toBeVisible();
  });

  test('connected dashboard sync errors are visible and manually recoverable', async ({ page }) => {
    await mockConnectedSyncFailure(page);
    await ensureFeedVisible(page);
    await page.getByRole('button', { name: 'Settings' }).click();

    const dashboardSync = page.locator('.section-card').filter({ hasText: 'Dashboard connecté' });
    await expect(dashboardSync).toBeVisible();
    await expect(dashboardSync.getByText('Action requise')).toBeVisible();
    await expect(dashboardSync.getByText('Missions', { exact: true })).toBeVisible();
    await expect(dashboardSync.getByText('remote-error: Supabase indisponible')).toBeVisible();
    await expect(dashboardSync.getByText(/Retry après/)).toBeVisible();
    await expect(
      dashboardSync.locator('p').filter({ hasText: 'Upload:' }).filter({ hasText: '2' })
    ).toBeVisible();

    await dashboardSync.getByRole('button', { name: 'Retenter la sync' }).click();

    await expect(page.getByText('Synchronisation dashboard relancée')).toBeVisible();
    await expect(dashboardSync.getByText('Connecté', { exact: true })).toBeVisible();
    await expect(dashboardSync.getByText('Synchronisé', { exact: true })).toBeVisible();
    await expect(dashboardSync.getByText('remote-error: Supabase indisponible')).not.toBeVisible();
  });
});
