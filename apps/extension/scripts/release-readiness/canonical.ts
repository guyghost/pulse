import { createHash } from 'node:crypto';

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export class CanonicalJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalJsonError';
  }
}

function assertUnicodeScalarString(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const following = value.charCodeAt(index + 1);
      if (!(following >= 0xdc00 && following <= 0xdfff)) {
        throw new CanonicalJsonError('Canonical release JSON rejects isolated Unicode surrogates.');
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new CanonicalJsonError('Canonical release JSON rejects isolated Unicode surrogates.');
    }
  }
}

function canonicalizeValue(value: unknown, seen: Set<object>): string {
  if (typeof value === 'string') {
    assertUnicodeScalarString(value);
    return JSON.stringify(value);
  }
  if (value === null || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
      throw new CanonicalJsonError('Canonical release JSON accepts safe integers only.');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new CanonicalJsonError('Canonical release JSON cannot contain cycles.');
    }
    seen.add(value);
    const encoded = `[${value.map((entry) => canonicalizeValue(entry, seen)).join(',')}]`;
    seen.delete(value);
    return encoded;
  }
  if (typeof value === 'object' && value !== null) {
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new CanonicalJsonError('Canonical release JSON accepts plain objects only.');
    }
    if (seen.has(value)) {
      throw new CanonicalJsonError('Canonical release JSON cannot contain cycles.');
    }
    seen.add(value);
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const encoded = `{${keys
      .map((key) => {
        assertUnicodeScalarString(key);
        const entry = record[key];
        if (entry === undefined) {
          throw new CanonicalJsonError('Canonical release JSON cannot contain undefined.');
        }
        return `${JSON.stringify(key)}:${canonicalizeValue(entry, seen)}`;
      })
      .join(',')}}`;
    seen.delete(value);
    return encoded;
  }
  throw new CanonicalJsonError(`Unsupported canonical release JSON value: ${typeof value}.`);
}

export function jcsCanonicalize(value: unknown): string {
  return canonicalizeValue(value, new Set());
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function sha256Jcs(value: unknown): string {
  return sha256Hex(jcsCanonicalize(value));
}

export function withoutKey(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (entryKey !== key) {
      copy[entryKey] = entryValue;
    }
  }
  return copy;
}
