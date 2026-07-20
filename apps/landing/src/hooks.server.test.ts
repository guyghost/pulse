import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handle } from './hooks.server';

const privateEnv = vi.hoisted(() => ({
  MISSIONPULSE_PERF_CACHE_HTML: '1' as string | undefined,
}));

vi.mock('$env/dynamic/private', () => ({ env: privateEnv }));

interface HookCase {
  routeId?: string | null;
  method?: string;
  requestHeaders?: HeadersInit;
  locals?: Record<string, unknown>;
  status?: number;
  contentType?: string | null;
  responseHeaders?: HeadersInit;
}

async function runHook({
  routeId = '/',
  method = 'GET',
  requestHeaders,
  locals = {},
  status = 200,
  contentType = 'text/html; charset=utf-8',
  responseHeaders,
}: HookCase = {}): Promise<Response> {
  const headers = new Headers(responseHeaders);
  if (contentType !== null) {
    headers.set('content-type', contentType);
  }

  const response = new Response(status === 204 ? null : '<html>MissionPulse</html>', {
    status,
    headers,
  });
  if (contentType === null) {
    // Response(string) synthesizes text/plain when Content-Type is omitted;
    // delete it so this case exercises a genuinely absent response header.
    response.headers.delete('content-type');
  }
  const event = {
    request: new Request('https://missionpulse.app/test', {
      method,
      headers: requestHeaders,
    }),
    route: { id: routeId },
    locals,
  };

  return handle({
    event,
    resolve: vi.fn(async () => response),
  } as unknown as Parameters<typeof handle>[0]);
}

describe('landing cache shell', () => {
  beforeEach(() => {
    privateEnv.MISSIONPULSE_PERF_CACHE_HTML = '1';
  });

  it.each(['/', '/privacy', '/login'])(
    'publishes anonymous allowlisted HTML at %s with both cache keys',
    async (routeId) => {
      const response = await runHook({ routeId });

      expect(response.headers.get('cache-control')).toBe('public, max-age=300');
      expect(response.headers.get('vary')).toBe('Cookie, Authorization');
    }
  );

  it('publishes exact HTML MIME essence case-insensitively with valid parameters', async () => {
    const response = await runHook({ contentType: 'TEXT/HTML; charset=UTF-8' });

    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
    expect(response.headers.get('vary')).toBe('Cookie, Authorization');
  });

  it('merges safe existing Vary tokens instead of replacing them', async () => {
    const response = await runHook({
      responseHeaders: { vary: 'Accept-Encoding' },
    });

    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
    expect(response.headers.get('vary')).toBe('Accept-Encoding, Cookie, Authorization');
  });

  it.each([
    ['an arbitrary Cookie', { cookie: 'theme=dark' }],
    ['Authorization', { authorization: 'Bearer opaque' }],
  ])('keeps an allowlisted request with %s private', async (_, requestHeaders) => {
    const response = await runHook({ requestHeaders });

    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBeNull();
  });

  it('keeps an allowlisted request with a verified session private', async () => {
    const response = await runHook({
      locals: { session: { user: { id: 'verified-user' } } },
    });

    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBeNull();
  });

  it('preserves a stricter private Cache-Control and Vary byte-for-byte', async () => {
    const response = await runHook({
      responseHeaders: {
        'cache-control': 'No-Store, private, max-age=0',
        vary: 'Accept-Encoding',
      },
    });

    expect(response.headers.get('cache-control')).toBe('No-Store, private, max-age=0');
    expect(response.headers.get('vary')).toBe('Accept-Encoding');
  });

  it('preserves normalized exact public Cache-Control byte-for-byte', async () => {
    const response = await runHook({
      responseHeaders: {
        'cache-control': 'MAX-AGE=300, PUBLIC',
        vary: 'Cookie, Authorization',
      },
    });

    expect(response.headers.get('cache-control')).toBe('MAX-AGE=300, PUBLIC');
    expect(response.headers.get('vary')).toBe('Cookie, Authorization');
  });

  it.each(['/register', '/register/passkey', '/dashboard', null])(
    'keeps route %s private',
    async (routeId) => {
      const response = await runHook({ routeId });

      expect(response.headers.get('cache-control')).toBe('private, no-store');
    }
  );

  it.each([undefined, '0', 'unexpected'])(
    'keeps HTML private when the performance flag is %s',
    async (flag) => {
      privateEnv.MISSIONPULSE_PERF_CACHE_HTML = flag;
      const response = await runHook();

      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('vary')).toBeNull();
    }
  );

  it('keeps error responses private', async () => {
    const response = await runHook({ status: 500 });

    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('keeps responses that set cookies private', async () => {
    const response = await runHook({
      responseHeaders: { 'set-cookie': 'session=secret; HttpOnly' },
    });

    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it.each([
    ['conflicting Cache-Control', { 'cache-control': 'public, max-age=60' }],
    ['wildcard Vary', { vary: '*' }],
  ])('fails closed for %s', async (_, responseHeaders) => {
    const response = await runHook({ responseHeaders });

    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('does not mutate non-HTML response cache headers', async () => {
    const response = await runHook({
      contentType: 'application/json',
      responseHeaders: {
        'cache-control': 'public, max-age=60',
        vary: 'Accept-Encoding',
      },
    });

    expect(response.headers.get('cache-control')).toBe('public, max-age=60');
    expect(response.headers.get('vary')).toBe('Accept-Encoding');
  });

  it('fails closed when Content-Type is absent', async () => {
    const response = await runHook({
      contentType: null,
      responseHeaders: {
        'cache-control': 'public, max-age=60',
        vary: 'Accept-Encoding',
      },
    });

    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('Accept-Encoding');
  });

  it.each(['text/html; charset', 'text/html; charset="unterminated', 'application/text/html'])(
    'fails closed for invalid Content-Type: %s',
    async (contentType) => {
      const response = await runHook({ contentType });

      expect(response.headers.get('cache-control')).toBe('private, no-store');
    }
  );

  it('never publishes the distinct valid MIME text/htmlx as HTML', async () => {
    const response = await runHook({
      contentType: 'text/htmlx',
      responseHeaders: { 'cache-control': 'public, max-age=60' },
    });

    expect(response.headers.get('cache-control')).toBe('public, max-age=60');
    expect(response.headers.get('vary')).toBeNull();
  });
});
