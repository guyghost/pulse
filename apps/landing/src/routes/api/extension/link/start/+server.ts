import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { createSupabaseAdminClient } from '$lib/server/supabase';
import { EXTENSION_LINK_TTL_MS } from '$lib/server/extension-link';
import { enforceRateLimits, NO_STORE_HEADERS } from '$lib/server/rate-limit';
import { getCanonicalPublicOrigin } from '$lib/server/public-origin';

const LinkStartSchema = z.object({
  installId: z.string().min(8).max(128),
  secretHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const ipDecision = await enforceRateLimits(
    admin,
    [{ scope: 'extension_link_start_ip', subject: getClientAddress() }],
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

  const parsed = LinkStartSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return json({ error: 'INVALID_LINK_REQUEST' }, { status: 400, headers: NO_STORE_HEADERS });
  }
  const installDecision = await enforceRateLimits(
    admin,
    [{ scope: 'extension_link_start_install', subject: parsed.data.installId }],
    now
  );
  if (!installDecision.ok) {
    return json(
      { error: installDecision.kind === 'denied' ? 'RATE_LIMITED' : 'RATE_LIMIT_UNAVAILABLE' },
      {
        status: installDecision.kind === 'denied' ? 429 : 503,
        headers:
          installDecision.kind === 'denied'
            ? { ...NO_STORE_HEADERS, 'retry-after': String(installDecision.retryAfterSeconds) }
            : NO_STORE_HEADERS,
      }
    );
  }

  const origin = getCanonicalPublicOrigin();
  if (origin === null) {
    return json(
      { error: 'PUBLIC_ORIGIN_NOT_CONFIGURED' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  const expiresAt = new Date(now.getTime() + EXTENSION_LINK_TTL_MS).toISOString();
  const { data, error } = await admin
    .from('extension_link_requests')
    .insert({
      install_id: parsed.data.installId,
      secret_hash: parsed.data.secretHash,
      state: 'pending',
      expires_at: expiresAt,
    })
    .select('id, expires_at')
    .single();

  if (error || !data) {
    return json({ error: 'LINK_CREATE_FAILED' }, { status: 500, headers: NO_STORE_HEADERS });
  }

  return json(
    {
      linkId: data.id,
      expiresAt: data.expires_at,
      approvalUrl: `${origin}/extension/connect?linkId=${encodeURIComponent(data.id)}`,
    },
    { headers: NO_STORE_HEADERS }
  );
};
