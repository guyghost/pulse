import { defineEnvVars } from '@sveltejs/kit/env';

// Identity schemas keep the `$env/dynamic/*` contract these variables had before
// SvelteKit 3: an unset variable stays `undefined` instead of becoming `''`, so
// callers keep deciding their own fallback.
const optional = (input: string | undefined) => input;

export const variables = defineEnvVars({
  MISSIONPULSE_PERF_CACHE_HTML: { schema: optional },
  PUBLIC_CHROME_STORE_URL: { public: true, schema: optional },
  PUBLIC_LEMON_SQUEEZY_BILLING_URL: { public: true, schema: optional },
  CRON_SECRET: { schema: optional },
  GLM_API_KEY: { schema: optional },
  GLM_MODEL: { schema: optional },
  PUBLIC_SUPABASE_URL: { public: true, schema: optional },
  PUBLIC_SUPABASE_ANON_KEY: { public: true, schema: optional },
  COPILOT_EXTENSION_REDIRECT_URIS: { schema: optional },
  LEMON_SQUEEZY_STORE_ID: { schema: optional },
  LEMON_SQUEEZY_API_KEY: { schema: optional },
  LEMON_SQUEEZY_CREDITS_STARTER_VARIANT_ID: { schema: optional },
  LEMON_SQUEEZY_CREDITS_PRO_VARIANT_ID: { schema: optional },
  LEMON_SQUEEZY_CREDITS_POWER_VARIANT_ID: { schema: optional },
  LEMON_SQUEEZY_WEBHOOK_SECRET: { schema: optional },
  LEMON_SQUEEZY_EXPECTED_TEST_MODE: { schema: optional },
  LEMON_SQUEEZY_PREMIUM_YEARLY_VARIANT_ID: { schema: optional },
  PREMIUM_MAX_BINDINGS_PER_CONNECTOR: { schema: optional },
  PREMIUM_ENTITLEMENT_CACHE_TTL_HOURS: { schema: optional },
  PUBLIC_LANDING_URL: { public: true, schema: optional },
  RATE_LIMIT_HASH_SECRET: { schema: optional },
  EXTENSION_LINK_RATE_LIMIT_WINDOW_SECONDS: { schema: optional },
  EXTENSION_LINK_START_IP_LIMIT: { schema: optional },
  EXTENSION_LINK_START_INSTALL_LIMIT: { schema: optional },
  EXTENSION_LINK_STATUS_IP_LIMIT: { schema: optional },
  EXTENSION_LINK_STATUS_LINK_LIMIT: { schema: optional },
  EXTENSION_LINK_RESOLUTION_USER_LIMIT: { schema: optional },
  RETENTION_RATE_LIMIT_HOURS: { schema: optional },
  RETENTION_EXTENSION_LINK_HOURS: { schema: optional },
  RETENTION_TERMINAL_CHECKOUT_DAYS: { schema: optional },
  RETENTION_BILLING_EVENT_DAYS: { schema: optional },
  SUPABASE_SERVICE_ROLE_KEY: { schema: optional },
  COPILOT_SESSION_SIGNING_SECRET: { schema: optional },
  COPILOT_ROLLOUT_ENABLED: { schema: optional },
  COPILOT_ROLLOUT_USER_IDS: { schema: optional },
  MISSIONPULSE_EVE_ENABLED: { schema: optional },
  MISSIONPULSE_EVE_BASE_URL: { schema: optional },
  EVE_BASE_URL: { schema: optional },
  MISSIONPULSE_EVE_TIMEOUT_MS: { schema: optional },
});
