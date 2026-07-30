import type { CopilotCreateApiInput, CopilotCreateApiInputHashMaterial } from './contracts';

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Copilot input contains a non-finite number');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .map((key) => {
        if (record[key] === undefined) {
          throw new TypeError('Copilot input contains an undefined property');
        }
        return `${JSON.stringify(key)}:${canonicalJson(record[key])}`;
      });
    return `{${entries.join(',')}}`;
  }
  throw new TypeError('Copilot input contains a non-JSON value');
}

export function copilotInputHashMaterial(
  input: CopilotCreateApiInput
): CopilotCreateApiInputHashMaterial {
  return {
    schemaVersion: input.schemaVersion,
    missionId: input.missionId,
    kind: input.kind,
    consent: input.consent,
    input: input.input,
    tjmFacts: input.tjmFacts,
  };
}

export function canonicalizeCopilotInput(input: CopilotCreateApiInputHashMaterial): string {
  return canonicalJson(input);
}

export async function computeCopilotInputHash(
  input: CopilotCreateApiInputHashMaterial
): Promise<string> {
  const encoded = new TextEncoder().encode(canonicalizeCopilotInput(input));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
