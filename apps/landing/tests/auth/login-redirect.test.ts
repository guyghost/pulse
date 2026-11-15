import { describe, expect, it } from 'vitest';
import { normalizeLoginRedirect } from '#lib/auth/login-redirect.js';

describe('normalizeLoginRedirect', () => {
  it.each([
    '/dashboard?tab=billing',
    '/extension/connect?linkId=6fdb11b8-1806-4f4a-b980-802f22f707d4',
    '/api/copilot/link?state=valid',
  ])('preserves an internal login destination backed by a route: %s', (destination) => {
    expect(normalizeLoginRedirect(destination)).toBe(destination);
  });

  it.each([null, '', 'https://evil.example', '//evil.example', '/not-a-route'])(
    'falls back to the dashboard for an unsafe or unresolved destination: %s',
    (destination) => {
      expect(normalizeLoginRedirect(destination)).toBe('/dashboard');
    }
  );
});
