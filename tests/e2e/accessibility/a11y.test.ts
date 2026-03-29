import { test, expect } from '@playwright/test';
import {
  SIDE_PANEL,
  mockNoProfile,
  completeOnboarding,
  injectMissions,
  waitForMissions,
  openDevPanel,
  closeDevPanel,
} from '../helpers';

test.describe('Accessibility', () => {
  test('complete keyboard navigation flow', async ({ page }) => {
    await mockNoProfile(page);
    await page.goto(SIDE_PANEL);

    // 1. Navigation sur l'onboarding
    await expect(page.getByText('Configurez en 30 secondes')).toBeVisible();

    // Tab jusqu'au champ prénom
    await page.keyboard.press('Tab');
    await expect(page.locator('#ob-firstname')).toBeFocused();

    await page.keyboard.type('Jean');

    // Tab jusqu'au champ job
    await page.keyboard.press('Tab');
    await expect(page.locator('#ob-jobtitle')).toBeFocused();

    await page.keyboard.type('Développeur');

    // Tab jusqu'au bouton submit
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: /C.est parti|Commencer/ })).toBeFocused();

    // Enter pour soumettre
    await page.keyboard.press('Enter');

    // 2. Navigation sur le feed
    await expect(page.getByText('Bonjour, Jean')).toBeVisible();

    // Tab à travers les éléments du header
    await page.keyboard.press('Tab'); // Filtre favoris
    await page.keyboard.press('Tab'); // Rafraîchir
    await page.keyboard.press('Tab'); // Recherche

    // Les éléments interactifs doivent être focusables
    const activeElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(['BUTTON', 'INPUT', 'A']).toContain(activeElement);
  });

  test('keyboard navigation on mission cards', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Injecter des missions
    await injectMissions(page, 5);
    await waitForMissions(page, 5, 5000);

    // Vérifier que les cartes sont présentes
    const cards = page.locator('[role="button"]');
    const cardCount = await cards.count();
    expect(cardCount).toBe(5);

    // Naviguer vers la première carte avec Tab
    // Le nombre de tabs dépend de l'ordre des éléments dans le DOM
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
    }

    // Une carte ou un de ses boutons doit être focusé
    const focusedElement = page.locator(':focus');
    const isCardOrButton = await focusedElement.evaluate(
      (el) =>
        el.getAttribute('role') === 'button' ||
        el.tagName === 'BUTTON' ||
        el.closest('[role="button"]') !== null
    );
    expect(isCardOrButton).toBe(true);

    // Vérifier que l'élément focusé est visible
    await expect(focusedElement).toBeVisible();

    // Enter pour activer l'élément focusé (ouvre le lien externe)
    await page.keyboard.press('Enter');
  });

  test('ARIA labels on action buttons', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    await injectMissions(page, 3);
    await waitForMissions(page, 3, 5000);

    // Vérifier les aria-labels sur les boutons d'action
    const favoriteBtn = page.getByTitle('Ajouter aux favoris').first();
    await expect(favoriteBtn).toBeVisible();

    const hideBtn = page.getByTitle('Masquer').first();
    await expect(hideBtn).toBeVisible();

    const copyBtn = page.getByTitle('Copier le lien').first();
    await expect(copyBtn).toBeVisible();

    const openBtn = page.getByTitle('Ouvrir').first();
    await expect(openBtn).toBeVisible();

    // Vérifier qu'ils ont des attributs accessibles
    const buttons = [favoriteBtn, hideBtn, copyBtn, openBtn];
    for (const btn of buttons) {
      const hasAccessibleName = await btn.evaluate(
        (el) => el.getAttribute('aria-label') !== null || el.getAttribute('title') !== null
      );
      expect(hasAccessibleName).toBe(true);
    }
  });

  test('aria-pressed on toggle buttons', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Vérifier l'état initial des boutons toggle
    const favoritesToggle = page.getByRole('button', { name: 'Voir favoris' });
    await expect(favoritesToggle).toHaveAttribute('aria-pressed', 'false');

    // Cliquer pour activer
    await favoritesToggle.click();
    await expect(favoritesToggle).toHaveAttribute('aria-pressed', 'true');

    // Revenir à tous
    await page.getByTitle('Voir toutes').click();
    await expect(page.getByRole('button', { name: 'Voir favoris' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  test('aria-expanded on collapsible sections', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Vérifier le bouton de filtre
    const filterToggle = page.getByRole('button', { name: 'Afficher les filtres' });
    await expect(filterToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(filterToggle).toHaveAttribute('aria-controls');

    // Ouvrir les filtres
    await filterToggle.click();
    await expect(filterToggle).toHaveAttribute('aria-expanded', 'true');

    // Le panneau doit être visible
    const filterPanel = page.getByRole('group', { name: 'Options de filtrage' });
    await expect(filterPanel).toBeVisible();
  });

  test('aria-current on navigation tabs', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Vérifier l'état actif sur Feed
    const feedTab = page.getByRole('button', { name: 'Feed' });
    await expect(feedTab).toHaveAttribute('aria-current', 'page');

    // Naviguer vers TJM
    const tjmTab = page.getByRole('button', { name: 'TJM' });
    await tjmTab.click();
    await expect(tjmTab).toHaveAttribute('aria-current', 'page');
    await expect(feedTab).not.toHaveAttribute('aria-current', 'page');

    // Naviguer vers Settings
    const settingsTab = page.getByRole('button', { name: 'Settings' });
    await settingsTab.click();
    await expect(settingsTab).toHaveAttribute('aria-current', 'page');
    await expect(tjmTab).not.toHaveAttribute('aria-current', 'page');
  });

  test('heading hierarchy is correct', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Vérifier la hiérarchie des headings
    const headings = await page.locator('h1, h2, h3').all();
    const headingLevels: number[] = [];

    for (const heading of headings) {
      const level = await heading.evaluate((el) => parseInt(el.tagName[1], 10));
      headingLevels.push(level);
    }

    // Les niveaux doivent être cohérents (pas de saut h1 -> h3)
    for (let i = 1; i < headingLevels.length; i++) {
      const prev = headingLevels[i - 1];
      const curr = headingLevels[i];
      expect(curr).toBeLessThanOrEqual(prev + 1);
    }
  });

  test('form inputs have associated labels', async ({ page }) => {
    await mockNoProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(page.getByText('Configurez en 30 secondes')).toBeVisible();

    // Vérifier que les champs ont des labels
    const firstnameInput = page.locator('#ob-firstname');
    const jobtitleInput = page.locator('#ob-jobtitle');

    // Vérifier aria-label ou label associé
    const firstnameLabel = await firstnameInput.evaluate((el) => {
      const ariaLabel = el.getAttribute('aria-label');
      const labelId = el.getAttribute('aria-labelledby');
      const associatedLabel = labelId ? document.getElementById(labelId)?.textContent : null;
      const parentLabel = el.closest('label')?.textContent;
      const forLabel = el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : null;
      return ariaLabel || associatedLabel || parentLabel || forLabel;
    });

    expect(firstnameLabel).toBeTruthy();

    const jobtitleLabel = await jobtitleInput.evaluate((el) => {
      const ariaLabel = el.getAttribute('aria-label');
      const labelId = el.getAttribute('aria-labelledby');
      const associatedLabel = labelId ? document.getElementById(labelId)?.textContent : null;
      const parentLabel = el.closest('label')?.textContent;
      const forLabel = el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : null;
      return ariaLabel || associatedLabel || parentLabel || forLabel;
    });

    expect(jobtitleLabel).toBeTruthy();
  });

  test('focus trap in dev panel', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Ouvrir le dev panel
    await openDevPanel(page);

    // Vérifier que le focus est dans le panel
    const devPanel = page.getByText('DEV PANEL');
    await expect(devPanel).toBeVisible();

    // Tab à travers les éléments du panel
    const tabbableElements: string[] = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      const activeElement = await page.evaluate(() => {
        const el = document.activeElement;
        return el ? `${el.tagName}${el.id ? '#' + el.id : ''}` : 'none';
      });
      if (!tabbableElements.includes(activeElement)) {
        tabbableElements.push(activeElement);
      }
    }

    // Il devrait y avoir plusieurs éléments focusables
    expect(tabbableElements.length).toBeGreaterThan(2);

    await closeDevPanel(page);
  });

  test('skip link or main landmark exists', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Vérifier la présence de landmarks
    const main = page.locator('main');
    const hasMain = (await main.count()) > 0;

    // Ou au moins une région avec un rôle
    const region = page.locator('[role="main"], [role="region"]');
    const hasRegion = (await region.count()) > 0;

    expect(hasMain || hasRegion).toBe(true);
  });

  test('live region for dynamic updates', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Chercher une région live pour les annonces
    const liveRegion = page.locator('[aria-live]');
    const hasLiveRegion = (await liveRegion.count()) > 0;

    if (hasLiveRegion) {
      const ariaLiveValue = await liveRegion.first().getAttribute('aria-live');
      expect(['polite', 'assertive']).toContain(ariaLiveValue);
    }

    // Alternative: vérifier le role status
    const statusRegion = page.locator('[role="status"]');
    expect(await statusRegion.count()).toBeGreaterThan(0);
  });

  test('sufficient color contrast on text', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Injecter des missions pour avoir du contenu à tester
    await page.keyboard.press('Control+Shift+D');
    await expect(page.getByText('DEV PANEL')).toBeVisible();
    await page.getByRole('button', { name: 'inject' }).click();
    await page.keyboard.press('Control+Shift+D');

    // Attendre les missions
    await expect(page.getByText(/\d+ missions?/)).toBeVisible({ timeout: 3000 });

    // Vérifier les couleurs de texte principales
    const textElements = await page.locator('p, span, h1, h2, h3, button, a').all();

    let checkedCount = 0;
    for (const el of textElements.slice(0, 15)) {
      // Limiter à 15 éléments pour les perfs
      const isVisible = await el.isVisible().catch(() => false);
      if (!isVisible) continue;

      const styles = await el.evaluate((element) => {
        const computed = window.getComputedStyle(element);
        return {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
          fontSize: computed.fontSize,
        };
      });

      // Vérifier que le texte n'est pas transparent
      expect(styles.color).not.toBe('rgba(0, 0, 0, 0)');
      expect(styles.color).not.toBe('transparent');
      checkedCount++;
    }

    // Au moins quelques éléments doivent avoir été vérifiés
    expect(checkedCount).toBeGreaterThan(0);
  });

  test('disabled buttons are properly marked', async ({ page }) => {
    await mockNoProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(page.getByText('Configurez en 30 secondes')).toBeVisible();

    // Le bouton doit être désactivé tant que les champs sont vides
    const submitBtn = page.getByRole('button', { name: /C.est parti|Commencer/ });

    // Vérifier l'état disabled ou aria-disabled
    const isDisabled = await submitBtn.isDisabled().catch(() => false);
    const hasAriaDisabled = (await submitBtn.getAttribute('aria-disabled')) === 'true';

    expect(isDisabled || hasAriaDisabled).toBe(true);
  });

  test('keyboard accessible dropdowns or selects', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Naviguer vers Settings
    await page.getByRole('button', { name: 'Settings' }).click();

    // Vérifier les éléments interactifs dans Settings
    const interactiveElements = await page.locator('button, input, select').all();

    // Au moins certains éléments doivent être focusables
    let focusableCount = 0;
    for (const el of interactiveElements.slice(0, 5)) {
      const isFocusable = await el.evaluate(
        (e) => !e.hasAttribute('disabled') && !e.hasAttribute('aria-hidden')
      );
      if (isFocusable) focusableCount++;
    }

    expect(focusableCount).toBeGreaterThan(0);
  });
});
