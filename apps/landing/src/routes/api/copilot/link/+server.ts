import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { isAllowedCopilotRedirect, loadCopilotEntitlement } from '$lib/server/copilot/auth';
import { publicError } from '$lib/server/copilot/remote-response';
import { copilotAuthorizationDependencies } from '$lib/server/copilot/runtime';
import { issueCopilotSessionToken } from '$lib/server/copilot/session-token';
import { createSupabaseServerClient } from '$lib/server/supabase';

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NO_STORE = { 'Cache-Control': 'no-store' };

export const GET: RequestHandler = async ({ url, cookies }) => {
  try {
    const redirectUri = url.searchParams.get('redirect_uri');
    const state = url.searchParams.get('state');
    if (
      redirectUri === null ||
      state === null ||
      !REQUEST_ID.test(state) ||
      !isAllowedCopilotRedirect(redirectUri, env.COPILOT_EXTENSION_REDIRECT_URIS)
    ) {
      return json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'Requête de liaison invalide.',
            retryable: false,
          },
        },
        { status: 422, headers: NO_STORE }
      );
    }

    const supabase = createSupabaseServerClient(cookies);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      const internalReturnPath = `${url.pathname}${url.search}`;
      return new Response(null, {
        status: 302,
        headers: {
          ...NO_STORE,
          Location: `/login?redirectTo=${encodeURIComponent(internalReturnPath)}`,
          Pragma: 'no-cache',
        },
      });
    }

    const authorization = copilotAuthorizationDependencies();
    await loadCopilotEntitlement(user.id, authorization);
    const nowMs = authorization.now().getTime();
    const issued = await issueCopilotSessionToken({
      subject: user.id,
      secret: authorization.signingSecret,
      nowMs,
      ttlSeconds: 600,
    });
    const destination = new URL(redirectUri);
    const fragment = new URLSearchParams({
      session_token: issued.token,
      subject: user.id,
      state,
    });
    destination.hash = fragment.toString();
    return new Response(null, {
      status: 302,
      headers: { ...NO_STORE, Location: destination.toString(), Pragma: 'no-cache' },
    });
  } catch (error) {
    const response = publicError(error);
    return json({ error: response.error }, { status: response.status, headers: NO_STORE });
  }
};
