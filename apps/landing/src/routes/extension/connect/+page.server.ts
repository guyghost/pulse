import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { createSupabaseAdminClient, createSupabaseServerClient } from '$lib/server/supabase';
import { enforceRateLimits, NO_STORE_HEADERS } from '$lib/server/rate-limit';

const LinkIdSchema = z.string().uuid();

export const load: PageServerLoad = async ({ cookies, url, setHeaders }) => {
  setHeaders(NO_STORE_HEADERS);
  const linkId = LinkIdSchema.safeParse(url.searchParams.get('linkId'));
  if (!linkId.success) {
    return { session: null, link: null, error: 'Lien de connexion invalide.' };
  }

  const supabase = createSupabaseServerClient(cookies);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const next = `/extension/connect?linkId=${encodeURIComponent(linkId.data)}`;
    redirect(303, `/login?redirectTo=${encodeURIComponent(next)}`);
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    const next = `/extension/connect?linkId=${encodeURIComponent(linkId.data)}`;
    redirect(303, `/login?redirectTo=${encodeURIComponent(next)}`);
  }

  const { data: link } = await createSupabaseAdminClient()
    .from('extension_link_requests')
    .select('id, install_id, state, expires_at')
    .eq('id', linkId.data)
    .maybeSingle();

  if (!link) {
    return { session, link: null, error: 'Cette demande de connexion est introuvable.' };
  }

  return {
    session,
    link: {
      id: link.id,
      installId: link.install_id,
      state: link.state,
      expiresAt: link.expires_at,
    },
    accountEmail: user.email,
    error: null,
  };
};

export const actions: Actions = {
  approve: async ({ request, cookies, getClientAddress, setHeaders }) => {
    setHeaders(NO_STORE_HEADERS);
    const form = await request.formData();
    const linkId = LinkIdSchema.safeParse(form.get('linkId'));
    if (!linkId.success) {
      return fail(400, { error: 'INVALID_LINK_ID' });
    }

    const {
      data: { user },
    } = await createSupabaseServerClient(cookies).auth.getUser();
    if (!user) {
      return fail(401, { error: 'ACCOUNT_REQUIRED' });
    }

    const admin = createSupabaseAdminClient();
    const rateLimit = await enforceRateLimits(
      admin,
      [
        {
          scope: 'extension_link_resolution_user',
          subject: `${user.id}:${getClientAddress()}`,
        },
      ],
      new Date()
    );
    if (!rateLimit.ok) {
      if (rateLimit.kind === 'denied') {
        setHeaders({ ...NO_STORE_HEADERS, 'retry-after': String(rateLimit.retryAfterSeconds) });
      }
      return fail(rateLimit.kind === 'denied' ? 429 : 503, {
        error: rateLimit.kind === 'denied' ? 'RATE_LIMITED' : 'RATE_LIMIT_UNAVAILABLE',
      });
    }

    const { data: result, error } = await admin.rpc('resolve_extension_link', {
      p_link_id: linkId.data,
      p_user_id: user.id,
      p_resolution: 'approved',
      p_resolved_at: new Date().toISOString(),
    });
    if (error) {
      return fail(500, { error: 'LINK_APPROVAL_FAILED' });
    }
    if (result !== 'approved') {
      return fail(409, { error: String(result ?? 'LINK_NOT_PENDING') });
    }
    return { approved: true };
  },
  refuse: async ({ request, cookies, getClientAddress, setHeaders }) => {
    setHeaders(NO_STORE_HEADERS);
    const form = await request.formData();
    const linkId = LinkIdSchema.safeParse(form.get('linkId'));
    if (!linkId.success) {
      return fail(400, { error: 'INVALID_LINK_ID' });
    }
    const {
      data: { user },
    } = await createSupabaseServerClient(cookies).auth.getUser();
    if (!user) {
      return fail(401, { error: 'ACCOUNT_REQUIRED' });
    }

    const admin = createSupabaseAdminClient();
    const rateLimit = await enforceRateLimits(
      admin,
      [
        {
          scope: 'extension_link_resolution_user',
          subject: `${user.id}:${getClientAddress()}`,
        },
      ],
      new Date()
    );
    if (!rateLimit.ok) {
      if (rateLimit.kind === 'denied') {
        setHeaders({ ...NO_STORE_HEADERS, 'retry-after': String(rateLimit.retryAfterSeconds) });
      }
      return fail(rateLimit.kind === 'denied' ? 429 : 503, {
        error: rateLimit.kind === 'denied' ? 'RATE_LIMITED' : 'RATE_LIMIT_UNAVAILABLE',
      });
    }

    const { data: result, error } = await admin.rpc('resolve_extension_link', {
      p_link_id: linkId.data,
      p_user_id: user.id,
      p_resolution: 'refused',
      p_resolved_at: new Date().toISOString(),
    });
    if (error) {
      return fail(500, { error: 'LINK_REFUSAL_FAILED' });
    }
    if (result !== 'refused') {
      return fail(409, { error: String(result ?? 'LINK_NOT_PENDING') });
    }
    return { refused: true };
  },
};
