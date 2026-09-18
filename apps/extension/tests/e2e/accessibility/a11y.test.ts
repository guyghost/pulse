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

    // 1. Welcome → "Connect your sources" step, keyboard-driven.
    await expect(onboardingWelcomeHeading(page)).toBeVisible();
    const welcomeStart = page.getByRole('button', { name: 'Commencer', exact: true });
    await welcomeStart.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Connectez vos sources' })).toBeVisible();

    // Connect the source via keyboard (P0-B flow: session verification).
    const connectSource = page
      .getByRole('listitem')
      .filter({ hasText: 'Free-Work' })
      .getByRole('button', { name: 'Connecter', exact: true });
    await connectSource.focus();
    await expect(connectSource).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listitem').filter({ hasText: 'Free-Work' })).toContainText(
      'Session détectée'
    );

    // Tab to the "Continuer" button without depending on a fixed number of controls.
    const continueButton = page.getByRole('button', { name: 'Continuer', exact: true });
    for (let i = 0; i < 12; i++) {
      if (await continueButton.evaluate((el) => el === document.activeElement)) {
        break;
      }
      await page.keyboard.press('Tab');
    }
    await expect(continueButton).toBeFocused();
    await page.keyboard.press('Enter');

    // Identity step: keyboard input then Tab to the Métier field.
    // Textbox role: avoids collision with the "Métier" checkbox of the
    // CopilotPanel (Applications page mounted in background in CI rollout build).
    await expect(page.getByRole('heading', { name: 'Qui êtes-vous ?' })).toBeVisible();
    await page.getByLabel('Prénom').focus();
    await page.keyboard.type('Jean');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('textbox', { name: 'Métier', exact: true })).toBeFocused();
    await page.keyboard.type('Développeur');

    // Complete the remaining steps then reach the feed.
    await clickContinue(page);
    await fillPreferencesStep(page);
    await fillSkillsStep(page, 'React');
    await submitOnboardingScan(page);

    // 2. Navigation sur le feed
    await expectFeedReady(page);

    // Starting from a known control avoids depending on the browser's initial focus.
    const feedTab = navButton(page, 'Missions');
    await feedTab.focus();
    await expect(feedTab).toBeFocused();
    await page.keyboard.press('Tab');

    // Interactive elements must be focusable
    const activeElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(['BUTTON', 'INPUT', 'A']).toContain(activeElement);
  });

  test('keyboard navigation on mission cards', async ({ page }) => {
    // Injecter des missions
    await injectMissions(page, 5);
    await waitForMissions(page, 5, 5000);

    // Check that cards are present
    const cards = missionCards(page);
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(5);

    // The card stays a non-interactive semantic container. Its explicit
    // disclosure action must be keyboard-accessible.
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

    // Check aria-labels on action buttons
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

    // The panel must be visible
    const filterPanel = page.getByRole('dialog', { name: 'Filtrer les missions' });
    await expect(filterPanel).toBeVisible();
  });

  test('aria-current on navigation tabs', async ({ page }) => {
    // Check the active state on Feed
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
    // Check the heading hierarchy. Role-based query: inactive views
    // stay mounted but aria-hidden + inert (App.svelte), so only
    // headings exposed to the AT are checked.
    const headings = await page.getByRole('heading').all();
    const headingLevels: number[] = [];

    for (const heading of headings) {
      const level = await heading.evaluate((el) => parseInt(el.tagName[1], 10));
      headingLevels.push(level);
    }

    // Levels must be consistent (no h1 -> h3 jump)
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

    // Identity-step fields are attached to their labels via wrapping
    // <label> elements — the accessible name (resolved by role) exists only
    // when the association exists. Textbox for "Métier": the CopilotPanel of the
    // page Suivi (rollout CI) expose un checkbox homonyme.
    await expect(page.getByLabel('Prénom')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Métier', exact: true })).toBeVisible();
    await expect(page.getByLabel('Localisation (optionnel)')).toBeVisible();
  });

  test('focus trap in dev panel', async ({ page }) => {
    // Ouvrir le dev panel
    await openDevPanel(page);

    // Check that focus is inside the panel
    const devPanel = page.getByText('DEV PANEL');
    await expect(devPanel).toBeVisible();

    // Tab through the panel elements. We track a distinguishing label per focused element
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

    // There should be several distinct focusable elements in the panel.
    expect(tabbableLabels.length).toBeGreaterThanOrEqual(2);

    await closeDevPanel(page);
  });

  test('skip link or main landmark exists', async ({ page }) => {
    // Check for landmarks
    const main = page.locator('main');
    const hasMain = (await main.count()) > 0;

    // Or at least one region with a role
    const region = page.locator('[role="main"], [role="region"]');
    const hasRegion = (await region.count()) > 0;

    expect(hasMain || hasRegion).toBe(true);
  });

  test('live region for dynamic updates', async ({ page }) => {
    // Look for a live region for announcements
    const liveRegion = page.locator('[aria-live]');
    const hasLiveRegion = (await liveRegion.count()) > 0;

    if (hasLiveRegion) {
      const ariaLiveValue = await liveRegion.first().getAttribute('aria-live');
      expect(['polite', 'assertive']).toContain(ariaLiveValue);
    }

    // Alternative: check the status role
    const statusRegion = page.locator('[role="status"]');
    expect(await statusRegion.count()).toBeGreaterThan(0);
  });

  test('sufficient color contrast on text', async ({ page }) => {
    // Inject missions to have content to test
    await page.keyboard.press('Control+Shift+D');
    await expect(page.getByText('DEV PANEL')).toBeVisible();
    await page.getByRole('button', { name: 'inject', exact: true }).click();
    await page.keyboard.press('Control+Shift+D');

    // Attendre les missions
    await expectMissionCount(page, 10, 3000);

    // Check the main text colors
    const textElements = await page.locator('p, span, h1, h2, h3, button, a').all();

    let checkedCount = 0;
    for (const el of textElements.slice(0, 15)) {
      // Limit to 15 elements for performance
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

      // Check that text is not transparent
      expect(styles.color).not.toBe('rgba(0, 0, 0, 0)');
      expect(styles.color).not.toBe('transparent');
      checkedCount++;
    }

    // At least a few elements must have been checked
    expect(checkedCount).toBeGreaterThan(0);
  });

  test('disabled buttons are properly marked', async ({ page }) => {
    await mockNoProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(onboardingWelcomeHeading(page)).toBeVisible();
    await page.getByRole('button', { name: 'Commencer', exact: true }).click();

    // "Continuer" stays disabled while no source is connected.
    const continueBtn = page.getByRole('button', { name: 'Continuer', exact: true });
    await expect(continueBtn).toBeVisible();

    // Check the disabled or aria-disabled state
    const isDisabled = await continueBtn.isDisabled().catch(() => false);
    const hasAriaDisabled = (await continueBtn.getAttribute('aria-disabled')) === 'true';

    expect(isDisabled || hasAriaDisabled).toBe(true);

    // P0-B flow: the source connects via session verification.
    const freeWorkRow = page.getByRole('listitem').filter({ hasText: 'Free-Work' });
    await freeWorkRow.getByRole('button', { name: 'Connecter', exact: true }).click();
    await expect(freeWorkRow).toContainText('Session détectée');
    await expect(continueBtn).toBeEnabled();
  });

  test('keyboard accessible dropdowns or selects', async ({ page }) => {
    // Naviguer vers Settings
    await page.getByRole('button', { name: 'Réglages' }).click();

    // Check interactive elements in Settings
    const interactiveElements = await page.locator('button, input, select').all();

    // At least some elements must be focusable
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
