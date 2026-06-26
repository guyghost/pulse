import { describe, expect, it } from 'vitest';
import { err, ok } from '../../../src/lib/core/errors/result';
import type { Result } from '../../../src/lib/core/errors/result';
import type { AppError } from '../../../src/lib/core/errors/app-error';
import type { CanonicalCandidateProfileDraft } from '../../../src/lib/core/profile-extractors/types';
import {
  createProfileExtractorRegistry,
  getProfileExtractor,
} from '../../../src/lib/shell/profile-extractors';
import type { PlatformProfileExtractor } from '../../../src/lib/shell/profile-extractors/platform-profile-extractor';
import { createProfileExtractorError } from '../../../src/lib/shell/profile-extractors/profile-extractor-errors';

const candidateDraft: CanonicalCandidateProfileDraft = {
  title: 'Profil test',
  summary: '',
  source: 'other',
  confidence: 0.5,
  capturedAt: '2026-05-22T08:00:00.000Z',
  profileUrl: 'https://example.com/profile',
  experiences: [],
  education: [],
  skills: [],
  links: [],
};

function createExtractor(id: string): PlatformProfileExtractor {
  return {
    id,
    name: id,
    detectSession: async () => ok(true),
    extractProfile: async () => ok(candidateDraft),
  };
}

describe('platform profile extractor registry', () => {
  it('keeps LinkedIn as the default extractor', () => {
    expect(getProfileExtractor('linkedin').id).toBe('linkedin');
  });

  it('supports additional platform extractors without changing the registry implementation', async () => {
    const registry = createProfileExtractorRegistry({
      linkedin: () => createExtractor('linkedin'),
      malt: () => createExtractor('malt'),
    });

    expect(registry.list().map((extractor) => extractor.id)).toEqual(['linkedin', 'malt']);
    await expect(registry.get('malt').detectSession(1779436800000)).resolves.toEqual({
      ok: true,
      value: true,
    });
  });

  it('keeps typed connector errors associated with the extractor platform id', () => {
    const error = createProfileExtractorError(
      'permission_required',
      'Malt permission required.',
      1779436800000,
      { scope: 'profile' },
      'malt'
    );

    expect(error).toMatchObject({
      connectorId: 'malt',
    });
    expect(error.context).toMatchObject({
      profileExtractorCode: 'permission_required',
      scope: 'profile',
    });
  });

  it('lets non-LinkedIn extractors return typed failures', async () => {
    const registry = createProfileExtractorRegistry({
      malt: () => ({
        id: 'malt',
        name: 'Malt',
        detectSession: async () => ok(true),
        extractProfile: async (): Promise<Result<CanonicalCandidateProfileDraft, AppError>> =>
          err<AppError>(
            createProfileExtractorError(
              'profile_not_found',
              'Open a Malt profile before importing.',
              1779436800000,
              {},
              'malt'
            )
          ),
      }),
    });

    const result = await registry.get('malt').extractProfile(1779436800000);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        connectorId: 'malt',
      });
      expect(result.error.context).toMatchObject({
        profileExtractorCode: 'profile_not_found',
      });
    }
  });
});
