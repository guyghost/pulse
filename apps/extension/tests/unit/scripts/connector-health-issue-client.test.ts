import { describe, expect, it, vi } from 'vitest';

import {
  connectorHealthMarker,
  settleConnectorHealthIssue,
  type GitHubApiRequest,
  type GitHubApiRequestContext,
  type GitHubApiResponse,
} from '../../../scripts/connector-health/issue-client';

const FINGERPRINT = 'b'.repeat(64);
const MARKER = `<!-- missionpulse-connector-health:${FINGERPRINT} -->`;

function response(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): GitHubApiResponse {
  return { status, body, headers };
}

function label(name: string): GitHubApiResponse {
  return response(200, { name });
}

function issue(number: number, marker = MARKER, pullRequest = false) {
  return {
    number,
    state: 'open',
    body: marker,
    html_url: `https://github.com/guyghost/pulse/issues/${number}`,
    labels: [{ name: 'connector-health' }, { name: 'bug' }],
    ...(pullRequest ? { pull_request: { url: 'https://api.github.com/pulls/1' } } : {}),
  };
}

function options(request: (input: GitHubApiRequest) => Promise<GitHubApiResponse>) {
  return {
    repository: 'guyghost/pulse',
    sourceCommit: 'a'.repeat(40),
    failureFingerprint: FINGERPRINT,
    failureCodes: ['report_invalid_schema'] as const,
    request,
    sleep: vi.fn(async () => undefined),
    nowMs: () => 1_000,
  };
}

describe('connector-health issue settlement', () => {
  it('excludes pull requests and settles on the exact marker without POST', async () => {
    const request = vi
      .fn<(input: GitHubApiRequest) => Promise<GitHubApiResponse>>()
      .mockResolvedValueOnce(label('connector-health'))
      .mockResolvedValueOnce(label('bug'))
      .mockResolvedValueOnce(response(200, [issue(7, MARKER, true), issue(8)]));

    await expect(settleConnectorHealthIssue(options(request))).resolves.toEqual({
      kind: 'duplicate',
      issueNumber: 8,
      issueUrl: 'https://github.com/guyghost/pulse/issues/8',
    });
    expect(request.mock.calls.filter(([call]) => call.method === 'POST')).toHaveLength(0);
    expect(connectorHealthMarker(FINGERPRINT)).toBe(MARKER);
  });

  it('retries a throttled read but sends the create POST exactly once', async () => {
    const request = vi
      .fn<(input: GitHubApiRequest) => Promise<GitHubApiResponse>>()
      .mockResolvedValueOnce(response(429, {}, { 'retry-after': '0' }))
      .mockResolvedValueOnce(label('connector-health'))
      .mockResolvedValueOnce(label('bug'))
      .mockResolvedValueOnce(response(200, []))
      .mockResolvedValueOnce(response(201, issue(9)));
    const input = options(request);

    await expect(settleConnectorHealthIssue(input)).resolves.toEqual({
      kind: 'created',
      issueNumber: 9,
      issueUrl: 'https://github.com/guyghost/pulse/issues/9',
    });
    const posts = request.mock.calls.map(([call]) => call).filter((call) => call.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0]?.body).toMatchObject({ labels: ['connector-health', 'bug'] });
    expect(String((posts[0]?.body as Record<string, unknown>).body)).toContain(MARKER);
    expect(input.sleep).toHaveBeenCalledWith(0);
  });

  it('retries a 5xx read without Retry-After using the deterministic bounded delay', async () => {
    const request = vi
      .fn<(input: GitHubApiRequest) => Promise<GitHubApiResponse>>()
      .mockResolvedValueOnce(response(500, {}))
      .mockResolvedValueOnce(label('connector-health'))
      .mockResolvedValueOnce(label('bug'))
      .mockResolvedValueOnce(response(200, [issue(8)]));
    const input = options(request);

    await expect(settleConnectorHealthIssue(input)).resolves.toMatchObject({
      kind: 'duplicate',
      issueNumber: 8,
    });
    expect(input.sleep).toHaveBeenCalledWith(1_000);
  });

  it('never repeats an ambiguous POST and reconciles using read-only marker queries', async () => {
    const request = vi
      .fn<(input: GitHubApiRequest) => Promise<GitHubApiResponse>>()
      .mockResolvedValueOnce(label('connector-health'))
      .mockResolvedValueOnce(label('bug'))
      .mockResolvedValueOnce(response(200, []))
      .mockResolvedValueOnce(response(500, {}))
      .mockResolvedValueOnce(response(200, []))
      .mockResolvedValueOnce(response(200, [issue(10)]));
    const input = options(request);

    await expect(settleConnectorHealthIssue(input)).resolves.toEqual({
      kind: 'created',
      issueNumber: 10,
      issueUrl: 'https://github.com/guyghost/pulse/issues/10',
    });
    expect(request.mock.calls.filter(([call]) => call.method === 'POST')).toHaveLength(1);
    expect(request.mock.calls.slice(4).every(([call]) => call.method === 'GET')).toBe(true);
    expect(input.sleep).toHaveBeenCalledTimes(2);
    expect(input.sleep).toHaveBeenNthCalledWith(1, 5_000);
    expect(input.sleep).toHaveBeenNthCalledWith(2, 5_000);
  });

  it('reconciles a malformed 201 response without sending another POST', async () => {
    const request = vi
      .fn<(input: GitHubApiRequest) => Promise<GitHubApiResponse>>()
      .mockResolvedValueOnce(label('connector-health'))
      .mockResolvedValueOnce(label('bug'))
      .mockResolvedValueOnce(response(200, []))
      .mockResolvedValueOnce(response(201, { number: 11 }))
      .mockResolvedValueOnce(response(200, [issue(11)]));

    await expect(settleConnectorHealthIssue(options(request))).resolves.toEqual({
      kind: 'created',
      issueNumber: 11,
      issueUrl: 'https://github.com/guyghost/pulse/issues/11',
    });
    expect(request.mock.calls.filter(([call]) => call.method === 'POST')).toHaveLength(1);
    expect(request.mock.calls.at(-1)?.[0].method).toBe('GET');
  });

  it('fails unreported after three unresolved reconciliation reads and one POST', async () => {
    const request = vi
      .fn<(input: GitHubApiRequest) => Promise<GitHubApiResponse>>()
      .mockResolvedValueOnce(label('connector-health'))
      .mockResolvedValueOnce(label('bug'))
      .mockResolvedValueOnce(response(200, []))
      .mockResolvedValueOnce(response(500, {}))
      .mockResolvedValue(response(200, []));

    await expect(settleConnectorHealthIssue(options(request))).rejects.toThrow(
      /reconciliation unresolved/i
    );
    expect(request.mock.calls.filter(([call]) => call.method === 'POST')).toHaveLength(1);
    expect(request.mock.calls.filter(([call]) => call.method === 'GET')).toHaveLength(6);
  });

  it('fails closed on a mutated pagination link before authorizing POST', async () => {
    const request = vi
      .fn<(input: GitHubApiRequest) => Promise<GitHubApiResponse>>()
      .mockResolvedValueOnce(label('connector-health'))
      .mockResolvedValueOnce(label('bug'))
      .mockResolvedValueOnce(
        response(200, [], {
          link: '<https://evil.example/repos/guyghost/pulse/issues?state=open&labels=connector-health&per_page=100&page=2>; rel="next"',
        })
      );

    await expect(settleConnectorHealthIssue(options(request))).rejects.toThrow(/pagination/i);
    expect(request.mock.calls.filter(([call]) => call.method === 'POST')).toHaveLength(0);
  });

  it('does not authorize POST when read-only work exhausted the shared deadline', async () => {
    let now = 0;
    const request = vi.fn(async (input: GitHubApiRequest): Promise<GitHubApiResponse> => {
      if (input.path.endsWith('/labels/connector-health')) {
        return label('connector-health');
      }
      if (input.path.endsWith('/labels/bug')) {
        return label('bug');
      }
      if (input.method === 'GET') {
        now = 120_001;
        return response(200, []);
      }
      return response(201, issue(12));
    });
    const input = { ...options(request), nowMs: () => now };

    await expect(settleConnectorHealthIssue(input)).rejects.toThrow(/deadline/i);
    expect(request.mock.calls.filter(([call]) => call.method === 'POST')).toHaveLength(0);
  });

  it('shares one absolute deadline and rejects a create result completed after it', async () => {
    let now = 10;
    const observedDeadlines: number[] = [];
    const request = vi.fn(
      async (
        input: GitHubApiRequest,
        context: GitHubApiRequestContext
      ): Promise<GitHubApiResponse> => {
        observedDeadlines.push(context.deadlineMs);
        if (input.path.endsWith('/labels/connector-health')) {
          return label('connector-health');
        }
        if (input.path.endsWith('/labels/bug')) {
          return label('bug');
        }
        if (input.method === 'GET') {
          return response(200, []);
        }
        now = context.deadlineMs + 1;
        return response(201, issue(12));
      }
    );

    await expect(
      settleConnectorHealthIssue({ ...options(request), nowMs: () => now })
    ).rejects.toThrow(/deadline/i);
    expect(observedDeadlines).toEqual([120_010, 120_010, 120_010, 120_010]);
    expect(request.mock.calls.filter(([call]) => call.method === 'POST')).toHaveLength(1);
  });

  it('rejects an oversized issues page before authorizing POST', async () => {
    const oversizedPage = Array.from({ length: 101 }, (_, index) =>
      issue(index + 1, '<!-- unrelated-marker -->')
    );
    const request = vi
      .fn<(input: GitHubApiRequest) => Promise<GitHubApiResponse>>()
      .mockResolvedValueOnce(label('connector-health'))
      .mockResolvedValueOnce(label('bug'))
      .mockResolvedValueOnce(response(200, oversizedPage));

    await expect(settleConnectorHealthIssue(options(request))).rejects.toThrow(/page size/i);
    expect(request.mock.calls.filter(([call]) => call.method === 'POST')).toHaveLength(0);
  });
});
