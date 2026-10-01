import { test, expect } from './fixtures';
import { dismissFeedTour, missionCards } from './helpers';
for (const width of [320, 400]) {
  test(`daily feed commands, modal keyboard and application confirmation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await dismissFeedTour(page);
    const card = missionCards(page).first();
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: /Afficher les détails de la mission/ }).click();

    await card.getByRole('button', { name: 'Pertinent', exact: true }).click();
    await expect(card.getByRole('button', { name: 'Pertinent', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await card.getByRole('button', { name: 'Hors cible', exact: true }).click();
    await expect(card.getByRole('button', { name: 'Hors cible', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await card.getByRole('button', { name: 'Effacer le retour' }).click();
    await expect(card.getByRole('button', { name: 'Pertinent', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    await card.getByRole('button', { name: 'Ouvrir pour postuler', exact: true }).click();
    await expect(card.getByText('Sélectionnée', { exact: true })).toBeVisible();
    await expect(card.getByText('Envoyée', { exact: true })).toHaveCount(0);
    await card.getByRole('button', { name: 'J’ai envoyé ma candidature', exact: true }).click();
    await expect(card.getByText('Envoyée', { exact: true })).toBeVisible();
    const trigger = page.getByRole('button', { name: 'Afficher les filtres', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Filtrer les missions' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('f');
    await expect(dialog.getByRole('button', { name: 'Favoris', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    for (let index = 0; index < 30; index++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
        true
      );
    }
    await dialog.getByLabel('Note minimale').selectOption('good');
    await dialog.getByLabel('Trier les missions').selectOption('personalized');
    await dialog.getByRole('button', { name: 'Enregistrer la recherche', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Donnez un nom à la recherche.');
    await dialog.getByLabel('Nom de la recherche').fill('Ma veille');
    await dialog.getByRole('button', { name: 'Enregistrer la recherche', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Ma veille', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await dialog.getByRole('button', { name: 'Ma veille', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await trigger.click();
    await dialog
      .getByRole('button', { name: 'Supprimer la recherche Ma veille', exact: true })
      .click();
    await expect(dialog.getByRole('button', { name: 'Ma veille', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await missionCards(page)
      .nth(0)
      .getByRole('button', { name: 'Ajouter la mission à la comparaison', exact: true })
      .click();
    await missionCards(page)
      .nth(1)
      .getByRole('button', { name: 'Ajouter la mission à la comparaison', exact: true })
      .click();
    await expect(page.getByRole('button', { name: 'Comparer', exact: true })).toBeVisible();
    const dock = page.getByTestId('feed-bottom-dock');
    const scroll = page.getByTestId('feed-scroll-container');
    const dockBox = await dock.boundingBox();
    const scrollBox = await scroll.boundingBox();
    expect(scrollBox!.y + scrollBox!.height).toBeLessThanOrEqual(dockBox!.y + 1);
  });
}

test('failed opening and repeated clicks never record sending; failed confirmation stays recoverable', async ({
  page,
}) => {
  await dismissFeedTour(page);
  const card = missionCards(page).first();
  await card.getByRole('button', { name: /Afficher les détails de la mission/ }).click();
  await page.evaluate(() => {
    const runtime = window.chrome.runtime;
    const original = runtime.sendMessage.bind(runtime);
    const counters = { open: 0, transition: 0 };
    Object.assign(window, { __dailyApplicationCounters: counters });
    runtime.sendMessage = async (request: unknown) => {
      const message = request as { type: string; payload?: { missionId: string } };
      if (message.type === 'OPEN_EXTERNAL_URL') {
        counters.open++;
        return { type: 'EXTERNAL_URL_OPENED', payload: { opened: false } };
      }
      if (message.type === 'UPDATE_TRACKING') {
        counters.transition++;
        return {
          type: 'TRACKING_FAILED',
          payload: {
            version: 1,
            code: 'PERSIST_FAILED',
            intent: 'transition',
            missionId: message.payload!.missionId,
            mutationId: null,
            message: 'Impossible d’enregistrer le nouveau statut.',
            recoverable: true,
          },
        };
      }
      return original(request);
    };
  });
  await card.getByTestId('fast-apply-btn').evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(
    page.getByText('Impossible d’ouvrir la plateforme source.', { exact: true })
  ).toBeVisible();
  const counters = await page.evaluate(
    () =>
      (window as unknown as { __dailyApplicationCounters: { open: number; transition: number } })
        .__dailyApplicationCounters
  );
  expect(counters).toEqual({ open: 1, transition: 0 });
  await card.getByRole('button', { name: 'J’ai envoyé ma candidature', exact: true }).click();
  await expect(
    page.getByText('Impossible d’enregistrer le nouveau statut.', { exact: true })
  ).toBeVisible();
  await expect(card.getByText('Envoyée', { exact: true })).toHaveCount(0);
  await expect(
    card.getByRole('button', { name: 'J’ai envoyé ma candidature', exact: true })
  ).toBeEnabled();
});
