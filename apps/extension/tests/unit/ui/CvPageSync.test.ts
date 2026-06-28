/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick } from 'svelte';
import {
  initToastService,
  getToastActor,
  stopToastService,
} from '../../../src/lib/shell/notifications/toast-service';

vi.mock('../../../src/lib/shell/messaging/bridge', () => {
  const mockProfile = {
    firstName: 'Guy',
    stack: ['Svelte', 'TypeScript'],
    tjmMin: 650,
    tjmMax: 900,
    location: 'Paris',
    remote: 'hybrid',
    seniority: 'senior',
    jobTitle: 'Lead Frontend',
    searchKeywords: ['mission svelte'],
  };
  const mockDraft = {
    title: 'Lead Frontend Svelte',
    summary: 'Architecte front-end Svelte.',
    experiences: [],
    skills: [],
    education: [],
    links: [],
    source: 'linkedin',
    confidence: 0.92,
    capturedAt: '2026-06-27T00:00:00.000Z',
    profileUrl: 'https://www.linkedin.com/in/dev-preview',
  };
  return {
    sendMessage: vi.fn(async (message: { type: string }) => {
      switch (message.type) {
        case 'GET_PROFILE':
          return { type: 'PROFILE_RESULT', payload: mockProfile };
        case 'PREVIEW_LINKEDIN_PROFILE':
          return {
            type: 'LINKEDIN_PROFILE_PREVIEWED',
            payload: { extracted: true, profile: mockDraft },
          };
        case 'SYNC_LINKEDIN_PROFILE_IMPORT':
          return {
            type: 'LINKEDIN_PROFILE_IMPORTED',
            payload: {
              imported: false,
              errorCode: 'sync_unavailable',
              errorMessage:
                'La synchronisation LinkedIn nécessite un compte connecté. L\u2019aperçu reste disponible pour une mise à jour manuelle.',
            },
          };
        case 'OPEN_EXTERNAL_URL':
          return { type: 'EXTERNAL_URL_OPENED', payload: { opened: true } };
        default:
          return { type: 'UNKNOWN' };
      }
    }),
    subscribeMessages: () => () => {},
  };
});

import CvPage from '../../../src/ui/pages/CvPage.svelte';

/**
 * Regression for CV-01 (1c): when the LinkedIn profile sync is unavailable
 * (no connected account / no sync backend), CvPage must show an informational
 * toast — not an error — so the user understands the preview is still usable
 * for a manual update.
 */
describe('CvPage LinkedIn sync unavailable', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    initToastService();
  });

  afterEach(() => {
    stopToastService();
  });

  async function mountAndLoad() {
    const target = document.createElement('div');
    document.body.appendChild(target);
    mount(CvPage, { target });
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await tick();
    return target;
  }

  async function flush() {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await tick();
  }

  it('shows an info toast (not error) when sync is unavailable', async () => {
    const target = await mountAndLoad();

    // Trigger the LinkedIn preview so "Enregistrer comme source" appears.
    const previewBtn = [...target.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Prévisualiser')
    );
    expect(previewBtn).toBeTruthy();
    previewBtn!.click();
    await flush();

    // Click "Enregistrer comme source" to trigger the sync.
    const syncBtn = [...target.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Enregistrer comme source')
    );
    expect(syncBtn).toBeTruthy();
    syncBtn!.click();
    await flush();

    const toasts = getToastActor()?.toasts ?? [];
    expect(toasts.filter((t) => t.toastType === 'info').length).toBeGreaterThan(0);
    expect(toasts.filter((t) => t.toastType === 'error').length).toBe(0);
  });
});
