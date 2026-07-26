import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handle } from './hooks.server';

const privateEnv = vi.hoisted(() => ({
  MISSIONPULSE_PERF_CACHE_HTML: '1' as string | undefined,
}));

vi.mock('$env/dynamic/private', () => ({ env: privateEnv }));

interface HookCase {
  routeId?: string | null;
  requestHeaders?: HeadersInit;
  locals?: Record<string, unknown>;
  status?: number;
  contentType?: string | null;
  responseHeaders?: HeadersInit;
}

async function runHook({
  routeId = '/',
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

  const response = new Response('<html>Private dashboard</html>', { status, headers });
  const event = {
    request: new Request('https://dashboard.missionpulse.app/', {
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

describe('dashboard cache shell', () => {
  beforeEach(() => {
    privateEnv.MISSIONPULSE_PERF_CACHE_HTML = '1';
  });

  it('keeps dashboard root HTML private even without an auth signal', async () => {
    const response = await runHook();

    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBeNull();
  });

  it.each([
    ['an arbitrary Cookie', { cookie: 'theme=dark' }],
    ['Authorization', { authorization: 'Bearer opaque' }],
  ])('keeps dashboard HTML with %s private', async (_, requestHeaders) => {
    const response = await runHook({ requestHeaders });

    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('keeps dashboard HTML with a verified session private', async () => {
    const response = await runHook({
      locals: { session: { user: { id: 'verified-user' } } },
    });

    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('preserves a stricter dashboard Cache-Control and Vary byte-for-byte', async () => {
    const response = await runHook({
      responseHeaders: {
        'cache-control': 'No-Store, private, max-age=0',
        vary: 'Accept-Encoding',
      },
    });

    expect(response.headers.get('cache-control')).toBe('No-Store, private, max-age=0');
    expect(response.headers.get('vary')).toBe('Accept-Encoding');
  });

  it.each([undefined, '0', 'unexpected'])(
    'keeps dashboard HTML private when the performance flag is %s',
    async (flag) => {
      privateEnv.MISSIONPULSE_PERF_CACHE_HTML = flag;

      expect((await runHook()).headers.get('cache-control')).toBe('private, no-store');
    }
  );

  it('keeps errors and Set-Cookie responses private', async () => {
    const response = await runHook({
      status: 500,
      responseHeaders: { 'set-cookie': 'session=secret; HttpOnly' },
    });

    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('does not mutate the JSON export cache policy', async () => {
    const response = await runHook({
      routeId: '/export.json',
      contentType: 'application/json',
      responseHeaders: {
        'cache-control': 'private, max-age=0',
        vary: 'Accept-Encoding',
      },
    });

    expect(response.headers.get('cache-control')).toBe('private, max-age=0');
    expect(response.headers.get('vary')).toBe('Accept-Encoding');
  });
});
