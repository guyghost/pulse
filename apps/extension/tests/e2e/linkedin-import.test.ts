import { expect, test, type Page } from '@playwright/test';
import { SIDE_PANEL } from './helpers';

const linkedInProfile = {
  title: 'Consultant Svelte senior',
  summary: 'Architecture Svelte, TypeScript et design systems produit.',
  experiences: [
    {
      title: 'Lead Frontend',
      company: 'Atelier Nova',
      employmentType: 'Freelance',
      location: 'Paris',
      startDate: '2024-01-01',
      endDate: null,
      isCurrent: true,
      description: 'Pilotage frontend Svelte.',
      skills: ['Svelte', 'TypeScript'],
      source: 'linkedin',
      sourceExternalId: 'linkedin-experience-0',
      positionIndex: 0,
    },
    {
      title: 'Product Engineer',
      company: 'Studio Kanso',
      employmentType: 'CDI',
      location: 'Lyon',
      startDate: '2021-09-01',
      endDate: '2023-12-31',
      isCurrent: false,
      description: 'Construction d’un design system produit.',
      skills: ['Svelte', 'Design Systems'],
      source: 'linkedin',
      sourceExternalId: 'linkedin-experience-1',
      positionIndex: 1,
    },
  ],
  skills: [
    { skill: 'Svelte', source: 'linkedin', confidence: 0.8 },
    { skill: 'TypeScript', source: 'linkedin', confidence: 0.8 },
  ],
  education: [],
  links: [{ label: 'LinkedIn', url: 'https://www.linkedin.com/in/example/', source: 'linkedin' }],
  source: 'linkedin',
  confidence: 0.86,
  capturedAt: '2026-05-22T10:00:00.000Z',
  profileUrl: 'https://www.linkedin.com/in/example/',
};

const emptyLinkedInProfile = { ...linkedInProfile, experiences: [] };

type LinkedInBridgeMode =
  | 'success'
  | 'empty-success'
  | 'session-required'
  | 'permission-required'
  | 'detail-page-unavailable';

const linkedInPreviewErrors: Record<
  Exclude<LinkedInBridgeMode, 'success' | 'empty-success'>,
  { errorCode: string; errorMessage: string }
> = {
  'session-required': {
    errorCode: 'session_required',
    errorMessage:
      'Votre session LinkedIn a expiré. Reconnectez-vous à LinkedIn puis relancez l’import.',
  },
  'permission-required': {
    errorCode: 'permission_required',
    errorMessage: 'Autorisation LinkedIn refusée.',
  },
  'detail-page-unavailable': {
    errorCode: 'detail_page_unavailable',
    errorMessage:
      'La page complète des expériences LinkedIn n’a pas pu être chargée. Rechargez LinkedIn puis relancez l’import.',
  },
};

async function mockAuthenticatedLinkedInBridge(page: Page, mode: LinkedInBridgeMode) {
  await page.addInitScript(
    ({ bridgeMode, profile, emptyProfile, previewErrors }) => {
      let chromeValue: unknown = undefined;
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
            if (message.type === 'IMPORT_LINKEDIN_PROFILE') {
              if (bridgeMode !== 'success' && bridgeMode !== 'empty-success') {
                const error = previewErrors[bridgeMode];
                return {
                  type: 'LINKEDIN_PROFILE_IMPORTED',
                  payload: {
                    imported: false,
                    errorCode: error.errorCode,
                    errorMessage: error.errorMessage,
                  },
                };
              }

              return {
                type: 'LINKEDIN_PROFILE_IMPORTED',
                payload: {
                  imported: true,
                  profile: bridgeMode === 'empty-success' ? emptyProfile : profile,
                },
              };
            }

            if (message.type === 'SYNC_LINKEDIN_PROFILE_IMPORT') {
              return originalSendMessage.call(chromeApi.runtime, message);
            }

            return originalSendMessage.call(chromeApi.runtime, message);
          };
        },
      });
    },
    {
      bridgeMode: mode,
      profile: linkedInProfile,
      emptyProfile: emptyLinkedInProfile,
      previewErrors: linkedInPreviewErrors,
    }
  );
}

async function openCvPage(page: Page) {
  await page.goto(SIDE_PANEL);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('button', { name: 'CV' })).toBeVisible();
  await nav.getByRole('button', { name: 'CV' }).click();
  // The CV page was redesigned in PR #198 with a new heading.
  await expect(page.getByRole('heading', { name: 'CV & expériences' })).toBeVisible();
}

test.describe('LinkedIn profile import flow', () => {
  test('imports LinkedIn profile and syncs experiences', async ({ page }) => {
    await mockAuthenticatedLinkedInBridge(page, 'success');
    await openCvPage(page);

    // The new CV page has a direct "Importer LinkedIn" button
    await page.getByRole('button', { name: 'Importer LinkedIn' }).click();

    await expect(page.getByText('2 expériences LinkedIn importées avec succès.')).toBeVisible();
    const freelanceExperience = page.getByRole('article', {
      name: 'Expérience Lead Frontend chez Atelier Nova',
    });
    await expect(freelanceExperience).toBeVisible();
    await expect(freelanceExperience.getByText('Freelance', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('article', { name: 'Expérience Product Engineer chez Studio Kanso' })
    ).toBeVisible();
  });

  test('does not duplicate experiences when the same LinkedIn profile is imported twice', async ({
    page,
  }) => {
    await mockAuthenticatedLinkedInBridge(page, 'success');
    await openCvPage(page);

    const importButton = page.getByRole('button', { name: 'Importer LinkedIn' });
    await importButton.click();
    await expect(page.getByText('2 expériences LinkedIn importées avec succès.')).toBeVisible();
    await expect(importButton).toBeEnabled();

    await importButton.click();

    await expect(
      page.getByText('Vos expériences LinkedIn sont déjà présentes dans votre CV.', { exact: true })
    ).toBeVisible();
    await expect(page.getByText('5 entrées', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('article', { name: 'Expérience Lead Frontend chez Atelier Nova' })
    ).toHaveCount(1);
    await expect(
      page.getByRole('article', { name: 'Expérience Product Engineer chez Studio Kanso' })
    ).toHaveCount(1);
  });

  test('shows a truthful empty-profile outcome without scroll instructions', async ({ page }) => {
    await mockAuthenticatedLinkedInBridge(page, 'empty-success');
    await openCvPage(page);

    await page.getByRole('button', { name: 'Importer LinkedIn' }).click();

    await expect(
      page.getByText('Aucune expérience renseignée sur votre profil LinkedIn.', { exact: true })
    ).toBeVisible();
    await expect(page.getByText(/défilez/i)).toHaveCount(0);
  });

  test('shows typed LinkedIn import errors in toast', async ({ page }) => {
    await mockAuthenticatedLinkedInBridge(page, 'session-required');
    await openCvPage(page);

    await page.getByRole('button', { name: 'Importer LinkedIn' }).click();

    // Error messages now appear as toast notifications
    await expect(
      page.getByText(
        'Votre session LinkedIn a expiré. Reconnectez-vous à LinkedIn puis relancez l’import.',
        { exact: true }
      )
    ).toBeVisible();
  });

  test('shows recovery guidance for missing LinkedIn permissions in toast', async ({ page }) => {
    await mockAuthenticatedLinkedInBridge(page, 'permission-required');
    await openCvPage(page);

    await page.getByRole('button', { name: 'Importer LinkedIn' }).click();

    // Permission errors appear as toast notifications
    await expect(page.getByText('Autorisation LinkedIn refusée.')).toBeVisible();
  });

  test('shows actionable recovery guidance when the LinkedIn detail page is unavailable', async ({
    page,
  }) => {
    await mockAuthenticatedLinkedInBridge(page, 'detail-page-unavailable');
    await openCvPage(page);

    await page.getByRole('button', { name: 'Importer LinkedIn' }).click();

    await expect(
      page.getByText(
        'La page complète des expériences LinkedIn n’a pas pu être chargée. Rechargez LinkedIn puis relancez l’import.',
        { exact: true }
      )
    ).toBeVisible();
  });
});
