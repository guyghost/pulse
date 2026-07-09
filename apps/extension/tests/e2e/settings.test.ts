import { test, expect } from './fixtures';
import { expectFeedReady, navButton } from './helpers';

test.describe('Settings Flow', () => {
  test('navigates to settings without the profile editor section', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('button', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByRole('heading', { name: 'Paramètres' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Profil' })).not.toBeVisible();
    await expect(page.getByText('Fréquence', { exact: true })).toBeVisible();
  });

  test('profile tab is available and displays current profile information', async ({ page }) => {
    await navButton(page, 'Profil').click();

    await expect(navButton(page, 'Profil')).toHaveAttribute('aria-current', 'page');
    await expect(
      page.getByRole('heading', { name: /Votre profil MissionPulse|Bonjour/ })
    ).toBeVisible();
    // Use exact: true to match only the "Profil" heading in ProfileSection,
    // not other headings that contain "profil" as a substring
    await expect(page.getByRole('heading', { name: 'Profil', exact: true })).toBeVisible();
  });

  test('profile tab edit mode shows form fields', async ({ page }) => {
    await navButton(page, 'Profil').click();

    const editBtn = page.getByRole('button', { name: 'Modifier le profil' }).first();
    await expect(editBtn).toBeVisible({ timeout: 3000 });
    await editBtn.click();

    await expect(page.locator('input[placeholder="Prénom"]')).toBeVisible();
    await expect(page.locator('input[placeholder*="Poste"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Localisation"]')).toBeVisible();
  });

  test('canceling profile edit returns to read-only mode', async ({ page }) => {
    await navButton(page, 'Profil').click();

    await page.getByRole('button', { name: 'Modifier le profil' }).first().click();
    await expect(page.locator('input[placeholder="Prénom"]')).toBeVisible();

    await page.getByRole('button', { name: 'Annuler la modification du profil' }).click();
    await expect(page.locator('input[placeholder="Prénom"]')).not.toBeVisible();
  });

  test('profile tab saves partial profile edits', async ({ page }) => {
    await navButton(page, 'Profil').click();
    await page.getByRole('button', { name: 'Modifier le profil' }).first().click();

    const profileSection = page.locator('.section-card').filter({ hasText: 'Vos informations' });
    await profileSection.locator('input[placeholder="Prénom"]').fill('');
    await profileSection.locator('input[placeholder^="Poste"]').fill('Architecte Svelte');
    await profileSection.locator('#profile-keywords-input').fill('Svelte Save');
    await profileSection.getByRole('button', { name: 'Enregistrer le profil' }).click();

    await navButton(page, 'Feed').click();
    await navButton(page, 'Profil').click();

    const returnedProfileSection = page
      .locator('.section-card')
      .filter({ hasText: 'Vos informations' });
    await expect(profileSection.locator('input[placeholder="Prénom"]')).not.toBeVisible();
    await expect(
      returnedProfileSection.getByText('Non renseigné — Architecte Svelte')
    ).toBeVisible();
    await expect(returnedProfileSection.getByText('Svelte Save')).toBeVisible();

    await page.reload();
    await expectFeedReady(page);
    await navButton(page, 'Profil').click();

    const reloadedProfileSection = page
      .locator('.section-card')
      .filter({ hasText: 'Vos informations' });
    await expect(
      reloadedProfileSection.getByText('Non renseigné — Architecte Svelte')
    ).toBeVisible();
    await expect(reloadedProfileSection.getByText('Svelte Save')).toBeVisible();
  });

  test('profile keywords editor adds and removes technologies', async ({ page }) => {
    await navButton(page, 'Profil').click();
    await page.getByRole('button', { name: 'Modifier le profil' }).first().click();

    const profileSection = page.locator('.section-card').filter({ hasText: 'Vos informations' });
    const keywordInput = page.locator('#profile-keywords-input');
    await expect(keywordInput).toBeVisible();
    await keywordInput.fill('TypeScript E2E');
    await page.keyboard.press('Enter');
    await expect(profileSection.getByRole('button', { name: 'TypeScript E2E' })).toBeVisible();

    await profileSection.getByRole('button', { name: 'TypeScript E2E' }).click();
    await expect(profileSection.getByRole('button', { name: 'TypeScript E2E' })).not.toBeVisible();
  });

  test('adding keyword item via Enter key works', async ({ page }) => {
    await navButton(page, 'Profil').click();
    await page.getByRole('button', { name: 'Modifier le profil' }).first().click();

    const profileSection = page.locator('.section-card').filter({ hasText: 'Vos informations' });
    const keywordInput = page.locator('#profile-keywords-input');
    await keywordInput.fill('Svelte E2E');
    await page.keyboard.press('Enter');
    await expect(profileSection.getByRole('button', { name: 'Svelte E2E' })).toBeVisible();
  });

  test('scan frequency slider is visible and adjustable', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();

    await expect(page.getByText('Fréquence', { exact: true })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Fréquence de scan' })).toBeVisible();
    await expect(page.getByText('5 min')).toBeVisible();
    await expect(page.getByText('2h')).toBeVisible();
  });

  test('notifications toggle switches state', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();

    const notificationsSwitch = page.getByRole('switch', { name: 'Activer les notifications' });
    await expect(notificationsSwitch).toBeVisible();

    const initialChecked = await notificationsSwitch.getAttribute('aria-checked');
    await notificationsSwitch.click();
    const newChecked = await notificationsSwitch.getAttribute('aria-checked');
    expect(newChecked).not.toBe(initialChecked);
  });

  test('auto-scan toggle switches state', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();

    const autoScanSwitch = page.getByRole('switch', { name: 'Activer le scan automatique' });
    await expect(autoScanSwitch).toBeVisible();

    const initialChecked = await autoScanSwitch.getAttribute('aria-checked');
    await autoScanSwitch.click();
    const newChecked = await autoScanSwitch.getAttribute('aria-checked');
    expect(newChecked).not.toBe(initialChecked);
  });

  test('disabling auto-scan dims the frequency section', async ({ page }) => {
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
    await page.getByRole('button', { name: 'Settings' }).click();

    await expect(page.getByRole('heading', { name: 'IA locale' })).toBeVisible();
    await expect(
      page.getByText(
        'L’analyse locale utilise Gemini Nano via la Prompt API de Chrome, sans clé API externe.'
      )
    ).toBeVisible();
    await expect(page.getByText('Missions / scan')).toBeVisible();
  });

  test('danger zone shows reset button', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();

    await expect(page.getByText('Zone dangereuse')).toBeVisible();
    await expect(page.getByText('Réinitialiser tout')).toBeVisible();
  });

  test('clicking reset shows confirmation dialog', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();

    await page.getByText('Réinitialiser tout').click();
    await expect(page.getByText('Suppression irréversible')).toBeVisible();
    await expect(page.getByText('Annuler')).toBeVisible();
    await page.getByText('Annuler').click();
    await expect(page.getByText('Suppression irréversible')).not.toBeVisible();
  });

  test('settings page remains accessible after navigation', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Paramètres' })).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await nav.getByRole('button', { name: 'Feed', exact: true }).click();
    await expect(nav.getByRole('button', { name: 'Feed', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );

    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Paramètres' })).toBeVisible({
      timeout: 2000,
    });
  });

  test('settings page shows export section', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();

    await expect(page.getByText('Export').first()).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole('button', { name: 'JSON' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'CSV' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Markdown' })).toBeVisible();
  });

  test('settings page shows backup section', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();

    await expect(page.getByText('Sauvegarde').first()).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Créer une sauvegarde')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restaurer' })).toBeVisible();
  });
});
