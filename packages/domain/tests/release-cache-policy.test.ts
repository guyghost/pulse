import { describe, expect, it } from 'vitest';
import {
  classifyReleaseCache,
  parsePerformanceCacheMode,
  type CacheDecision,
  type CacheRequestFacts,
  type CacheResponseFacts,
} from '../src';

const BASE_REQUEST: CacheRequestFacts = {
  surface: 'landing',
  method: 'GET',
  routeId: '/',
  performanceCacheMode: 'enabled',
  hasAuthorizationHeader: false,
  hasAnyCookieHeader: false,
  hasVerifiedUser: false,
};

const BASE_RESPONSE: CacheResponseFacts = {
  status: 200,
  contentType: 'text/html; charset=utf-8',
  hasSetCookie: false,
  existingCacheControl: null,
  existingVary: null,
};

const classify = (
  request: Partial<CacheRequestFacts> = {},
  response: Partial<CacheResponseFacts> = {}
): CacheDecision =>
  classifyReleaseCache({ ...BASE_REQUEST, ...request }, { ...BASE_RESPONSE, ...response });

const PUBLIC_WITH_NEW_HEADERS: CacheDecision = {
  kind: 'public',
  cacheControl: { action: 'set', value: 'public, max-age=300' },
  vary: { action: 'set', value: 'Cookie, Authorization' },
};

const PRIVATE_WITH_NEW_CACHE_CONTROL: CacheDecision = {
  kind: 'private',
  cacheControl: { action: 'set', value: 'private, no-store' },
  vary: { action: 'preserve', value: null },
};

describe('parsePerformanceCacheMode', () => {
  it('enables public caching only for the exact opt-in value', () => {
    expect(parsePerformanceCacheMode('1')).toBe('enabled');
  });

  it('classifies an absent or explicit zero flag as disabled', () => {
    expect(parsePerformanceCacheMode(undefined)).toBe('disabled');
    expect(parsePerformanceCacheMode('0')).toBe('disabled');
  });

  it.each(['', 'true', '01', 'enabled', ' 1 '])(
    'classifies malformed value %j as unknown',
    (raw) => {
      expect(parsePerformanceCacheMode(raw)).toBe('unknown');
    }
  );
});

describe('classifyReleaseCache — anonymous allowlist', () => {
  it.each(['/', '/privacy', '/login'])(
    'allows landing route %s only with both public header effects',
    (routeId) => {
      expect(classify({ routeId })).toEqual(PUBLIC_WITH_NEW_HEADERS);
    }
  );

  it('allows HEAD with the same safeguards as GET', () => {
    expect(classify({ method: 'HEAD' })).toEqual(PUBLIC_WITH_NEW_HEADERS);
  });

  it.each(['/register', '/register/passkey', '/dashboard', '/api/generate', null])(
    'keeps non-allowlisted route %s private',
    (routeId) => {
      expect(classify({ routeId })).toEqual(PRIVATE_WITH_NEW_CACHE_CONTROL);
    }
  );

  it('keeps the dashboard private even on its root route without auth signals', () => {
    expect(classify({ surface: 'dashboard', routeId: '/' })).toEqual(
      PRIVATE_WITH_NEW_CACHE_CONTROL
    );
  });
});

describe('classifyReleaseCache — request privacy signals', () => {
  it('treats any Cookie header as private, including a non-auth preference cookie', () => {
    expect(classify({ hasAnyCookieHeader: true })).toEqual(PRIVATE_WITH_NEW_CACHE_CONTROL);
  });

  it('treats Authorization as private', () => {
    expect(classify({ hasAuthorizationHeader: true })).toEqual(PRIVATE_WITH_NEW_CACHE_CONTROL);
  });

  it('treats a verified user as private', () => {
    expect(classify({ hasVerifiedUser: true })).toEqual(PRIVATE_WITH_NEW_CACHE_CONTROL);
  });

  it.each(['disabled', 'unknown'] as const)(
    'keeps otherwise eligible HTML private when the performance mode is %s',
    (performanceCacheMode) => {
      expect(classify({ performanceCacheMode })).toEqual(PRIVATE_WITH_NEW_CACHE_CONTROL);
    }
  );

  it.each(['POST', 'PUT', 'DELETE', 'OPTIONS'])('keeps method %s private', (method) => {
    expect(classify({ method })).toEqual(PRIVATE_WITH_NEW_CACHE_CONTROL);
  });

  it('prevents a shared cache from reusing anonymous HTML for Cookie or Authorization requests', () => {
    const anonymous = classify();
    const withCookie = classify({ hasAnyCookieHeader: true });
    const withAuthorization = classify({ hasAuthorizationHeader: true });

    expect(anonymous).toEqual(PUBLIC_WITH_NEW_HEADERS);
    expect(withCookie).toEqual(PRIVATE_WITH_NEW_CACHE_CONTROL);
    expect(withAuthorization).toEqual(PRIVATE_WITH_NEW_CACHE_CONTROL);
  });
});

describe('classifyReleaseCache — response guards', () => {
  it('accepts the exact HTML MIME essence case-insensitively with valid parameters', () => {
    expect(classify({}, { contentType: 'TEXT/HTML; charset=UTF-8' })).toEqual(
      PUBLIC_WITH_NEW_HEADERS
    );
  });

  it.each([201, 204, 301, 302, 304, 400, 404, 500])('keeps HTML status %i private', (status) => {
    expect(classify({}, { status })).toEqual(PRIVATE_WITH_NEW_CACHE_CONTROL);
  });

  it('keeps a response that sets a cookie private', () => {
    expect(classify({}, { hasSetCookie: true })).toEqual(PRIVATE_WITH_NEW_CACHE_CONTROL);
  });

  it('fails closed when Content-Type is absent instead of assuming non-HTML', () => {
    expect(
      classify(
        {},
        {
          contentType: null,
          existingCacheControl: 'public, max-age=86400',
          existingVary: '*',
        }
      )
    ).toEqual({
      kind: 'private',
      cacheControl: { action: 'set', value: 'private, no-store' },
      vary: { action: 'preserve', value: '*' },
    });
  });

  it.each([
    '',
    'not a mime',
    'text/html; charset',
    'text/html; =utf-8',
    'text/html; charset="unterminated',
    'application/text/html',
  ])('fails closed for invalid Content-Type %j', (contentType) => {
    expect(classify({}, { contentType })).toEqual(PRIVATE_WITH_NEW_CACHE_CONTROL);
  });

  it('never treats the distinct valid MIME text/htmlx as HTML', () => {
    expect(classify({}, { contentType: 'text/htmlx' })).toEqual({
      kind: 'non_html',
      cacheControl: null,
      vary: null,
    });
  });

  it.each(['application/json', 'text/css', 'image/svg+xml'])(
    'does not mutate non-HTML content type %s',
    (contentType) => {
      expect(
        classify(
          {},
          {
            contentType,
            existingCacheControl: 'public, max-age=86400',
            existingVary: '*',
          }
        )
      ).toEqual({ kind: 'non_html', cacheControl: null, vary: null });
    }
  );
});

describe('classifyReleaseCache — existing Cache-Control', () => {
  it('preserves a semantically exact public five-minute policy', () => {
    expect(classify({}, { existingCacheControl: 'public, max-age=300' })).toEqual({
      kind: 'public',
      cacheControl: { action: 'preserve_exact', value: 'public, max-age=300' },
      vary: { action: 'set', value: 'Cookie, Authorization' },
    });
  });

  it('normalizes case and directive order without rewriting an exact policy', () => {
    expect(classify({}, { existingCacheControl: 'MAX-AGE=300, PUBLIC' })).toEqual({
      kind: 'public',
      cacheControl: { action: 'preserve_exact', value: 'MAX-AGE=300, PUBLIC' },
      vary: { action: 'set', value: 'Cookie, Authorization' },
    });
  });

  it.each([
    'public, max-age=60',
    'public, max-age=600',
    'public, max-age=300, immutable',
    'public, public, max-age=300',
    'no-cache',
  ])('fails closed for conflicting policy %s', (existingCacheControl) => {
    expect(classify({}, { existingCacheControl })).toEqual(PRIVATE_WITH_NEW_CACHE_CONTROL);
  });

  it('preserves an existing policy that already contains private and no-store', () => {
    expect(
      classify(
        {},
        {
          existingCacheControl: 'private, no-store, max-age=0',
          existingVary: 'Accept-Encoding',
        }
      )
    ).toEqual({
      kind: 'private',
      cacheControl: { action: 'preserve_stricter', value: 'private, no-store, max-age=0' },
      vary: { action: 'preserve', value: 'Accept-Encoding' },
    });
  });
});

describe('classifyReleaseCache — Vary merge', () => {
  it('preserves unrelated tokens and appends the two required cache keys', () => {
    expect(classify({}, { existingVary: 'Accept-Encoding' })).toEqual({
      kind: 'public',
      cacheControl: { action: 'set', value: 'public, max-age=300' },
      vary: { action: 'set', value: 'Accept-Encoding, Cookie, Authorization' },
    });
  });

  it('preserves an already canonical safe Vary header', () => {
    expect(classify({}, { existingVary: 'Cookie, Authorization' })).toEqual({
      kind: 'public',
      cacheControl: { action: 'set', value: 'public, max-age=300' },
      vary: { action: 'preserve_exact', value: 'Cookie, Authorization' },
    });
  });

  it('deduplicates required tokens case-insensitively and canonicalizes their order', () => {
    expect(
      classify({}, { existingVary: 'authorization, Accept-Encoding, COOKIE, accept-encoding' })
    ).toEqual({
      kind: 'public',
      cacheControl: { action: 'set', value: 'public, max-age=300' },
      vary: { action: 'set', value: 'Accept-Encoding, Cookie, Authorization' },
    });
  });

  it.each(['*', 'Accept-Encoding,', 'Accept Encoding', 'Cookie,,Authorization'])(
    'fails closed for ambiguous Vary value %j',
    (existingVary) => {
      expect(classify({}, { existingVary })).toEqual({
        kind: 'private',
        cacheControl: { action: 'set', value: 'private, no-store' },
        vary: { action: 'preserve', value: existingVary },
      });
    }
  );
});
