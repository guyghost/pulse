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

type LinkedInBridgeMode = 'success' | 'session-required' | 'permission-required';

const linkedInPreviewErrors: Record<
  Exclude<LinkedInBridgeMode, 'success'>,
  { errorCode: string; errorMessage: string }
> = {
  'session-required': {
    errorCode: 'session_required',
    errorMessage: 'Session LinkedIn requise.',
  },
  'permission-required': {
    errorCode: 'permission_required',
    errorMessage: 'Autorisation LinkedIn refusée.',
  },
};

async function mockAuthenticatedLinkedInBridge(page: Page, mode: LinkedInBridgeMode) {
  await page.addInitScript(
    ({ bridgeMode, profile, previewErrors }) => {
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
              if (bridgeMode !== 'success') {
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
                payload: { imported: true, profile },
              };
            }

            if (message.type === 'SYNC_LINKEDIN_PROFILE_IMPORT') {
              return {
                type: 'LINKEDIN_PROFILE_IMPORTED',
                payload: { imported: true, profile, addedCount: 1 },
              };
            }

            return originalSendMessage.call(chromeApi.runtime, message);
          };
        },
      });
    },
    { bridgeMode: mode, profile: linkedInProfile, previewErrors: linkedInPreviewErrors }
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

    // After successful import, a success toast appears (count-aware: 1 new)
    await expect(page.getByText('1 expérience LinkedIn importée avec succès.')).toBeVisible();
  });

  test('shows typed LinkedIn import errors in toast', async ({ page }) => {
    await mockAuthenticatedLinkedInBridge(page, 'session-required');
    await openCvPage(page);

    await page.getByRole('button', { name: 'Importer LinkedIn' }).click();

    // Error messages now appear as toast notifications
    await expect(page.getByText('Session LinkedIn requise.')).toBeVisible();
  });

  test('shows recovery guidance for missing LinkedIn permissions in toast', async ({ page }) => {
    await mockAuthenticatedLinkedInBridge(page, 'permission-required');
    await openCvPage(page);

    await page.getByRole('button', { name: 'Importer LinkedIn' }).click();

    // Permission errors appear as toast notifications
    await expect(page.getByText('Autorisation LinkedIn refusée.')).toBeVisible();
  });
});
