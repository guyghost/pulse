import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanonicalCandidateProfileDraft } from '../../../src/lib/core/profile-extractors/types';
import { createCvImportStore } from '../../../src/lib/state/cv-import.svelte';

const facade = vi.hoisted(() => ({
  ensureLinkedInHostPermission: vi.fn(),
  importLinkedInProfile: vi.fn(),
  syncLinkedInProfileImport: vi.fn(),
  getProfile: vi.fn(),
}));
vi.mock('../../../src/lib/shell/facades/profile-sync.facade', () => facade);
vi.mock('../../../src/lib/shell/facades/settings.facade', () => ({
  getProfile: facade.getProfile,
}));

const experience = {
  title: 'Developer',
  company: 'A',
  employmentType: null,
  location: null,
  startDate: '2023-01',
  endDate: null,
  isCurrent: true,
  description: 'First description',
  skills: ['TypeScript'],
  source: 'linkedin',
  sourceExternalId: 'linkedin-experience-0',
  positionIndex: 0,
};
const profile: CanonicalCandidateProfileDraft = {
  title: '',
  summary: '',
  experiences: [
    experience,
    {
      ...experience,
      sourceExternalId: 'linkedin-experience-1',
      description: 'Second description',
      skills: ['React'],
    },
  ],
  skills: [],
  education: [],
  links: [],
  source: 'linkedin',
  confidence: 1,
  capturedAt: '',
  profileUrl: '',
};

beforeEach(() => {
  vi.resetAllMocks();
  facade.ensureLinkedInHostPermission.mockResolvedValue(true);
  facade.importLinkedInProfile.mockResolvedValue({ imported: true, profile });
  facade.getProfile.mockResolvedValue({ experiences: [] });
  facade.syncLinkedInProfileImport.mockResolvedValue({ imported: true, profile, addedCount: 1 });
});

describe('grouped LinkedIn selection', () => {
  it('previews, selects, submits and counts a duplicate identity only once', async () => {
    const store = createCvImportStore(vi.fn());
    await store.extract();
    expect(store.rows).toHaveLength(1);
    expect(store.selected).toEqual([0]);
    expect(store.rows[0].proposed.skills).toEqual(['TypeScript', 'React']);
    expect(store.rows[0].proposed.description).toBe('Second description');
    expect(facade.syncLinkedInProfileImport).not.toHaveBeenCalled();
    store.toggle(0);
    await store.confirm();
    expect(facade.syncLinkedInProfileImport).not.toHaveBeenCalled();
    store.toggle(0);
    await store.confirm();
    expect(facade.syncLinkedInProfileImport).toHaveBeenCalledOnce();
    expect(facade.syncLinkedInProfileImport.mock.calls[0][0].experiences).toEqual([
      expect.objectContaining({
        description: 'Second description',
        skills: ['TypeScript', 'React'],
      }),
    ]);
    expect(store.status).toBe('1 expérience validée et enregistrée.');
  });
});

it('keeps a successful import completed when profile refresh fails and prevents duplicate retry', async () => {
  const store = createCvImportStore(vi.fn());
  await store.extract();
  facade.getProfile.mockRejectedValueOnce(new Error('read failed'));
  await store.confirm();
  expect(store.error).toBe('');
  expect(store.status).toContain('1 expérience validée et enregistrée.');
  expect(store.status).toContain('n’a pas pu être actualisé');
  expect(store.draft).toBeNull();
  expect(store.selected).toEqual([]);
  await store.confirm();
  expect(facade.syncLinkedInProfileImport).toHaveBeenCalledOnce();
});
it('keeps the draft retryable when the commit itself fails', async () => {
  const store = createCvImportStore(vi.fn());
  await store.extract();
  facade.syncLinkedInProfileImport.mockResolvedValueOnce({
    imported: false,
    errorMessage: 'Save failed',
  });
  await store.confirm();
  expect(store.error).toBe('Save failed');
  expect(store.draft).not.toBeNull();
  expect(store.selected).toEqual([0]);
});
