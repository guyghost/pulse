import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { authenticateExtensionDevice } from '$lib/server/extension-link';
import { getPremiumServerConfig } from '$lib/server/premium-config';
import { createSupabaseAdminClient } from '$lib/server/supabase';
import { NO_STORE_HEADERS } from '$lib/server/rate-limit';

const ConnectorIdSchema = z.enum([
  'free-work',
  'lehibou',
  'hiway',
  'collective',
  'cherry-pick',
  'malt',
]);

const AddBindingSchema = z
  .object({
    connectorId: ConnectorIdSchema,
    externalAccountKeyHash: z.string().regex(/^[a-f0-9]{64}$/),
    displayLabel: z.string().trim().min(1).max(80),
  })
  .strict();

const SwitchBindingSchema = z
  .object({
    bindingId: z.string().uuid(),
    sessionKeyHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const GET: RequestHandler = async ({ request }) => {
  const authentication = await authenticateExtensionDevice(request);
  if (!authentication.ok) {
    return json({ error: 'DEVICE_REVOKED' }, { status: 401, headers: NO_STORE_HEADERS });
  }
  const { data, error } = await createSupabaseAdminClient()
    .from('platform_account_bindings')
    .select(
      'id, user_id, connector_id, external_account_key_hash, display_label, status, is_active, revision, created_at'
    )
    .eq('user_id', authentication.accountId)
    .neq('status', 'removed')
    .order('created_at', { ascending: true });
  if (error) {
    return json({ error: 'BINDINGS_READ_FAILED' }, { status: 500, headers: NO_STORE_HEADERS });
  }
  return json(
    {
      bindings: data ?? [],
      premiumMaxBindingsPerConnector: getPremiumServerConfig().premiumMaxBindingsPerConnector,
    },
    { headers: NO_STORE_HEADERS }
  );
};

export const POST: RequestHandler = async ({ request }) => {
  const authentication = await authenticateExtensionDevice(request);
  if (!authentication.ok) {
    return json({ error: 'DEVICE_REVOKED' }, { status: 401, headers: NO_STORE_HEADERS });
  }
  const parsed = AddBindingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return json({ error: 'INVALID_BINDING_REQUEST' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const { data, error } = await createSupabaseAdminClient().rpc('add_platform_account_binding', {
    p_user_id: authentication.accountId,
    p_connector_id: parsed.data.connectorId,
    p_external_account_key_hash: parsed.data.externalAccountKeyHash,
    p_display_label: parsed.data.displayLabel,
    p_max_bindings: getPremiumServerConfig().premiumMaxBindingsPerConnector,
    p_now: new Date().toISOString(),
  });
  if (error) {
    return json({ error: 'BINDING_CREATE_FAILED' }, { status: 500, headers: NO_STORE_HEADERS });
  }
  return json(data, { headers: NO_STORE_HEADERS });
};

export const PATCH: RequestHandler = async ({ request }) => {
  const authentication = await authenticateExtensionDevice(request);
  if (!authentication.ok) {
    return json({ error: 'DEVICE_REVOKED' }, { status: 401, headers: NO_STORE_HEADERS });
  }
  const parsed = SwitchBindingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return json({ error: 'INVALID_SWITCH_REQUEST' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const { data, error } = await createSupabaseAdminClient().rpc('switch_platform_account_binding', {
    p_user_id: authentication.accountId,
    p_binding_id: parsed.data.bindingId,
    p_session_key_hash: parsed.data.sessionKeyHash,
    p_now: new Date().toISOString(),
  });
  if (error) {
    return json({ error: 'BINDING_SWITCH_FAILED' }, { status: 500, headers: NO_STORE_HEADERS });
  }
  return json(data, { headers: NO_STORE_HEADERS });
};
