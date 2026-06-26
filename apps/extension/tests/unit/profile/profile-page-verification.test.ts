import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyProfilePage } from '../../../src/lib/shell/profile/profile-page-verification';

describe('profile page verification shell', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches from the shell and returns comparisons without raw page text', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response('<html><body>Lead Svelte senior</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await verifyProfilePage('https://www.linkedin.com/in/example/', [
      { id: 'title', label: 'Titre', value: 'Lead Svelte' },
    ]);

    expect(fetchMock).toHaveBeenCalledWith('https://www.linkedin.com/in/example/', {
      credentials: 'include',
      redirect: 'follow',
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    expect(result).toEqual({
      read: { status: 'available', finalUrl: 'https://www.linkedin.com/in/example/' },
      comparisons: [{ fieldId: 'title', label: 'Titre', expected: 'Lead Svelte', status: 'match' }],
      summary: { matches: 1, mismatches: 0, missing: 0 },
    });
    expect('text' in result.read).toBe(false);
  });

  it('classifies login-like pages as auth-required', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => {
        return new Response('<html><body>Email address Mot de passe</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      })
    );

    const result = await verifyProfilePage('https://www.linkedin.com/login', [
      { id: 'title', label: 'Titre', value: 'Lead Svelte' },
    ]);

    expect(result).toEqual({
      read: { status: 'auth-required', finalUrl: 'https://www.linkedin.com/login' },
      comparisons: [],
      summary: { matches: 0, mismatches: 0, missing: 0 },
    });
  });

  it('classifies non-html responses as blocked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => {
        return new Response('{"blocked":true}', {
          status: 403,
          headers: { 'content-type': 'application/json' },
        });
      })
    );

    const result = await verifyProfilePage('https://example.com/profile', []);

    expect(result.read).toEqual({
      status: 'blocked',
      finalUrl: 'https://example.com/profile',
      reason: 'HTTP 403, content-type application/json',
    });
  });
});
