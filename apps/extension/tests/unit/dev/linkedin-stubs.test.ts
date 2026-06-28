/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { installChromeStubs } from '../../../src/dev/chrome-stubs';
import type { CanonicalCandidateProfileDraft } from '../../../src/lib/core/profile-extractors/types';

/**
 * Regression test for CV-01 (1b).
 *
 * In dev mode the LinkedIn preview/import/sync messages were unstubbed and
 * fell through to the `default → null` path, so every LinkedIn action on the
 * CV page failed with `unexpected_response`. The stubs must now return a mock
 * CanonicalCandidateProfileDraft so the dev happy-path is exercisable.
 */
describe('dev chrome stub — LinkedIn preview/import/sync', () => {
  beforeEach(() => {
    const globalRecord = globalThis as unknown as Record<string, unknown>;
    delete globalRecord.chrome;
    try {
      window.localStorage?.clear();
    } catch {
      // jsdom without usable localStorage — stub falls back to mock data.
    }
    installChromeStubs();
  });

  it('PREVIEW_LINKEDIN_PROFILE returns a previewed draft', async () => {
    const response = (await chrome.runtime.sendMessage({
      type: 'PREVIEW_LINKEDIN_PROFILE',
    })) as {
      type: string;
      payload: { extracted: boolean; profile?: CanonicalCandidateProfileDraft };
    };

    expect(response.type).toBe('LINKEDIN_PROFILE_PREVIEWED');
    expect(response.payload.extracted).toBe(true);
    assertDraftShape(response.payload.profile);
  });

  it('IMPORT_LINKEDIN_PROFILE returns an imported draft', async () => {
    const response = (await chrome.runtime.sendMessage({
      type: 'IMPORT_LINKEDIN_PROFILE',
    })) as {
      type: string;
      payload: { imported: boolean; profile?: CanonicalCandidateProfileDraft };
    };

    expect(response.type).toBe('LINKEDIN_PROFILE_IMPORTED');
    expect(response.payload.imported).toBe(true);
    assertDraftShape(response.payload.profile);
  });

  it('SYNC_LINKEDIN_PROFILE_IMPORT returns a successful import (dev happy path)', async () => {
    // The SYNC message contract carries the previewed draft (the CvPage only
    // syncs after a successful preview), so the dev stub merges it into the
    // stored profile rather than no-op'ing on a null payload.
    const draft: CanonicalCandidateProfileDraft = {
      title: 'Lead Frontend Svelte',
      summary: 'Architecte front-end Svelte et TypeScript.',
      experiences: [],
      skills: [{ skill: 'Svelte', source: 'linkedin', confidence: 0.95 }],
      education: [],
      links: [],
      source: 'linkedin',
      confidence: 0.9,
      capturedAt: '2026-06-27T00:00:00.000Z',
      profileUrl: 'https://www.linkedin.com/in/dev-preview',
    };

    const response = (await chrome.runtime.sendMessage({
      type: 'SYNC_LINKEDIN_PROFILE_IMPORT',
      payload: { profile: draft },
    })) as {
      type: string;
      payload: { imported: boolean; profile?: CanonicalCandidateProfileDraft };
    };

    expect(response.type).toBe('LINKEDIN_PROFILE_IMPORTED');
    expect(response.payload.imported).toBe(true);
    assertDraftShape(response.payload.profile);
  });
});

function assertDraftShape(profile: CanonicalCandidateProfileDraft | undefined): void {
  expect(profile).toBeDefined();
  const draft = profile as CanonicalCandidateProfileDraft;
  expect(draft).toEqual(
    expect.objectContaining({
      title: expect.any(String),
      summary: expect.any(String),
      experiences: expect.any(Array),
      skills: expect.any(Array),
      education: expect.any(Array),
      links: expect.any(Array),
      source: expect.any(String),
      confidence: expect.any(Number),
      capturedAt: expect.any(String),
      profileUrl: expect.any(String),
    })
  );
}
