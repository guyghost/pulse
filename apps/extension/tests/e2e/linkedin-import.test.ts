import { expect, test, type Page } from '@playwright/test';
import { SIDE_PANEL } from './helpers';

const linkedInProfile = {
  title: 'Consultant Svelte senior',
  summary: 'Architecture Svelte, TypeScript et design systems produit.',
  experiences: [
    {
      title: 'Lead Frontend',
      company: 'Atelier Nova',
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

type LinkedInBridgeMode = 'success' | 'session-required';

async function mockAuthenticatedLinkedInBridge(page: Page, mode: LinkedInBridgeMode) {
  await page.addInitScript(
    ({ bridgeMode, profile }) => {
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

            if (message.type === 'PREVIEW_LINKEDIN_PROFILE') {
              if (bridgeMode === 'session-required') {
                return {
                  type: 'LINKEDIN_PROFILE_PREVIEWED',
                  payload: {
                    extracted: false,
                    errorCode: 'session_required',
                    errorMessage: 'Session LinkedIn requise.',
                  },
                };
              }

              return {
                type: 'LINKEDIN_PROFILE_PREVIEWED',
                payload: { extracted: true, profile },
              };
            }

            if (message.type === 'SYNC_LINKEDIN_PROFILE_IMPORT') {
              return {
                type: 'LINKEDIN_PROFILE_IMPORTED',
                payload: { imported: true, profile },
              };
            }

            return originalSendMessage.call(chromeApi.runtime, message);
          };
        },
      });
    },
    { bridgeMode: mode, profile: linkedInProfile }
  );
}

async function openCvPage(page: Page) {
  await page.goto(SIDE_PANEL);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('button', { name: 'CV' })).toBeVisible();
  await nav.getByRole('button', { name: 'CV' }).click();
  await expect(page.getByRole('heading', { name: 'Homogénéiser le profil partout' })).toBeVisible();
}

test.describe('LinkedIn profile import flow', () => {
  test('previews a LinkedIn profile before syncing it to the connected dashboard', async ({
    page,
  }) => {
    await mockAuthenticatedLinkedInBridge(page, 'success');
    await openCvPage(page);

    await page.getByRole('button', { name: 'Prévisualiser LinkedIn' }).click();

    await expect(page.getByRole('heading', { name: 'Preview LinkedIn' })).toBeVisible();
    await expect(page.getByText('Consultant Svelte senior')).toBeVisible();
    await expect(page.getByText('Architecture Svelte, TypeScript')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Synchroniser le CV' })).toBeVisible();

    await page.getByRole('button', { name: 'Synchroniser le CV' }).click();

    await expect(page.getByRole('heading', { name: 'Import LinkedIn' })).toBeVisible();
    await expect(page.getByText('Profil CV synchronisé dans Supabase.')).toBeVisible();
  });

  test('shows typed LinkedIn preview errors without syncing', async ({ page }) => {
    await mockAuthenticatedLinkedInBridge(page, 'session-required');
    await openCvPage(page);

    await page.getByRole('button', { name: 'Prévisualiser LinkedIn' }).click();

    await expect(page.getByRole('heading', { name: 'Preview LinkedIn' })).toBeVisible();
    await expect(page.getByText('session_required: Session LinkedIn requise.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Synchroniser le CV' })).not.toBeVisible();
  });
});
