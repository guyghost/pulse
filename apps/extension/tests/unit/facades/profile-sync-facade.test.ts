/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanonicalCandidateProfileDraft } from '../../../src/lib/core/profile-extractors/types';
import {
  ensureLinkedInHostPermission,
  importLinkedInProfile,
  previewLinkedInProfile,
  syncLinkedInProfileImport,
  verifyProfilePage,
} from '../../../src/lib/shell/facades/profile-sync.facade';

/**
 * Regression test for CV-01 (1a).
 *
 * The dev `chrome.runtime.sendMessage` stub returns `null` for any message
 * type without an explicit case (the `default` path). The production service
 * worker can also return unexpected shapes when a handler is absent. The
 * facades must NOT read `.type` off `null` (which throws a TypeError) — they
 * must return a graceful, typed error object so the UI can degrade cleanly.
 */
describe('profile-sync facade — graceful handling of null/unknown bridge responses', () => {
  const draft: CanonicalCandidateProfileDraft = {
    title: 'Lead Frontend',
    summary: '',
    experiences: [],
    skills: [],
    education: [],
    links: [],
    source: 'linkedin',
    confidence: 0.5,
    capturedAt: '2026-06-27T00:00:00.000Z',
    profileUrl: 'https://www.linkedin.com/in/x',
  };

  beforeEach(() => {
    // Mirror the dev `default` stub path: resolve to null instead of a typed
    // BridgeMessage.
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn(async () => null),
      },
    });
  });

  it('previewLinkedInProfile returns a graceful error instead of throwing', async () => {
    await expect(previewLinkedInProfile()).resolves.toEqual({
      extracted: false,
      errorCode: 'unexpected_response',
      errorMessage: expect.any(String),
    });
  });

  it('importLinkedInProfile returns a graceful error instead of throwing', async () => {
    await expect(importLinkedInProfile()).resolves.toEqual({
      imported: false,
      errorCode: 'unexpected_response',
      errorMessage: expect.any(String),
    });
  });

  it('syncLinkedInProfileImport returns a graceful error instead of throwing', async () => {
    await expect(syncLinkedInProfileImport(draft)).resolves.toEqual({
      imported: false,
      errorCode: 'unexpected_response',
      errorMessage: expect.any(String),
    });
  });

  it('verifyProfilePage returns a graceful blocked result instead of throwing', async () => {
    await expect(verifyProfilePage('https://www.linkedin.com/in/x', [])).resolves.toEqual({
      read: expect.objectContaining({ status: 'blocked' }),
      comparisons: [],
      summary: { matches: 0, mismatches: 0, missing: 0 },
    });
  });
});

describe('profile-sync facade — ensureLinkedInHostPermission (side-panel permission gate)', () => {
  const linkedinOrigin = { origins: ['https://www.linkedin.com/*'] };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true without requesting when the LinkedIn origin is already granted', async () => {
    const contains = vi.fn(async () => true);
    const request = vi.fn(async () => true);
    vi.stubGlobal('chrome', { permissions: { contains, request } });

    await expect(ensureLinkedInHostPermission()).resolves.toBe(true);
    expect(contains).toHaveBeenCalledWith(linkedinOrigin);
    expect(request).not.toHaveBeenCalled();
  });

  it('requests the LinkedIn origin when not yet granted and returns true on accept', async () => {
    const contains = vi.fn(async () => false);
    const request = vi.fn(async () => true);
    vi.stubGlobal('chrome', { permissions: { contains, request } });

    await expect(ensureLinkedInHostPermission()).resolves.toBe(true);
    expect(contains).toHaveBeenCalledWith(linkedinOrigin);
    expect(request).toHaveBeenCalledWith(linkedinOrigin);
  });

  it('returns false when the user denies the LinkedIn origin prompt', async () => {
    const contains = vi.fn(async () => false);
    const request = vi.fn(async () => false);
    vi.stubGlobal('chrome', { permissions: { contains, request } });

    await expect(ensureLinkedInHostPermission()).resolves.toBe(false);
    expect(request).toHaveBeenCalledWith(linkedinOrigin);
  });

  it('returns false when chrome.permissions is unavailable (permissions API missing)', async () => {
    vi.stubGlobal('chrome', { runtime: {} });

    await expect(ensureLinkedInHostPermission()).resolves.toBe(false);
  });
});
