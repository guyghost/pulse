import { CopilotApiError } from './errors';

const ISSUER = 'missionpulse-copilot';
const AUDIENCE = 'missionpulse-extension';
const JWT_HEADER = encodeBase64Url(
  new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
);
export const MAX_COPILOT_SESSION_TTL_SECONDS = 10 * 60;

interface SessionTokenPayload {
  iss: typeof ISSUER;
  aud: typeof AUDIENCE;
  sub: string;
  iat: number;
  exp: number;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded =
    value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function signingKey(secret: string): Promise<CryptoKey> {
  const bytes = new TextEncoder().encode(secret);
  if (bytes.length < 32) {
    throw new CopilotApiError(
      503,
      'AUTHENTICATION_REQUIRED',
      'Copilot session signing is unavailable'
    );
  }
  return crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function issueCopilotSessionToken(input: {
  subject: string;
  secret: string;
  nowMs: number;
  ttlSeconds?: number;
}): Promise<{ token: string; expiresAtMs: number }> {
  const ttl = input.ttlSeconds ?? MAX_COPILOT_SESSION_TTL_SECONDS;
  if (!Number.isSafeInteger(ttl) || ttl < 30 || ttl > MAX_COPILOT_SESSION_TTL_SECONDS) {
    throw new CopilotApiError(500, 'INVALID_REQUEST', 'Invalid Copilot session lifetime');
  }
  const issuedAt = Math.floor(input.nowMs / 1000);
  const payload: SessionTokenPayload = {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: input.subject,
    iat: issuedAt,
    exp: issuedAt + ttl,
  };
  const encoder = new TextEncoder();
  const body = encodeBase64Url(encoder.encode(JSON.stringify(payload)));
  const unsigned = `${JWT_HEADER}.${body}`;
  const signature = await crypto.subtle.sign(
    'HMAC',
    await signingKey(input.secret),
    encoder.encode(unsigned)
  );
  return {
    token: `${unsigned}.${encodeBase64Url(new Uint8Array(signature))}`,
    expiresAtMs: payload.exp * 1000,
  };
}

export async function verifyCopilotSessionToken(input: {
  token: string;
  secret: string;
  nowMs: number;
}): Promise<string> {
  const parts = input.token.split('.');
  if (parts.length !== 3) {
    throw new CopilotApiError(401, 'AUTHENTICATION_REQUIRED', 'Invalid Copilot session');
  }
  const [header, body, signaturePart] = parts;
  if (header !== JWT_HEADER) {
    throw new CopilotApiError(401, 'AUTHENTICATION_REQUIRED', 'Invalid Copilot session');
  }
  const signature = decodeBase64Url(signaturePart);
  const bodyBytes = decodeBase64Url(body);
  if (!signature || !bodyBytes) {
    throw new CopilotApiError(401, 'AUTHENTICATION_REQUIRED', 'Invalid Copilot session');
  }
  const encoder = new TextEncoder();
  const signatureBytes = new Uint8Array(signature.length);
  signatureBytes.set(signature);
  const validSignature = await crypto.subtle.verify(
    'HMAC',
    await signingKey(input.secret),
    signatureBytes,
    encoder.encode(`${header}.${body}`)
  );
  if (!validSignature) {
    throw new CopilotApiError(401, 'AUTHENTICATION_REQUIRED', 'Invalid Copilot session');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    throw new CopilotApiError(401, 'AUTHENTICATION_REQUIRED', 'Invalid Copilot session');
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('iss' in payload) ||
    payload.iss !== ISSUER ||
    !('aud' in payload) ||
    payload.aud !== AUDIENCE ||
    !('sub' in payload) ||
    typeof payload.sub !== 'string' ||
    payload.sub.length === 0 ||
    payload.sub.length > 256 ||
    !('iat' in payload) ||
    typeof payload.iat !== 'number' ||
    !('exp' in payload) ||
    typeof payload.exp !== 'number'
  ) {
    throw new CopilotApiError(401, 'AUTHENTICATION_REQUIRED', 'Invalid Copilot session');
  }
  const now = Math.floor(input.nowMs / 1000);
  if (
    !Number.isSafeInteger(payload.iat) ||
    !Number.isSafeInteger(payload.exp) ||
    payload.iat > now + 30 ||
    payload.exp <= now ||
    payload.exp - payload.iat > MAX_COPILOT_SESSION_TTL_SECONDS
  ) {
    throw new CopilotApiError(401, 'AUTHENTICATION_REQUIRED', 'Expired Copilot session');
  }
  return payload.sub;
}
