import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { createSupabaseAdminClient } from '$lib/server/supabase';
import { authenticateExtensionDevice, hashExtensionDeviceSecret } from '$lib/server/extension-link';
import { getPremiumServerConfig } from '$lib/server/premium-config';
import { NO_STORE_HEADERS } from '$lib/server/rate-limit';

export const GET: RequestHandler = async ({ request }) => {
  const admin = createSupabaseAdminClient();
  const authentication = await authenticateExtensionDevice(request);
  if (!authentication.ok) {
    return json({ error: 'DEVICE_REVOKED' }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const { data: entitlement } = await admin
    .from('subscription_entitlements')
    .select(
      'user_id, plan_id, status, valid_from, valid_until, features, source_subscription_id, provider_updated_at, event_priority, provider_event_id, revision, issued_at, cache_expires_at'
    )
    .eq('user_id', authentication.accountId)
    .maybeSingle();

  await admin
    .from('extension_devices')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', authentication.deviceId);

  return json(
    {
      accountId: authentication.accountId,
      entitlement,
      premiumMaxBindingsPerConnector: getPremiumServerConfig().premiumMaxBindingsPerConnector,
    },
    { headers: NO_STORE_HEADERS }
  );
};

export const DELETE: RequestHandler = async ({ request }) => {
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (token.length < 43 || token.length > 128) {
    return json({ error: 'DEVICE_TOKEN_REQUIRED' }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const { data, error } = await createSupabaseAdminClient()
    .from('extension_devices')
    .update({ revoked_at: new Date().toISOString(), token_hash: null })
    .eq('token_hash', hashExtensionDeviceSecret(token))
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    return json({ error: 'DEVICE_REVOKE_FAILED' }, { status: 500, headers: NO_STORE_HEADERS });
  }
  if (!data) {
    return json({ error: 'DEVICE_REVOKED' }, { status: 401, headers: NO_STORE_HEADERS });
  }
  return json({ revoked: true }, { headers: NO_STORE_HEADERS });
};
