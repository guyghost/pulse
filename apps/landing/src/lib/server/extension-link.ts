import { createHash, timingSafeEqual } from 'node:crypto';
import { createSupabaseAdminClient } from './supabase';

export const EXTENSION_LINK_TTL_MS = 10 * 60 * 1000;

export function hashExtensionDeviceSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function matchesExtensionDeviceSecret(secret: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashExtensionDeviceSecret(secret), 'utf8');
  const expected = Buffer.from(expectedHash, 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function authenticateExtensionDevice(
  request: Request
): Promise<{ ok: true; deviceId: string; accountId: string; tokenHash: string } | { ok: false }> {
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (token.length < 43 || token.length > 128) {
    return { ok: false };
  }

  const tokenHash = hashExtensionDeviceSecret(token);
  const { data: device } = await createSupabaseAdminClient()
    .from('extension_devices')
    .select('id, user_id, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (!device || device.revoked_at !== null) {
    return { ok: false };
  }
  return {
    ok: true,
    deviceId: device.id,
    accountId: device.user_id,
    tokenHash,
  };
}
