import type { ConnectorHealthFailureCode } from './contracts';
import type { ConnectorHealthIssueEvent } from './workflow-machine';

const READ_ATTEMPTS = 3;
const QUERY_PAGE_SIZE = 100;
const QUERY_PAGE_CAP = 10;
const API_DEADLINE_MS = 120_000;
const RECONCILIATION_ATTEMPTS = 3;
const RECONCILIATION_DELAY_MS = 5_000;

export interface GitHubApiRequest {
  method: 'GET' | 'POST';
  path: string;
  query?: Readonly<Record<string, string>>;
  body?: Readonly<Record<string, unknown>>;
}

export interface GitHubApiRequestContext {
  deadlineMs: number;
  nowMs: () => number;
}

export interface GitHubApiResponse {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: unknown;
}

export type GitHubApiTransport = (
  input: GitHubApiRequest,
  context: GitHubApiRequestContext
) => Promise<GitHubApiResponse>;

export interface SettledIssue {
  kind: 'duplicate' | 'created';
  issueNumber: number;
  issueUrl: string;
}

interface IssueIdentity {
  issueNumber: number;
  issueUrl: string;
}

export class ConnectorHealthIssueError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ConnectorHealthIssueError';
  }
}

class GitHubDeadlineError extends ConnectorHealthIssueError {}

export function connectorHealthMarker(failureFingerprint: string): string {
  if (!/^[0-9a-f]{64}$/.test(failureFingerprint)) {
    throw new ConnectorHealthIssueError('Failure fingerprint must be lower-case SHA-256.');
  }
  return `<!-- missionpulse-connector-health:${failureFingerprint} -->`;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ConnectorHealthIssueError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function parseRepository(repository: string): { owner: string; repo: string } {
  const match = /^([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})$/.exec(repository);
  if (
    match === null ||
    match[1] === '.' ||
    match[1] === '..' ||
    match[2] === '.' ||
    match[2] === '..'
  ) {
    throw new ConnectorHealthIssueError('Repository must be an exact owner/name pair.');
  }
  return { owner: match[1], repo: match[2] };
}

function assertDeadlineRemaining(nowMs: () => number, deadline: number, message: string): void {
  const now = nowMs();
  if (!Number.isFinite(now) || now >= deadline) {
    throw new GitHubDeadlineError(message);
  }
}

async function requestInsideDeadline(input: {
  request: GitHubApiTransport;
  apiRequest: GitHubApiRequest;
  nowMs: () => number;
  deadline: number;
  deadlineMessage: string;
}): Promise<GitHubApiResponse> {
  assertDeadlineRemaining(input.nowMs, input.deadline, input.deadlineMessage);
  let response: GitHubApiResponse;
  try {
    response = await input.request(input.apiRequest, {
      deadlineMs: input.deadline,
      nowMs: input.nowMs,
    });
  } catch (error) {
    if (error instanceof GitHubDeadlineError || input.nowMs() >= input.deadline) {
      throw new GitHubDeadlineError(input.deadlineMessage, { cause: error });
    }
    throw error;
  }
  assertDeadlineRemaining(input.nowMs, input.deadline, input.deadlineMessage);
  return response;
}

function retryAfterMs(response: GitHubApiResponse): number | null {
  const raw = response.headers['retry-after'];
  if (raw === undefined || !/^(?:0|[1-9]\d?)$/.test(raw)) {
    return null;
  }
  const seconds = Number(raw);
  return seconds <= 60 ? seconds * 1_000 : null;
}

function isRetryableRead(response: GitHubApiResponse): boolean {
  return (
    response.status === 429 ||
    response.status >= 500 ||
    (response.status === 403 && retryAfterMs(response) !== null)
  );
}

function readRetryDelayMs(response: GitHubApiResponse): number | null {
  if (response.headers['retry-after'] === undefined && response.status >= 500) {
    return 1_000;
  }
  return retryAfterMs(response);
}

async function readWithRetry(input: {
  request: GitHubApiTransport;
  apiRequest: GitHubApiRequest;
  sleep: (milliseconds: number) => Promise<void>;
  nowMs: () => number;
  deadline: number;
  onProtocolEvent?: (event: ConnectorHealthIssueEvent) => void;
}): Promise<GitHubApiResponse> {
  for (let attempt = 1; attempt <= READ_ATTEMPTS; attempt += 1) {
    let response: GitHubApiResponse;
    try {
      response = await requestInsideDeadline({
        ...input,
        deadlineMessage: 'GitHub read deadline expired.',
      });
    } catch (error) {
      if (error instanceof GitHubDeadlineError) {
        input.onProtocolEvent?.({ type: 'READ_FAILED' });
        throw error;
      }
      throw new ConnectorHealthIssueError('GitHub read request failed ambiguously.', {
        cause: error,
      });
    }
    if (response.status >= 200 && response.status < 300) {
      return response;
    }
    if (!isRetryableRead(response) || attempt === READ_ATTEMPTS) {
      input.onProtocolEvent?.({ type: 'READ_FAILED' });
      throw new ConnectorHealthIssueError(`GitHub read failed with status ${response.status}.`);
    }
    const delay = readRetryDelayMs(response);
    if (delay === null || input.nowMs() + delay >= input.deadline) {
      input.onProtocolEvent?.({ type: 'READ_FAILED' });
      throw new ConnectorHealthIssueError('GitHub read retry policy is invalid or expired.');
    }
    input.onProtocolEvent?.({ type: 'READ_RETRY_ALLOWED' });
    await input.sleep(delay);
    assertDeadlineRemaining(input.nowMs, input.deadline, 'GitHub read retry deadline expired.');
  }
  throw new ConnectorHealthIssueError('GitHub read retry state is unreachable.');
}

function issueLabels(issue: Record<string, unknown>): string[] {
  if (!Array.isArray(issue.labels)) {
    throw new ConnectorHealthIssueError('GitHub issue labels shape drifted.');
  }
  return issue.labels.map((rawLabel) => {
    if (typeof rawLabel === 'string') {
      return rawLabel;
    }
    const label = record(rawLabel, 'GitHub issue label');
    if (typeof label.name !== 'string') {
      throw new ConnectorHealthIssueError('GitHub issue label name shape drifted.');
    }
    return label.name;
  });
}

function matchingIssue(body: unknown, marker: string): IssueIdentity | null {
  if (!Array.isArray(body)) {
    throw new ConnectorHealthIssueError('GitHub issue list shape drifted.');
  }
  if (body.length > QUERY_PAGE_SIZE) {
    throw new ConnectorHealthIssueError('GitHub issue page size exceeded 100 entries.');
  }
  for (const rawIssue of body) {
    const issue = record(rawIssue, 'GitHub issue');
    if (Object.prototype.hasOwnProperty.call(issue, 'pull_request')) {
      continue;
    }
    if (issue.state !== 'open') {
      throw new ConnectorHealthIssueError('GitHub open issue query returned non-open data.');
    }
    const labels = issueLabels(issue);
    if (!labels.includes('connector-health')) {
      continue;
    }
    if (typeof issue.body !== 'string' || !issue.body.includes(marker)) {
      continue;
    }
    if (!Number.isSafeInteger(issue.number) || (issue.number as number) <= 0) {
      throw new ConnectorHealthIssueError('GitHub issue number shape drifted.');
    }
    if (
      typeof issue.html_url !== 'string' ||
      !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/\d+$/.test(issue.html_url)
    ) {
      throw new ConnectorHealthIssueError('GitHub issue URL shape drifted.');
    }
    return { issueNumber: issue.number as number, issueUrl: issue.html_url };
  }
  return null;
}

function issueQuery(page: number): Record<string, string> {
  return {
    state: 'open',
    labels: 'connector-health',
    per_page: String(QUERY_PAGE_SIZE),
    page: String(page),
  };
}

function nextPageFromLink(
  linkHeader: string | undefined,
  owner: string,
  repo: string,
  currentPage: number
): number | null {
  if (linkHeader === undefined || linkHeader === '') {
    return null;
  }
  const nextEntries = linkHeader
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => /;\s*rel="next"$/.test(entry));
  if (nextEntries.length !== 1) {
    throw new ConnectorHealthIssueError('GitHub pagination has an ambiguous next link.');
  }
  const match = /^<([^>]+)>;\s*rel="next"$/.exec(nextEntries[0]);
  if (match === null) {
    throw new ConnectorHealthIssueError('GitHub pagination link is malformed.');
  }
  let url: URL;
  try {
    url = new URL(match[1]);
  } catch (error) {
    throw new ConnectorHealthIssueError('GitHub pagination URL is malformed.', { cause: error });
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'api.github.com' ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    url.hash !== '' ||
    url.pathname !== `/repos/${owner}/${repo}/issues`
  ) {
    throw new ConnectorHealthIssueError('GitHub pagination mutated its origin or endpoint.');
  }
  const expectedKeys = ['labels', 'page', 'per_page', 'state'];
  const observedKeys = [...url.searchParams.keys()].sort();
  if (
    observedKeys.length !== expectedKeys.length ||
    observedKeys.some((key, index) => key !== expectedKeys[index]) ||
    url.searchParams.getAll('page').length !== 1 ||
    url.searchParams.get('state') !== 'open' ||
    url.searchParams.get('labels') !== 'connector-health' ||
    url.searchParams.get('per_page') !== String(QUERY_PAGE_SIZE)
  ) {
    throw new ConnectorHealthIssueError('GitHub pagination mutated its exact filters.');
  }
  const pageRaw = url.searchParams.get('page');
  if (pageRaw === null || !/^(?:[2-9]|10)$/.test(pageRaw)) {
    throw new ConnectorHealthIssueError('GitHub pagination page is outside the bound.');
  }
  const page = Number(pageRaw);
  if (page !== currentPage + 1 || page > QUERY_PAGE_CAP) {
    throw new ConnectorHealthIssueError('GitHub pagination does not strictly advance.');
  }
  return page;
}

async function verifyLabel(input: {
  owner: string;
  repo: string;
  label: 'connector-health' | 'bug';
  request: GitHubApiTransport;
  sleep: (milliseconds: number) => Promise<void>;
  nowMs: () => number;
  deadline: number;
  onProtocolEvent?: (event: ConnectorHealthIssueEvent) => void;
}): Promise<void> {
  const response = await readWithRetry({
    ...input,
    apiRequest: {
      method: 'GET',
      path: `/repos/${input.owner}/${input.repo}/labels/${input.label}`,
    },
  });
  if (response.status !== 200 || record(response.body, 'GitHub label').name !== input.label) {
    throw new ConnectorHealthIssueError(`Required exact-case label ${input.label} is absent.`);
  }
}

async function queryDuplicate(input: {
  owner: string;
  repo: string;
  marker: string;
  request: GitHubApiTransport;
  sleep: (milliseconds: number) => Promise<void>;
  nowMs: () => number;
  deadline: number;
  onProtocolEvent?: (event: ConnectorHealthIssueEvent) => void;
}): Promise<IssueIdentity | null> {
  let page = 1;
  while (page <= QUERY_PAGE_CAP) {
    const response = await readWithRetry({
      ...input,
      apiRequest: {
        method: 'GET',
        path: `/repos/${input.owner}/${input.repo}/issues`,
        query: issueQuery(page),
      },
    });
    if (response.status !== 200) {
      throw new ConnectorHealthIssueError('GitHub issue query returned a non-200 success.');
    }
    const match = matchingIssue(response.body, input.marker);
    if (match !== null) {
      return match;
    }
    const next = nextPageFromLink(response.headers.link, input.owner, input.repo, page);
    if (next === null) {
      return null;
    }
    if (page === QUERY_PAGE_CAP) {
      throw new ConnectorHealthIssueError('GitHub pagination exceeded its page cap.');
    }
    input.onProtocolEvent?.({ type: 'PAGE_WITHOUT_MATCH_AND_NEXT' });
    page = next;
  }
  throw new ConnectorHealthIssueError('GitHub pagination failed to prove exhaustion.');
}

function validateCreatedIssue(body: unknown, marker: string): IssueIdentity {
  const issue = record(body, 'created GitHub issue');
  if (Object.prototype.hasOwnProperty.call(issue, 'pull_request')) {
    throw new ConnectorHealthIssueError('Created identity unexpectedly names a pull request.');
  }
  const labels = issueLabels(issue);
  if (!labels.includes('connector-health') || !labels.includes('bug')) {
    throw new ConnectorHealthIssueError('Created issue labels are not exact.');
  }
  if (issue.state !== 'open' || typeof issue.body !== 'string' || !issue.body.includes(marker)) {
    throw new ConnectorHealthIssueError('Created issue marker/state is invalid.');
  }
  return matchingIssue([issue], marker) as IssueIdentity;
}

async function reconcileAmbiguousCreate(input: {
  owner: string;
  repo: string;
  marker: string;
  request: GitHubApiTransport;
  sleep: (milliseconds: number) => Promise<void>;
  nowMs: () => number;
  deadline: number;
  onProtocolEvent?: (event: ConnectorHealthIssueEvent) => void;
}): Promise<IssueIdentity> {
  let page = 1;
  for (let attempt = 1; attempt <= RECONCILIATION_ATTEMPTS; attempt += 1) {
    if (attempt > 1) {
      input.onProtocolEvent?.({ type: 'RECONCILIATION_RETRY' });
    }
    if (input.nowMs() + RECONCILIATION_DELAY_MS >= input.deadline) {
      throw new ConnectorHealthIssueError('Create reconciliation deadline expired.');
    }
    await input.sleep(RECONCILIATION_DELAY_MS);
    let response: GitHubApiResponse;
    try {
      response = await requestInsideDeadline({
        ...input,
        apiRequest: {
          method: 'GET',
          path: `/repos/${input.owner}/${input.repo}/issues`,
          query: issueQuery(page),
        },
        deadlineMessage: 'Create reconciliation deadline expired.',
      });
    } catch (error) {
      if (error instanceof GitHubDeadlineError) {
        throw error;
      }
      throw new ConnectorHealthIssueError('Create reconciliation remained ambiguous.', {
        cause: error,
      });
    }
    if (response.status !== 200) {
      throw new ConnectorHealthIssueError('Create reconciliation remained ambiguous.');
    }
    const match = matchingIssue(response.body, input.marker);
    if (match !== null) {
      input.onProtocolEvent?.({ type: 'RECONCILIATION_MATCH_FOUND' });
      return match;
    }
    const next = nextPageFromLink(response.headers.link, input.owner, input.repo, page);
    page = next ?? 1;
  }
  input.onProtocolEvent?.({ type: 'RECONCILIATION_UNRESOLVED' });
  throw new ConnectorHealthIssueError('Create reconciliation unresolved after three reads.');
}

export async function settleConnectorHealthIssue(input: {
  repository: string;
  sourceCommit: string;
  failureFingerprint: string;
  failureCodes: readonly ConnectorHealthFailureCode[];
  request: GitHubApiTransport;
  sleep: (milliseconds: number) => Promise<void>;
  nowMs: () => number;
  onProtocolEvent?: (event: ConnectorHealthIssueEvent) => void;
}): Promise<SettledIssue> {
  const { owner, repo } = parseRepository(input.repository);
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(input.sourceCommit)) {
    throw new ConnectorHealthIssueError('Source commit must be lower-case Git hex.');
  }
  const marker = connectorHealthMarker(input.failureFingerprint);
  const failureCodes = [...new Set(input.failureCodes)].sort((left, right) =>
    Buffer.compare(Buffer.from(left), Buffer.from(right))
  );
  if (failureCodes.length === 0) {
    throw new ConnectorHealthIssueError('Issue settlement requires failure codes.');
  }
  const deadline = input.nowMs() + API_DEADLINE_MS;
  const common = {
    owner,
    repo,
    request: input.request,
    sleep: input.sleep,
    nowMs: input.nowMs,
    deadline,
    onProtocolEvent: input.onProtocolEvent,
  };
  input.onProtocolEvent?.({ type: 'LABEL_QUERY_START' });
  await verifyLabel({ ...common, label: 'connector-health' });
  await verifyLabel({ ...common, label: 'bug' });
  input.onProtocolEvent?.({ type: 'LABELS_VERIFIED' });
  input.onProtocolEvent?.({ type: 'DUPLICATE_QUERY_START' });
  const duplicate = await queryDuplicate({ ...common, marker });
  if (duplicate !== null) {
    input.onProtocolEvent?.({ type: 'QUERY_EXHAUSTED_WITH_MATCH' });
    input.onProtocolEvent?.({ type: 'ISSUE_SETTLED' });
    return { kind: 'duplicate', ...duplicate };
  }
  input.onProtocolEvent?.({ type: 'QUERY_EXHAUSTED_WITHOUT_MATCH' });
  if (input.nowMs() >= deadline) {
    throw new ConnectorHealthIssueError('GitHub write admission deadline expired.');
  }

  const title = `Connector health failure at ${input.sourceCommit.slice(0, 12)}`;
  const body = [
    '## Connector health failure',
    '',
    `Source commit: \`${input.sourceCommit}\``,
    `Failure codes: ${failureCodes.map((code) => `\`${code}\``).join(', ')}`,
    '',
    marker,
  ].join('\n');
  input.onProtocolEvent?.({ type: 'CREATE_REQUESTED' });
  let createResponse: GitHubApiResponse;
  try {
    createResponse = await requestInsideDeadline({
      request: input.request,
      apiRequest: {
        method: 'POST',
        path: `/repos/${owner}/${repo}/issues`,
        body: { title, body, labels: ['connector-health', 'bug'] },
      },
      nowMs: input.nowMs,
      deadline,
      deadlineMessage: 'GitHub create deadline expired.',
    });
  } catch (error) {
    if (error instanceof GitHubDeadlineError) {
      throw error;
    }
    input.onProtocolEvent?.({ type: 'CREATE_RESULT_AMBIGUOUS' });
    const reconciled = await reconcileAmbiguousCreate({ ...common, marker });
    input.onProtocolEvent?.({ type: 'ISSUE_SETTLED' });
    return { kind: 'created', ...reconciled };
  }
  if (createResponse.status === 201) {
    try {
      const created = validateCreatedIssue(createResponse.body, marker);
      input.onProtocolEvent?.({ type: 'CREATE_CONFIRMED' });
      input.onProtocolEvent?.({ type: 'ISSUE_SETTLED' });
      return { kind: 'created', ...created };
    } catch {
      input.onProtocolEvent?.({ type: 'CREATE_RESULT_AMBIGUOUS' });
      const reconciled = await reconcileAmbiguousCreate({ ...common, marker });
      input.onProtocolEvent?.({ type: 'ISSUE_SETTLED' });
      return { kind: 'created', ...reconciled };
    }
  }
  if (
    createResponse.status === 408 ||
    createResponse.status === 429 ||
    createResponse.status >= 500
  ) {
    input.onProtocolEvent?.({ type: 'CREATE_RESULT_AMBIGUOUS' });
    const reconciled = await reconcileAmbiguousCreate({ ...common, marker });
    input.onProtocolEvent?.({ type: 'ISSUE_SETTLED' });
    return { kind: 'created', ...reconciled };
  }
  if (createResponse.status >= 400 && createResponse.status < 500) {
    input.onProtocolEvent?.({
      type:
        createResponse.status === 401 || createResponse.status === 403
          ? 'PERMISSION_DENIED'
          : 'CREATE_REJECTED',
    });
    throw new ConnectorHealthIssueError(
      `Issue create failed definitively with status ${createResponse.status}.`
    );
  }
  input.onProtocolEvent?.({ type: 'CREATE_RESULT_AMBIGUOUS' });
  const reconciled = await reconcileAmbiguousCreate({ ...common, marker });
  input.onProtocolEvent?.({ type: 'ISSUE_SETTLED' });
  return { kind: 'created', ...reconciled };
}
