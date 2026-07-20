import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGitHubApiTransport } from '../../../scripts/connector-health/github-transport';
import type {
  GitHubApiRequest,
  GitHubApiRequestContext,
} from '../../../scripts/connector-health/issue-client';

const TOKEN = 'github-token';
const REPOSITORY = 'guyghost/pulse';
const RESPONSE = new Response('{}', {
  status: 200,
  headers: { 'content-type': 'application/json' },
});

function context(remainingMs: number): GitHubApiRequestContext {
  return {
    deadlineMs: 50_000,
    nowMs: () => 50_000 - remainingMs,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('connector-health GitHub transport', () => {
  it('bounds an in-flight request by the remaining shared deadline through AbortSignal', async () => {
    const deadlineSignal = new AbortController().signal;
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadlineSignal);
    const fetch = vi.fn(async () => RESPONSE.clone());
    vi.stubGlobal('fetch', fetch);
    const request = createGitHubApiTransport(TOKEN, REPOSITORY);

    await expect(
      request(
        {
          method: 'GET',
          path: '/repos/guyghost/pulse/issues',
          query: {
            state: 'open',
            labels: 'connector-health',
            per_page: '100',
            page: '1',
          },
        },
        context(5_000)
      )
    ).resolves.toMatchObject({ status: 200 });

    expect(timeout).toHaveBeenCalledWith(5_000);
    expect(fetch).toHaveBeenCalledWith(
      new URL(
        'https://api.github.com/repos/guyghost/pulse/issues?state=open&labels=connector-health&per_page=100&page=1'
      ),
      expect.objectContaining({ signal: deadlineSignal })
    );
  });

  it('keeps the per-request bound at thirty seconds when more budget remains', async () => {
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(new AbortController().signal);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => RESPONSE.clone())
    );
    const request = createGitHubApiTransport(TOKEN, REPOSITORY);

    await request({ method: 'GET', path: '/repos/guyghost/pulse/labels/bug' }, context(80_000));

    expect(AbortSignal.timeout).toHaveBeenCalledWith(30_000);
  });

  it('rejects an exhausted deadline before exposing the token to fetch', async () => {
    const fetch = vi.fn(async () => RESPONSE.clone());
    vi.stubGlobal('fetch', fetch);
    const request = createGitHubApiTransport(TOKEN, REPOSITORY);

    await expect(
      request({ method: 'GET', path: '/repos/guyghost/pulse/labels/bug' }, context(0))
    ).rejects.toThrow(/deadline/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'a foreign repository',
      request: { method: 'GET', path: '/repos/attacker/pulse/issues' },
    },
    {
      name: 'a raw dot segment',
      request: { method: 'GET', path: '/repos/guyghost/pulse/../other/issues' },
    },
    {
      name: 'an encoded dot segment',
      request: { method: 'GET', path: '/repos/guyghost/pulse/%2e%2e/other/issues' },
    },
    {
      name: 'a non-allowlisted endpoint',
      request: { method: 'GET', path: '/repos/guyghost/pulse/actions/secrets' },
    },
    {
      name: 'POST on the labels endpoint',
      request: { method: 'POST', path: '/repos/guyghost/pulse/labels/bug' },
    },
    {
      name: 'GET on a single issue endpoint',
      request: { method: 'GET', path: '/repos/guyghost/pulse/issues/1' },
    },
  ])('rejects $name before fetch', async ({ request: untrustedRequest }) => {
    const fetch = vi.fn(async () => RESPONSE.clone());
    vi.stubGlobal('fetch', fetch);
    const request = createGitHubApiTransport(TOKEN, REPOSITORY);

    await expect(request(untrustedRequest as GitHubApiRequest, context(30_000))).rejects.toThrow(
      /repository|dot segment|endpoint|method/i
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects unexpected query parameters on the allowlisted issue-list endpoint', async () => {
    const fetch = vi.fn(async () => RESPONSE.clone());
    vi.stubGlobal('fetch', fetch);
    const request = createGitHubApiTransport(TOKEN, REPOSITORY);

    await expect(
      request(
        {
          method: 'GET',
          path: '/repos/guyghost/pulse/issues',
          query: {
            state: 'all',
            labels: 'connector-health',
            per_page: '100',
            page: '1',
          },
        },
        context(30_000)
      )
    ).rejects.toThrow(/query/i);
    expect(fetch).not.toHaveBeenCalled();
  });
});
