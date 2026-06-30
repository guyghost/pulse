# MissionPulse — Production Deployment Checklist

Last verified: 2026-06-30 (monorepo `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` pass locally).

## Architecture overview

| App | Stack | Deploy target | Domain |
|-----|-------|---------------|--------|
| `@pulse/landing` | SvelteKit + adapter-vercel | Vercel (microfrontend host) | `missionpulse.app` |
| `@pulse/dashboard` | SvelteKit + adapter-vercel | Vercel (microfrontend, `/dashboard`) | `missionpulse.app/dashboard` |
| `@pulse/extension` | Svelte 5 + Vite + CRXJS MV3 | Chrome Web Store (ZIP via GitHub Release) | N/A |
| `@pulse/ui` | Svelte package | Built as dependency | N/A |

Landing and dashboard are wired via `apps/landing/microfrontends.json` (Vercel microfrontends).

---

## Pre-deploy verification (local / CI)

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck    # landing has no typecheck script yet — see gaps below
pnpm test
pnpm build
pnpm --filter @pulse/extension verify-manifest dist/manifest.json
```

CI (`.github/workflows/ci.yml`) runs lint, format, typecheck, test, build, manifest verify, and E2E on PRs.

Extension releases (`.github/workflows/release.yml`) tag `v*.*.*`, bump version, build, GitHub Release, optional Chrome Web Store publish.

---

## Environment variables

### Landing (`apps/landing/.env.example`)

| Variable | Scope | Required | Purpose |
|----------|-------|----------|---------|
| `PUBLIC_SUPABASE_URL` | public | yes | Supabase project URL |
| `PUBLIC_SUPABASE_ANON_KEY` | public | yes | Supabase anon key (client-safe) |
| `PUBLIC_CHROME_STORE_URL` | public | recommended | Install CTA link |
| `PUBLIC_LANDING_URL` | public | recommended | Canonical site URL (redirects, OG) |
| `SUPABASE_SERVICE_ROLE_KEY` | private | yes (server) | Admin client (webhooks, credits) |
| `GLM_API_KEY` | private | for `/api/generate` | Zhipu GLM API |
| `GLM_MODEL` | private | optional | Default `glm-4-flash` |
| `LEMON_SQUEEZY_API_KEY` | private | for checkout | Lemon Squeezy API |
| `LEMON_SQUEEZY_STORE_ID` | private | for checkout | Store ID |
| `LEMON_SQUEEZY_WEBHOOK_SECRET` | private | for webhooks | HMAC verification |
| `LEMON_SQUEEZY_CREDITS_STARTER_VARIANT_ID` | private | for checkout | Credit pack variant |
| `LEMON_SQUEEZY_CREDITS_PRO_VARIANT_ID` | private | for checkout | Credit pack variant |
| `LEMON_SQUEEZY_CREDITS_POWER_VARIANT_ID` | private | for checkout | Credit pack variant |
| `MISSIONPULSE_PERF_CACHE_HTML` | private | optional | Set `1` to cache HTML 5 min |

### Dashboard (`apps/dashboard/.env.example`)

| Variable | Scope | Required | Purpose |
|----------|-------|----------|---------|
| `PUBLIC_SUPABASE_URL` | public | yes | Same Supabase project as landing |
| `PUBLIC_SUPABASE_ANON_KEY` | public | yes | Anon key |
| `PUBLIC_LANDING_URL` | public | yes | Auth redirects, login links |
| `PUBLIC_CHROME_STORE_URL` | public | recommended | Extension install link |
| `PUBLIC_DASHBOARD_BASE_PATH` | build-time | optional | Default `/dashboard` |

### Extension

No `.env` at build time. Supabase host is hardcoded in `manifest.json` and `hiway.connector.ts` (`jhgjtlkfewuiiofxfrvh.supabase.co`). Changing Supabase project requires updating both plus CWS resubmission.

### Turbo remote cache

`turbo.json` `build.env` tracks: `PUBLIC_CHROME_STORE_URL`, `PUBLIC_LANDING_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_SUPABASE_URL`.

---

## Vercel deployment

### Landing (root project)

1. Connect repo; set root directory to `apps/landing` (or use monorepo with Turborepo on Vercel).
2. Build command: `pnpm build` (from repo root with filter) or `vite build` in app.
3. Install: `pnpm install --frozen-lockfile` from monorepo root.
4. Set all landing env vars in Vercel project settings (Production + Preview).
5. Enable Vercel microfrontends; `microfrontends.json` routes `/dashboard` to dashboard app.
6. Custom domain: `missionpulse.app`.

### Dashboard (microfrontend)

1. Separate Vercel project or microfrontend child; package `@pulse/dashboard`.
2. `PUBLIC_DASHBOARD_BASE_PATH=/dashboard` must match `svelte.config.js` `kit.paths.base`.
3. Share Supabase public keys with landing; set `PUBLIC_LANDING_URL=https://missionpulse.app`.

### Security headers

`apps/landing/vercel.json` and `apps/dashboard/vercel.json` set:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security` (HSTS)
- Dashboard only: `X-Robots-Tag: noindex, nofollow`

`hooks.server.ts` in both apps only adds optional HTML cache when `MISSIONPULSE_PERF_CACHE_HTML=1`.

### Auth cookies

Supabase SSR (`createSupabaseServerClient`) delegates cookie `httpOnly`, `secure`, and `sameSite` to `@supabase/ssr`. On HTTPS (Vercel production), auth cookies are set securely. No custom cookie overrides needed.

OAuth callback: `apps/landing/src/routes/api/auth/callback/+server.ts` → redirects to `/dashboard` by default.

### Supabase

1. Production Supabase project with Auth (email, passkey if enabled).
2. Redirect URLs: `https://missionpulse.app/api/auth/callback`, local dev URLs for preview.
3. Run migrations from `apps/landing/supabase/` if applicable.
4. Store `SUPABASE_SERVICE_ROLE_KEY` only in Vercel server env (never `PUBLIC_*`).

### Lemon Squeezy

1. Configure webhook URL: `https://missionpulse.app/api/webhooks/lemon`
2. Set `LEMON_SQUEEZY_WEBHOOK_SECRET` in Vercel.
3. Map credit pack variant IDs in env.

---

## Chrome Web Store

### Build artifact

```bash
pnpm --filter @pulse/extension build
pnpm --filter @pulse/extension verify-manifest dist/manifest.json
cd apps/extension/dist && zip -r ../missionpulse-0.2.2.zip .
```

### Release automation

Tag `v0.2.3` (semver) → `release.yml` bumps version, builds, creates GitHub Release, uploads ZIP.

### CWS secrets (GitHub Actions)

- `CHROME_EXTENSION_ID`
- `CHROME_CLIENT_ID`
- `CHROME_CLIENT_SECRET`
- `CHROME_REFRESH_TOKEN`

Pre-release versions (`x.y.z-alpha`) skip CWS publish.

### Manifest checklist

- Version aligned with `package.json` (currently `0.2.2`)
- `minimum_chrome_version`: `114`
- Permissions: sidePanel, storage, cookies, alarms, notifications, declarativeNetRequest, scripting, activeTab
- Host permissions: mission platforms + Supabase + `missionpulse.app`
- LinkedIn: `optional_host_permissions` only

### Dev code tree-shaking

Verified: production `dist/` contains no `bootstrapDevMode`, `DevPanel`, `chrome-stubs`, or `qa-seed`. All `src/dev/` imports are behind `import.meta.env.DEV` dynamic imports.

---

## DNS & domains

| Record | Target |
|--------|--------|
| `missionpulse.app` | Vercel landing project |
| `www` | Redirect to apex (recommended) |

Preview deployments use `*.vercel.app`; add Supabase redirect URLs per preview if testing auth.

---

## Post-deploy smoke tests

- [ ] Landing home loads over HTTPS
- [ ] `/login`, `/register`, `/register/passkey` work
- [ ] OAuth callback sets session cookie; redirect to `/dashboard`
- [ ] Dashboard loads authenticated state; unauthenticated redirects to landing login
- [ ] `/api/generate` returns 503 without `GLM_API_KEY` (or 200 when configured)
- [ ] Extension loads in Chrome; side panel opens; scan runs on a connected platform
- [ ] Extension syncs with Supabase (host permission for project URL)

---

## Known gaps (non-blocking for build)

| Priority | Item |
|----------|------|
| High | Commit or fix WIP changes; 4 extension tests + format:check fail on uncommitted FeedPage/App files |
| High | Configure Vercel env vars and Supabase production project |
| Medium | `@pulse/landing` has no `typecheck` / `lint` scripts (skipped in turbo) |
| Medium | Hardcoded Supabase URL in extension manifest — consider build-time injection |
| Low | CSP not configured (rely on Vercel headers + SvelteKit defaults) |
| Low | `reports/performance/` artifacts untracked — exclude from deploy/commits |
| Low | Dashboard `MISSIONPULSE_PERF_CACHE_HTML` not in `.env.example` |

---

## Suggested commit before deploy

Stage production-relevant changes only (exclude `reports/performance/`):

- Landing auth refactor (`hooks.server.ts`, `auth-cookie.ts`, login/register routes)
- Dashboard `hooks.server.ts`
- Extension performance/connector changes (if tested)
- `docs/PRODUCTION.md`, updated `.env.example` files

Do **not** commit `.env` files or `SUPABASE_SERVICE_ROLE_KEY`.
