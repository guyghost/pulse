import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { createSupabaseAdminClient } from '$lib/server/supabase';
import { matchesExtensionDeviceSecret } from '$lib/server/extension-link';
import { getPremiumServerConfig } from '$lib/server/premium-config';
import { enforceRateLimits, NO_STORE_HEADERS } from '$lib/server/rate-limit';

const LinkStatusSchema = z.object({
  linkId: z.string().uuid(),
  secret: z.string().min(43).max(128),
});

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const ipDecision = await enforceRateLimits(
    admin,
    [{ scope: 'extension_link_status_ip', subject: getClientAddress() }],
    now
  );
  if (!ipDecision.ok) {
    return json(
      { error: ipDecision.kind === 'denied' ? 'RATE_LIMITED' : 'RATE_LIMIT_UNAVAILABLE' },
      {
        status: ipDecision.kind === 'denied' ? 429 : 503,
        headers:
          ipDecision.kind === 'denied'
            ? { ...NO_STORE_HEADERS, 'retry-after': String(ipDecision.retryAfterSeconds) }
            : NO_STORE_HEADERS,
      }
    );
  }

  const parsed = LinkStatusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return json(
      { error: 'INVALID_LINK_STATUS_REQUEST' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const linkDecision = await enforceRateLimits(
    admin,
    [{ scope: 'extension_link_status_link', subject: parsed.data.linkId }],
    now
  );
  if (!linkDecision.ok) {
    return json(
      { error: linkDecision.kind === 'denied' ? 'RATE_LIMITED' : 'RATE_LIMIT_UNAVAILABLE' },
      {
        status: linkDecision.kind === 'denied' ? 429 : 503,
        headers:
          linkDecision.kind === 'denied'
            ? { ...NO_STORE_HEADERS, 'retry-after': String(linkDecision.retryAfterSeconds) }
            : NO_STORE_HEADERS,
      }
    );
  }

  const { data: storedLink } = await admin
    .from('extension_link_requests')
    .select('id, install_id, secret_hash, user_id, state, expires_at')
    .eq('id', parsed.data.linkId)
    .maybeSingle();
  let link = storedLink;

  if (!link || !matchesExtensionDeviceSecret(parsed.data.secret, link.secret_hash)) {
    return json({ error: 'LINK_NOT_FOUND' }, { status: 404, headers: NO_STORE_HEADERS });
  }

  if (link.state === 'pending' && Date.parse(link.expires_at) <= now.getTime()) {
    const { data: expiryResult, error: expiryError } = await admin.rpc('expire_extension_link', {
      p_link_id: link.id,
      p_now: now.toISOString(),
    });
    if (expiryError) {
      return json({ error: 'LINK_EXPIRY_FAILED' }, { status: 500, headers: NO_STORE_HEADERS });
    }
    if (expiryResult === 'expired') {
      return json({ state: 'expired' }, { headers: NO_STORE_HEADERS });
    }

    const { data: refreshedLink, error: refreshError } = await admin
      .from('extension_link_requests')
      .select('id, install_id, secret_hash, user_id, state, expires_at')
      .eq('id', link.id)
      .maybeSingle();
    if (refreshError || !refreshedLink) {
      return json({ error: 'LINK_REFRESH_FAILED' }, { status: 500, headers: NO_STORE_HEADERS });
    }
    link = refreshedLink;
  }

  if (link.state !== 'approved' || typeof link.user_id !== 'string') {
    return json({ state: link.state }, { headers: NO_STORE_HEADERS });
  }

  const { data: entitlement } = await admin
    .from('subscription_entitlements')
    .select(
      'user_id, plan_id, status, valid_from, valid_until, features, source_subscription_id, provider_updated_at, event_priority, provider_event_id, revision, issued_at, cache_expires_at'
    )
    .eq('user_id', link.user_id)
    .maybeSingle();

  return json(
    {
      state: 'approved',
      accountId: link.user_id,
      installId: link.install_id,
      entitlement,
      premiumMaxBindingsPerConnector: getPremiumServerConfig().premiumMaxBindingsPerConnector,
    },
    { headers: NO_STORE_HEADERS }
  );
};
