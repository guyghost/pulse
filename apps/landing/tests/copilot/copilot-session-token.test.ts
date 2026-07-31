import { describe, expect, it } from 'vitest';

import {
  issueCopilotSessionToken,
  MAX_COPILOT_SESSION_TTL_SECONDS,
  verifyCopilotSessionToken,
} from '../../src/lib/server/copilot/session-token';

const SECRET = 'missionpulse-copilot-test-secret-with-at-least-32-bytes';
const NOW_MS = Date.UTC(2026, 6, 21, 12, 0, 0);

function base64Url(value: string | Uint8Array): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signedToken(header: object, payload: object): Promise<string> {
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

describe('Copilot session token', () => {
  it('round-trips the bounded server-issued bearer', async () => {
    const issued = await issueCopilotSessionToken({
      subject: '00000000-0000-4000-8000-000000000001',
      secret: SECRET,
      nowMs: NOW_MS,
    });

    await expect(
      verifyCopilotSessionToken({ token: issued.token, secret: SECRET, nowMs: NOW_MS + 1_000 })
    ).resolves.toBe('00000000-0000-4000-8000-000000000001');
    expect(issued.expiresAtMs).toBe(NOW_MS + MAX_COPILOT_SESSION_TTL_SECONDS * 1_000);
  });

  it('rejects a signed token whose protected header is not the exact HS256 contract', async () => {
    const now = Math.floor(NOW_MS / 1_000);
    const token = await signedToken(
      { alg: 'none', typ: 'JWT' },
      {
        iss: 'missionpulse-copilot',
        aud: 'missionpulse-extension',
        sub: '00000000-0000-4000-8000-000000000001',
        iat: now,
        exp: now + 60,
      }
    );

    await expect(
      verifyCopilotSessionToken({ token, secret: SECRET, nowMs: NOW_MS })
    ).rejects.toMatchObject({ status: 401, code: 'AUTHENTICATION_REQUIRED' });
  });

  it('rejects tampering, expiry and unavailable signing configuration', async () => {
    const issued = await issueCopilotSessionToken({
      subject: '00000000-0000-4000-8000-000000000001',
      secret: SECRET,
      nowMs: NOW_MS,
      ttlSeconds: 30,
    });
    const [header, body, signature] = issued.token.split('.');
    const tampered = `${header}.${body?.slice(0, -1)}A.${signature}`;

    await expect(
      verifyCopilotSessionToken({ token: tampered, secret: SECRET, nowMs: NOW_MS })
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      verifyCopilotSessionToken({ token: issued.token, secret: SECRET, nowMs: NOW_MS + 30_000 })
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      issueCopilotSessionToken({ subject: 'user', secret: 'too-short', nowMs: NOW_MS })
    ).rejects.toMatchObject({ status: 503, code: 'AUTHENTICATION_REQUIRED' });
  });
});
