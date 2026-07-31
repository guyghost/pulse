import { parseBoundedStrictJson } from './contracts';
import type {
  GitHubApiRequest,
  GitHubApiRequestContext,
  GitHubApiResponse,
  GitHubApiTransport,
} from './issue-client';

const MAX_GITHUB_RESPONSE_BYTES = 1_048_576;
const REQUEST_TIMEOUT_MS = 30_000;

async function readBoundedBody(response: Response): Promise<Uint8Array> {
  if (response.body === null) {
    return new Uint8Array();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value === undefined) {
      continue;
    }
    length += value.byteLength;
    if (length > MAX_GITHUB_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('GitHub API response exceeds its byte bound.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function repositoryPath(repository: string): string {
  const match = /^([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})$/.exec(repository);
  if (
    match === null ||
    match[1] === '.' ||
    match[1] === '..' ||
    match[2] === '.' ||
    match[2] === '..'
  ) {
    throw new Error('Expected GitHub repository must be an exact owner/name pair.');
  }
  return `/repos/${match[1]}/${match[2]}`;
}

function rejectDotSegments(path: string): void {
  if (!path.startsWith('/') || path.includes('\\') || path.includes('?') || path.includes('#')) {
    throw new Error('GitHub API endpoint path is malformed.');
  }
  for (const rawSegment of path.split('/')) {
    let segment: string;
    try {
      segment = decodeURIComponent(rawSegment);
    } catch (error) {
      throw new Error('GitHub API endpoint path encoding is malformed.', { cause: error });
    }
    if (segment === '.' || segment === '..') {
      throw new Error('GitHub API path contains a forbidden dot segment.');
    }
  }
}

function assertAbsentRequestData(request: GitHubApiRequest): void {
  if (request.query !== undefined || request.body !== undefined) {
    throw new Error('GitHub API endpoint received unexpected query or body data.');
  }
}

function assertExactIssueQuery(query: GitHubApiRequest['query']): void {
  if (query === undefined) {
    throw new Error('GitHub issue-list query is absent.');
  }
  const expectedKeys = ['labels', 'page', 'per_page', 'state'];
  const observedKeys = Object.keys(query).sort();
  if (
    observedKeys.length !== expectedKeys.length ||
    observedKeys.some((key, index) => key !== expectedKeys[index]) ||
    query.state !== 'open' ||
    query.labels !== 'connector-health' ||
    query.per_page !== '100' ||
    query.page === undefined ||
    !/^(?:[1-9]|10)$/.test(query.page)
  ) {
    throw new Error('GitHub issue-list query is outside the exact allowlist.');
  }
}

function requestUrl(request: GitHubApiRequest, expectedRepositoryPath: string): URL {
  rejectDotSegments(request.path);
  const issuesPath = `${expectedRepositoryPath}/issues`;
  const connectorHealthLabelPath = `${expectedRepositoryPath}/labels/connector-health`;
  const bugLabelPath = `${expectedRepositoryPath}/labels/bug`;

  if (request.method === 'GET' && request.path === issuesPath) {
    if (request.body !== undefined) {
      throw new Error('GitHub issue-list endpoint forbids a request body.');
    }
    assertExactIssueQuery(request.query);
  } else if (
    request.method === 'GET' &&
    (request.path === connectorHealthLabelPath || request.path === bugLabelPath)
  ) {
    assertAbsentRequestData(request);
  } else if (request.method === 'POST' && request.path === issuesPath) {
    if (request.query !== undefined || request.body === undefined) {
      throw new Error('GitHub issue-create endpoint requires only its body.');
    }
  } else {
    throw new Error('GitHub API method or endpoint is outside the strict allowlist.');
  }

  const url = new URL(`https://api.github.com${request.path}`);
  if (request.query !== undefined) {
    for (const [key, value] of Object.entries(request.query)) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function requestSignal(context: GitHubApiRequestContext): AbortSignal {
  const now = context.nowMs();
  const remainingMs = Math.floor(context.deadlineMs - now);
  if (!Number.isFinite(context.deadlineMs) || !Number.isFinite(now) || remainingMs <= 0) {
    throw new Error('GitHub API shared deadline is exhausted or malformed.');
  }
  return AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remainingMs));
}

export function createGitHubApiTransport(
  token: string,
  expectedRepository = process.env.GITHUB_REPOSITORY ?? ''
): GitHubApiTransport {
  if (token.length < 1 || /[\0\r\n]/.test(token)) {
    throw new Error('GitHub token is absent or malformed.');
  }
  const expectedRepositoryPath = repositoryPath(expectedRepository);
  return async (
    request: GitHubApiRequest,
    context: GitHubApiRequestContext
  ): Promise<GitHubApiResponse> => {
    const url = requestUrl(request, expectedRepositoryPath);
    const signal = requestSignal(context);
    const response = await fetch(url, {
      method: request.method,
      redirect: 'error',
      signal,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(request.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    const bytes = await readBoundedBody(response);
    const body =
      response.status >= 200 && response.status < 300
        ? parseBoundedStrictJson(bytes, MAX_GITHUB_RESPONSE_BYTES)
        : {};
    return { status: response.status, headers, body };
  };
}
