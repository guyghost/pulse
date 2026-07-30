import { describe, expect, it, vi } from 'vitest';
import { parseCanonicalPublicOrigin } from '../src/lib/server/public-origin';
import {
  enforceRateLimits,
  hashRateLimitSubject,
  type RateLimitConstraint,
} from '../src/lib/server/rate-limit';
import { readFileSync } from 'node:fs';

describe('canonical public origin', () => {
  it('accepts an exact HTTPS origin', () => {
    expect(parseCanonicalPublicOrigin('https://missionpulse.example')).toBe(
      'https://missionpulse.example'
    );
  });

  it('allows only explicit local HTTP development origins', () => {
    expect(parseCanonicalPublicOrigin('http://localhost:5173')).toBe('http://localhost:5173');
    expect(parseCanonicalPublicOrigin('http://127.0.0.1:5173')).toBe('http://127.0.0.1:5173');
    expect(parseCanonicalPublicOrigin('http://missionpulse.example')).toBeNull();
  });

  it('rejects credentials, query strings and fragments', () => {
    expect(parseCanonicalPublicOrigin('https://user:pass@example.com')).toBeNull();
    expect(parseCanonicalPublicOrigin('https://example.com/path')).toBeNull();
    expect(parseCanonicalPublicOrigin('https://example.com?next=evil')).toBeNull();
    expect(parseCanonicalPublicOrigin('https://example.com#fragment')).toBeNull();
  });
});

describe('extension link rate limiting', () => {
  const constraint: RateLimitConstraint = {
    scope: 'extension_link_start_ip',
    subject: '203.0.113.10',
  };
  const securityConfig = {
    rateLimitHashSecret: 'x'.repeat(32),
    rateLimitWindowSeconds: 600,
    rateLimits: {
      extension_link_start_ip: 10,
      extension_link_start_install: 3,
      extension_link_status_ip: 120,
      extension_link_status_link: 60,
      extension_link_resolution_user: 20,
    },
    retention: {
      rateLimitHours: 24,
      extensionLinkHours: 24,
      terminalCheckoutDays: 90,
      billingEventDays: 395,
    },
  } as const;

  it('hashes subjects deterministically without retaining the raw address', () => {
    const first = hashRateLimitSubject('x'.repeat(32), constraint.scope, constraint.subject);
    const retry = hashRateLimitSubject('x'.repeat(32), constraint.scope, constraint.subject);
    expect(first).toBe(retry);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain(constraint.subject);
  });

  it('allows a request only after an atomic database decision', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { allowed: true, remaining: 9, retry_after_seconds: 600 },
      error: null,
    });
    await expect(
      enforceRateLimits(
        { rpc } as never,
        [constraint],
        new Date('2026-07-30T12:00:00Z'),
        securityConfig
      )
    ).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith(
      'consume_api_rate_limit',
      expect.objectContaining({
        p_scope: constraint.scope,
        p_limit: 10,
        p_window_seconds: 600,
      })
    );
    expect(rpc.mock.calls[0]?.[1]?.p_subject_hash).not.toContain(constraint.subject);
  });

  it('returns a retry delay on denial and fails closed on storage errors', async () => {
    const deniedRpc = vi.fn().mockResolvedValue({
      data: { allowed: false, remaining: 0, retry_after_seconds: 123 },
      error: null,
    });
    await expect(
      enforceRateLimits({ rpc: deniedRpc } as never, [constraint], new Date(), securityConfig)
    ).resolves.toEqual({ ok: false, kind: 'denied', retryAfterSeconds: 123 });

    const failedRpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'unavailable' } });
    await expect(
      enforceRateLimits({ rpc: failedRpc } as never, [constraint], new Date(), securityConfig)
    ).resolves.toEqual({ ok: false, kind: 'unavailable' });
  });

  it('fails closed without the dedicated server secret', async () => {
    const rpc = vi.fn();
    await expect(
      enforceRateLimits({ rpc } as never, [constraint], new Date(), {
        ...securityConfig,
        rateLimitHashSecret: null,
      })
    ).resolves.toEqual({ ok: false, kind: 'unavailable' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('database hardening contract', () => {
  const migration = readFileSync(
    'supabase/migrations/20260730163000_preproduction_security_hardening.sql',
    'utf8'
  );

  it('keeps rate limit storage and mutation service-only', () => {
    expect(migration).toContain(
      'alter table public.api_rate_limit_buckets enable row level security'
    );
    expect(migration).toContain(
      'revoke all on table public.api_rate_limit_buckets from public, anon, authenticated'
    );
    expect(migration).toContain('revoke execute on function public.consume_api_rate_limit');
    expect(migration).toContain('to service_role');
  });

  it('defines bounded retention without deleting active subscriptions', () => {
    expect(migration).toContain('public.purge_freemium_operational_data');
    expect(migration).toContain("state in ('cancelled', 'expired', 'failed_terminal')");
    expect(migration).toContain('provider_subscription_id is null');
    expect(migration).not.toMatch(
      /delete from public\.subscription_entitlements|delete from public\.platform_account_bindings/
    );
  });
});

describe('server authorization boundaries', () => {
  const authenticatedRoutes = [
    'src/routes/extension/connect/+page.server.ts',
    'src/routes/api/checkout/premium/+server.ts',
    'src/routes/api/checkout/credits/+server.ts',
    'src/routes/dashboard/+page.server.ts',
  ];

  it('uses a server-verified user for private reads and state transitions', () => {
    for (const routePath of authenticatedRoutes) {
      const source = readFileSync(routePath, 'utf8');
      expect(source, routePath).toContain('auth.getUser()');
      if (source.includes('auth.getSession()')) {
        expect(source.indexOf('auth.getUser()'), routePath).toBeLessThan(
          source.indexOf('auth.getSession()')
        );
      }
    }
  });

  it('validates the canonical origin before persisting a link request', () => {
    const source = readFileSync('src/routes/api/extension/link/start/+server.ts', 'utf8');
    expect(source.indexOf('getCanonicalPublicOrigin()')).toBeGreaterThan(-1);
    expect(source.indexOf('getCanonicalPublicOrigin()')).toBeLessThan(
      source.indexOf(".from('extension_link_requests')")
    );
  });

  it('leaves the Chrome Web Store URL empty until an official listing exists', () => {
    expect(readFileSync('.env.example', 'utf8')).toContain('PUBLIC_CHROME_STORE_URL=\n');
    expect(readFileSync('../dashboard/.env.example', 'utf8')).toContain(
      'PUBLIC_CHROME_STORE_URL=\n'
    );
    expect(readFileSync('../../scripts/write-local-supabase-env.mjs', 'utf8')).not.toContain(
      'search/MissionPulse'
    );
  });
});
