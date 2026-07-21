import { CopilotApiError } from './errors';

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new CopilotApiError(422, 'INVALID_REQUEST', 'Non-finite Copilot input');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  throw new CopilotApiError(422, 'INVALID_REQUEST', 'Input is not canonical JSON');
}

export async function computeCopilotInputHash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalJson(value))
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function assertCopilotInputHash(value: unknown, expected: string): Promise<void> {
  if ((await computeCopilotInputHash(value)) !== expected) {
    throw new CopilotApiError(422, 'INVALID_REQUEST', 'Copilot input hash mismatch');
  }
}
