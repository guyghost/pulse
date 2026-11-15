import { defineEnvVars } from '@sveltejs/kit/env';

// Preserve the optional values provided by `$env/dynamic/*` before SvelteKit 3.
const optional = (input: string | undefined) => input;

export const variables = defineEnvVars({
  MISSIONPULSE_PERF_CACHE_HTML: { schema: optional },
  PUBLIC_LANDING_URL: { public: true, schema: optional },
  PUBLIC_SUPABASE_URL: { public: true, schema: optional },
  PUBLIC_SUPABASE_ANON_KEY: { public: true, schema: optional },
  PUBLIC_CHROME_STORE_URL: { public: true, schema: optional },
});
