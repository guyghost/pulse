import { parseBoundedStrictJson, sha256Hex } from './contracts';

const MAX_ARTIFACT_METADATA_BYTES = 65_536;
export const MAX_CONNECTOR_HEALTH_ARTIFACT_ARCHIVE_BYTES = 10_485_760;
const ARTIFACT_OBSERVATION_DEADLINE_MS = 120_000;
const REQUEST_TIMEOUT_MS = 30_000;

export interface ObservedConnectorHealthArtifact {
  artifactId: string;
  artifactName: string;
  artifactArchiveSha256: string;
  archiveBytes: number;
}

interface ArtifactObservationInput {
  token: string;
  expectedRepository: string;
  expectedSourceCommit: string;
  expectedRunId: string;
  expectedArtifactId: string;
  expectedArtifactName: 'connector-health-report';
  expectedArtifactArchiveSha256: string;
  nowMs?: () => number;
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

function expectedSafeInteger(value: string, label: string): number {
  if (!/^[1-9]\d{0,15}$/.test(value)) {
    throw new Error(`${label} must be a positive decimal identifier.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${label} exceeds the exact integer range.`);
  }
  return parsed;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertContentLength(response: Response, maxBytes: number, label: string): void {
  const raw = response.headers.get('content-length');
  if (raw === null) {
    return;
  }
  if (!/^(?:0|[1-9]\d{0,15})$/.test(raw)) {
    throw new Error(`${label} content length is malformed.`);
  }
  const length = Number(raw);
  if (!Number.isSafeInteger(length) || length > maxBytes) {
    throw new Error(`${label} exceeds its byte bound.`);
  }
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
  label: string
): Promise<Uint8Array> {
  assertContentLength(response, maxBytes, label);
  if (response.body === null) {
    throw new Error(`${label} body is absent.`);
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
    if (length > maxBytes) {
      await reader.cancel();
      throw new Error(`${label} exceeds its byte bound.`);
    }
    chunks.push(value);
  }
  if (length === 0) {
    throw new Error(`${label} body is empty.`);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function requestSignal(deadlineMs: number, nowMs: () => number): AbortSignal {
  const now = nowMs();
  const remainingMs = Math.floor(deadlineMs - now);
  if (!Number.isFinite(now) || !Number.isFinite(deadlineMs) || remainingMs <= 0) {
    throw new Error('Connector health artifact observation deadline is exhausted.');
  }
  return AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remainingMs));
}

function apiHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function storageRedirect(response: Response): URL {
  if (response.status !== 302) {
    throw new Error(`GitHub artifact archive redirect failed with status ${response.status}.`);
  }
  const rawLocation = response.headers.get('location');
  if (rawLocation === null) {
    throw new Error('GitHub artifact storage redirect is absent.');
  }
  let location: URL;
  try {
    location = new URL(rawLocation);
  } catch (error) {
    throw new Error('GitHub artifact storage redirect is malformed.', { cause: error });
  }
  const hostname = location.hostname.toLowerCase();
  const approvedHost =
    hostname === 'objects.githubusercontent.com' ||
    hostname.endsWith('.actions.githubusercontent.com') ||
    hostname.endsWith('.blob.core.windows.net');
  if (
    location.protocol !== 'https:' ||
    !approvedHost ||
    location.port !== '' ||
    location.username !== '' ||
    location.password !== '' ||
    location.hash !== ''
  ) {
    throw new Error('GitHub artifact storage redirect is outside policy.');
  }
  return location;
}

function validateMetadata(input: {
  metadata: unknown;
  expectedArtifactId: number;
  expectedArtifactName: 'connector-health-report';
  expectedArchiveUrl: string;
  expectedRunId: number;
  expectedSourceCommit: string;
}): { artifactId: string; artifactName: string } {
  const metadata = record(input.metadata, 'GitHub artifact metadata');
  if (!Number.isSafeInteger(metadata.id) || metadata.id !== input.expectedArtifactId) {
    throw new Error('Observed GitHub artifact ID mismatch.');
  }
  if (metadata.name !== input.expectedArtifactName) {
    throw new Error('Observed GitHub artifact name mismatch.');
  }
  if (metadata.expired !== false) {
    throw new Error('Observed GitHub artifact is expired or has an ambiguous expiry state.');
  }
  if (metadata.archive_download_url !== input.expectedArchiveUrl) {
    throw new Error('Observed GitHub artifact archive endpoint mismatch.');
  }
  const workflowRun = record(metadata.workflow_run, 'GitHub artifact workflow run');
  if (
    !Number.isSafeInteger(workflowRun.id) ||
    workflowRun.id !== input.expectedRunId ||
    workflowRun.head_sha !== input.expectedSourceCommit
  ) {
    throw new Error('Observed GitHub artifact workflow-run identity mismatch.');
  }
  return {
    artifactId: String(metadata.id),
    artifactName: metadata.name,
  };
}

export async function observeConnectorHealthArtifact(
  input: ArtifactObservationInput
): Promise<ObservedConnectorHealthArtifact> {
  if (input.token.length < 1 || /[\0\r\n]/.test(input.token)) {
    throw new Error('GitHub token is absent or malformed.');
  }
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(input.expectedSourceCommit)) {
    throw new Error('Expected source commit must be lower-case Git hex.');
  }
  if (input.expectedArtifactName !== 'connector-health-report') {
    throw new Error('Expected connector health artifact name is outside policy.');
  }
  if (!/^[0-9a-f]{64}$/.test(input.expectedArtifactArchiveSha256)) {
    throw new Error('Expected artifact archive digest must be lower-case SHA-256.');
  }
  const repository = repositoryPath(input.expectedRepository);
  const artifactId = expectedSafeInteger(input.expectedArtifactId, 'Expected artifact ID');
  const runId = expectedSafeInteger(input.expectedRunId, 'Expected workflow run ID');
  const metadataPath = `${repository}/actions/artifacts/${artifactId}`;
  const archivePath = `${metadataPath}/zip`;
  const metadataUrl = new URL(`https://api.github.com${metadataPath}`);
  const archiveUrl = new URL(`https://api.github.com${archivePath}`);
  const nowMs = input.nowMs ?? (() => performance.now());
  const startedAt = nowMs();
  if (!Number.isFinite(startedAt)) {
    throw new Error('Connector health artifact observation clock is malformed.');
  }
  const deadlineMs = startedAt + ARTIFACT_OBSERVATION_DEADLINE_MS;

  const metadataResponse = await fetch(metadataUrl, {
    method: 'GET',
    redirect: 'error',
    signal: requestSignal(deadlineMs, nowMs),
    headers: apiHeaders(input.token),
  });
  if (metadataResponse.status !== 200) {
    throw new Error(`GitHub artifact metadata failed with status ${metadataResponse.status}.`);
  }
  const metadataBytes = await readBoundedBody(
    metadataResponse,
    MAX_ARTIFACT_METADATA_BYTES,
    'GitHub artifact metadata'
  );
  const observedIdentity = validateMetadata({
    metadata: parseBoundedStrictJson(metadataBytes, MAX_ARTIFACT_METADATA_BYTES),
    expectedArtifactId: artifactId,
    expectedArtifactName: input.expectedArtifactName,
    expectedArchiveUrl: archiveUrl.href,
    expectedRunId: runId,
    expectedSourceCommit: input.expectedSourceCommit,
  });

  const redirectResponse = await fetch(archiveUrl, {
    method: 'GET',
    redirect: 'manual',
    signal: requestSignal(deadlineMs, nowMs),
    headers: apiHeaders(input.token),
  });
  const storageUrl = storageRedirect(redirectResponse);
  const archiveResponse = await fetch(storageUrl, {
    method: 'GET',
    redirect: 'error',
    signal: requestSignal(deadlineMs, nowMs),
    headers: { Accept: 'application/zip, application/octet-stream' },
  });
  if (archiveResponse.status !== 200) {
    throw new Error(
      `GitHub artifact archive download failed with status ${archiveResponse.status}.`
    );
  }
  const archiveBytes = await readBoundedBody(
    archiveResponse,
    MAX_CONNECTOR_HEALTH_ARTIFACT_ARCHIVE_BYTES,
    'GitHub artifact archive'
  );
  const archiveSha256 = sha256Hex(archiveBytes);
  if (archiveSha256 !== input.expectedArtifactArchiveSha256) {
    throw new Error('Observed GitHub artifact archive digest mismatch.');
  }
  return {
    ...observedIdentity,
    artifactArchiveSha256: archiveSha256,
    archiveBytes: archiveBytes.byteLength,
  };
}
