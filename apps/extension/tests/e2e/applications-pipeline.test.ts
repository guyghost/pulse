import { expect, test, type Page } from '@playwright/test';
import { SIDE_PANEL } from './helpers';

const mission = {
  id: 'mission-pipeline-1',
  title: 'Mission Svelte dashboard',
  client: 'Atelier Nova',
  description: 'Construire un dashboard SvelteKit connecté.',
  stack: ['Svelte', 'TypeScript'],
  tjm: 720,
  location: 'Paris',
  remote: 'hybrid',
  duration: '3 mois',
  startDate: '2026-06-01',
  publishedAt: '2026-05-22T08:00:00.000Z',
  url: 'https://www.free-work.com/fr/tech-it/svelte/mission/mission-pipeline-1',
  source: 'free-work',
  scrapedAt: '2026-05-22T09:00:00.000Z',
  seniority: 'senior',
  scoreBreakdown: null,
  score: 88,
  semanticScore: null,
  semanticReason: null,
};

async function mockApplicationsPipelineBridge(page: Page) {
  await page.addInitScript(
    ({ missionRow }) => {
      const generatedAsset = {
        id: 'asset-pipeline-1',
        missionId: missionRow.id,
        type: 'pitch',
        content: 'Bonjour, je peux cadrer et livrer votre dashboard SvelteKit connecté.',
        createdAt: 1779436800000,
        modelUsed: 'gemini-nano',
      };
      let tracking = {
        missionId: missionRow.id,
        currentStatus: 'selected',
        history: [
          { from: null, to: 'detected', timestamp: 1779433200000, note: null },
          { from: 'detected', to: 'selected', timestamp: 1779435000000, note: null },
        ],
        generatedAssetIds: [],
        userRating: null,
        notes: '',
        nextActionAt: null,
      };
      let generatedAssets: (typeof generatedAsset)[] = [];
      const bridgeMessages: string[] = [];

      Object.defineProperty(window, '__missionPulseBridgeMessages', {
        configurable: true,
        value: bridgeMessages,
      });

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
            bridgeMessages.push(message.type);

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

            if (message.type === 'GET_FEED_MISSIONS') {
              return { type: 'FEED_MISSIONS_RESULT', payload: [missionRow] };
            }

            if (message.type === 'GET_TRACKINGS') {
              return { type: 'TRACKINGS_RESULT', payload: [tracking] };
            }

            if (message.type === 'GET_GENERATED_ASSETS') {
              return { type: 'GENERATED_ASSETS_RESULT', payload: generatedAssets };
            }

            if (message.type === 'GENERATE_ASSET') {
              generatedAssets = [generatedAsset];
              tracking = {
                ...tracking,
                currentStatus: 'application_prepared',
                generatedAssetIds: [generatedAsset.id],
                history: [
                  ...tracking.history,
                  {
                    from: 'selected',
                    to: 'application_prepared',
                    timestamp: generatedAsset.createdAt,
                    note: 'Candidature préparée par assistant.',
                  },
                ],
              };
              return {
                type: 'GENERATION_RESULT',
                payload: { asset: generatedAsset, creditBalance: 9, creditsConsumed: 1 },
              };
            }

            return originalSendMessage.call(chromeApi.runtime, message);
          };
        },
      });
    },
    { missionRow: mission }
  );
}

test.describe('applications pipeline', () => {
  test('refreshes the prepared pipeline state after generating an application asset', async ({
    page,
  }) => {
    await mockApplicationsPipelineBridge(page);
    await page.goto(SIDE_PANEL);

    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav).toBeVisible();
    await nav.getByRole('button', { name: 'Suivi' }).click();

    await expect(page.getByRole('heading', { name: 'Candidatures' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mission Svelte dashboard' })).toBeVisible();
    await expect(page.getByText('Sélectionnée').first()).toBeVisible();

    await page.getByRole('button', { name: 'Pitch candidature' }).click();

    await expect(page.getByText('Contenu généré')).toBeVisible();
    await expect(page.getByText('Préparée').first()).toBeVisible();
    await expect(page.getByText('Bonjour, je peux cadrer')).toBeVisible();
    await expect(
      page.evaluate(
        () =>
          (window as unknown as { __missionPulseBridgeMessages: string[] })
            .__missionPulseBridgeMessages
      )
    ).resolves.toContain('GENERATE_ASSET');
  });
});
