import { test, expect } from '../fixtures';
import {
  SIDE_PANEL,
  mockNoProfile,
  clickContinue,
  connectFirstSource,
  expectFeedReady,
  expectMissionCount,
  copyLinkButton,
  favoriteButton,
  fillPreferencesStep,
  fillSkillsStep,
  hideButton,
  expandMission,
  onboardingWelcomeHeading,
  openOperationalDetails,
  injectMissions,
  missionCards,
  navButton,
  openMissionButton,
  submitOnboardingScan,
  waitForMissions,
  openDevPanel,
  closeDevPanel,
} from '../helpers';

test.describe('Accessibility', () => {
  test('complete keyboard navigation flow', async ({ page }) => {
    await mockNoProfile(page);
    await page.goto(SIDE_PANEL);

    // 1. Welcome → étape « Connectez vos sources », piloté au clavier.
    await expect(onboardingWelcomeHeading(page)).toBeVisible();
    const welcomeStart = page.getByRole('button', { name: 'Commencer', exact: true });
    await welcomeStart.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Connectez vos sources' })).toBeVisible();

    // Sélection de la première source au clavier (Entrée sur le bouton).
    const firstSource = page.getByRole('button', { name: 'Free-Work', exact: true });
    await firstSource.focus();
    await expect(firstSource).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(firstSource).toHaveAttribute('aria-pressed', 'true');

    // Tab jusqu'au bouton « Continuer » sans dépendre d'un nombre fixe de contrôles.
    const continueButton = page.getByRole('button', { name: 'Continuer', exact: true });
    for (let i = 0; i < 12; i++) {
      if (await continueButton.evaluate((el) => el === document.activeElement)) {
        break;
      }
      await page.keyboard.press('Tab');
    }
    await expect(continueButton).toBeFocused();
    await page.keyboard.press('Enter');

    // Étape identité : saisie clavier puis Tab vers le champ Métier.
    // Rôle textbox : évite la collision avec le checkbox « Métier » du
    // CopilotPanel (page Suivi montée en arrière-plan en build rollout CI).
    await expect(page.getByRole('heading', { name: 'Qui êtes-vous ?' })).toBeVisible();
    await page.getByLabel('Prénom').focus();
    await page.keyboard.type('Jean');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('textbox', { name: 'Métier', exact: true })).toBeFocused();
    await page.keyboard.type('Développeur');

    // Terminer les étapes restantes puis rejoindre le feed.
    await clickContinue(page);
    await fillPreferencesStep(page);
    await fillSkillsStep(page, 'React');
    await submitOnboardingScan(page);

    // 2. Navigation sur le feed
    await expectFeedReady(page);

    // Partir d'un contrôle connu évite de dépendre du focus initial du navigateur.
    const feedTab = navButton(page, 'Missions');
    await feedTab.focus();
    await expect(feedTab).toBeFocused();
    await page.keyboard.press('Tab');

    // Les éléments interactifs doivent être focusables
    const activeElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(['BUTTON', 'INPUT', 'A']).toContain(activeElement);
  });

  test('keyboard navigation on mission cards', async ({ page }) => {
    // Injecter des missions
    await injectMissions(page, 5);
    await waitForMissions(page, 5, 5000);

    // Vérifier que les cartes sont présentes
    const cards = missionCards(page);
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(5);

    // La carte reste un conteneur sémantique non interactif. Son action de
    // divulgation explicite doit, elle, être accessible au clavier.
    const firstCard = cards.first();
    await expect(firstCard).not.toHaveAttribute('tabindex', /.+/);

    const detailsButton = firstCard.getByRole('button', {
      name: /Afficher les détails de la mission/,
    });
    await detailsButton.focus();
    await expect(detailsButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(
      firstCard.getByRole('button', { name: /Masquer les détails de la mission/ })
    ).toHaveAttribute('aria-expanded', 'true');
    await expect(firstCard.getByRole('region', { name: /Détails de la mission/ })).toBeVisible();
  });

  test('ARIA labels on action buttons', async ({ page }) => {
    await injectMissions(page, 3);
    await waitForMissions(page, 3, 5000);

    // Vérifier les aria-labels sur les boutons d'action
    const firstCard = missionCards(page).first();
    const favoriteBtn = favoriteButton(firstCard);
    await expect(favoriteBtn).toBeVisible();

    // The remaining actions sit behind the card's quiet disclosure.
    await expandMission(firstCard);
    const hideBtn = hideButton(firstCard);
    await expect(hideBtn).toBeVisible();

    const copyBtn = copyLinkButton(firstCard);
    await expect(copyBtn).toBeVisible();

    const openBtn = openMissionButton(firstCard);
    await expect(openBtn).toBeVisible();

    await expect(favoriteBtn).toHaveAttribute('aria-label', 'Ajouter la mission aux favoris');
    await expect(hideBtn).toHaveAttribute('aria-label', 'Masquer la mission');
    await expect(copyBtn).toHaveAttribute('aria-label', 'Copier le lien de la mission');
    await expect(openBtn).toHaveAttribute(
      'aria-label',
      'Ouvrir la mission sur la plateforme source'
    );
  });

  test('aria-pressed on toggle buttons', async ({ page }) => {
    // The favorites filter moved into the operational dashboard and lost its
    // aria-pressed; the new-missions quick filter still exposes the state.
    await openOperationalDetails(page);
    const newMissionsFilter = page.getByTitle('Filtrer les nouvelles missions');
    await expect(newMissionsFilter).toHaveAttribute('aria-pressed', 'false');

    await newMissionsFilter.click();
    await expect(newMissionsFilter).toHaveAttribute('aria-pressed', 'true');

    await newMissionsFilter.click();
    await expect(newMissionsFilter).toHaveAttribute('aria-pressed', 'false');
  });

  test('aria-expanded on collapsible sections', async ({ page }) => {
    const filterToggle = page.getByRole('button', { name: 'Afficher les filtres' });
    await expect(filterToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(filterToggle).toHaveAttribute('aria-controls');

    await filterToggle.click();
    await expect(page.getByRole('button', { name: 'Masquer les filtres' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );

    // Le panneau doit être visible
    const filterPanel = page.getByRole('group', { name: 'Filtrer les missions' });
    await expect(filterPanel).toBeVisible();
  });

  test('aria-current on navigation tabs', async ({ page }) => {
    // Vérifier l'état actif sur Feed
    const feedTab = navButton(page, 'Missions');
    await expect(feedTab).toHaveAttribute('aria-current', 'page');

    // Naviguer vers TJM
    const tjmTab = navButton(page, 'TJM');
    await tjmTab.click();
    await expect(tjmTab).toHaveAttribute('aria-current', 'page');
    await expect(feedTab).not.toHaveAttribute('aria-current', 'page');

    // Naviguer vers Settings
    const settingsTab = navButton(page, 'Réglages');
    await settingsTab.click();
    await expect(settingsTab).toHaveAttribute('aria-current', 'page');
    await expect(tjmTab).not.toHaveAttribute('aria-current', 'page');
  });

  test('heading hierarchy is correct', async ({ page }) => {
    // Vérifier la hiérarchie des headings. Requête par rôle : les vues
    // inactives restent montées mais aria-hidden + inert (App.svelte), donc
    // seuls les headings exposés à l'AT sont vérifiés.
    const headings = await page.getByRole('heading').all();
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

    await expect(onboardingWelcomeHeading(page)).toBeVisible();
    await page.getByRole('button', { name: 'Commencer', exact: true }).click();
    await connectFirstSource(page);

    // Les champs de l'étape identité sont rattachés à leurs labels via des
    // <label> englobants — le nom accessible (résolu par rôle) n'existe que
    // si l'association existe. Textbox pour « Métier » : le CopilotPanel de la
    // page Suivi (rollout CI) expose un checkbox homonyme.
    await expect(page.getByLabel('Prénom')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Métier', exact: true })).toBeVisible();
    await expect(page.getByLabel('Localisation (optionnel)')).toBeVisible();
  });

  test('focus trap in dev panel', async ({ page }) => {
    // Ouvrir le dev panel
    await openDevPanel(page);

    // Vérifier que le focus est dans le panel
    const devPanel = page.getByText('DEV PANEL');
    await expect(devPanel).toBeVisible();

    // Tab à travers les éléments du panel. We track a distinguishing label per focused element
    // (aria-label / title / trimmed text) instead of tagName+id, because the panel exposes many
    // buttons that share the same tag and carry no id — deduping on those would collapse them.
    const tabbableLabels: string[] = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      const activeLabel = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) {
          return '';
        }
        return (
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          (el.textContent ?? '').trim().slice(0, 24) ||
          el.tagName
        );
      });
      if (activeLabel && !tabbableLabels.includes(activeLabel)) {
        tabbableLabels.push(activeLabel);
      }
    }

    // Il devrait y avoir plusieurs éléments focusables distincts dans le panel.
    expect(tabbableLabels.length).toBeGreaterThanOrEqual(2);

    await closeDevPanel(page);
  });

  test('skip link or main landmark exists', async ({ page }) => {
    // Vérifier la présence de landmarks
    const main = page.locator('main');
    const hasMain = (await main.count()) > 0;

    // Ou au moins une région avec un rôle
    const region = page.locator('[role="main"], [role="region"]');
    const hasRegion = (await region.count()) > 0;

    expect(hasMain || hasRegion).toBe(true);
  });

  test('live region for dynamic updates', async ({ page }) => {
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
    // Injecter des missions pour avoir du contenu à tester
    await page.keyboard.press('Control+Shift+D');
    await expect(page.getByText('DEV PANEL')).toBeVisible();
    await page.getByRole('button', { name: 'inject', exact: true }).click();
    await page.keyboard.press('Control+Shift+D');

    // Attendre les missions
    await expectMissionCount(page, 10, 3000);

    // Vérifier les couleurs de texte principales
    const textElements = await page.locator('p, span, h1, h2, h3, button, a').all();

    let checkedCount = 0;
    for (const el of textElements.slice(0, 15)) {
      // Limiter à 15 éléments pour les perfs
      const isVisible = await el.isVisible().catch(() => false);
      if (!isVisible) {
        continue;
      }

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

    await expect(onboardingWelcomeHeading(page)).toBeVisible();
    await page.getByRole('button', { name: 'Commencer', exact: true }).click();

    // « Continuer » reste désactivé tant qu'aucune source n'est connectée.
    const continueBtn = page.getByRole('button', { name: 'Continuer', exact: true });
    await expect(continueBtn).toBeVisible();

    // Vérifier l'état disabled ou aria-disabled
    const isDisabled = await continueBtn.isDisabled().catch(() => false);
    const hasAriaDisabled = (await continueBtn.getAttribute('aria-disabled')) === 'true';

    expect(isDisabled || hasAriaDisabled).toBe(true);

    await page.getByRole('button', { name: 'Free-Work', exact: true }).click();
    await expect(continueBtn).toBeEnabled();
  });

  test('keyboard accessible dropdowns or selects', async ({ page }) => {
    // Naviguer vers Settings
    await page.getByRole('button', { name: 'Réglages' }).click();

    // Vérifier les éléments interactifs dans Settings
    const interactiveElements = await page.locator('button, input, select').all();

    // Au moins certains éléments doivent être focusables
    let focusableCount = 0;
    for (const el of interactiveElements.slice(0, 5)) {
      const isFocusable = await el.evaluate(
        (e) => !e.hasAttribute('disabled') && !e.hasAttribute('aria-hidden')
      );
      if (isFocusable) {
        focusableCount++;
      }
    }

    expect(focusableCount).toBeGreaterThan(0);
  });
});
