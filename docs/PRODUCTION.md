# MissionPulse — Production Deployment Checklist

Procedure updated: 2026-07-21. A fresh clean candidate seal is still required before any production claim.

## Architecture overview

| App                | Stack                       | Deploy target                             | Domain                       |
| ------------------ | --------------------------- | ----------------------------------------- | ---------------------------- |
| `@pulse/landing`   | SvelteKit + Eve             | Vercel (web + private Eve sibling)        | `missionpulse.app`           |
| `@pulse/dashboard` | SvelteKit + adapter-vercel  | Vercel (microfrontend, `/dashboard`)      | `missionpulse.app/dashboard` |
| `@pulse/extension` | Svelte 5 + Vite + CRXJS MV3 | Chrome Web Store (ZIP via GitHub Release) | N/A                          |
| `@pulse/ui`        | Svelte package              | Built as dependency                       | N/A                          |

Landing and dashboard are wired via `apps/landing/microfrontends.json` (Vercel microfrontends).

---

## Pre-deploy verification (local / CI)

```bash
pnpm install --frozen-lockfile
pnpm deploy:preflight
```

`deploy:preflight` runs format, lint, typecheck, test, build, manifest verify, env documentation checks, and dev-artifact scan.

CI (`.github/workflows/ci.yml`) runs lint, format, typecheck, test, build, manifest verification and browser gates. Its uploaded `dist/` is explicitly unsealed inspection evidence, not a Store package.

Extension packaging (`.github/workflows/release.yml`) is manual and consumes an already archived seal plus the exact tested `dist/`. It packages and independently re-verifies those bytes, then stops at `package_validated`. It neither changes versions nor submits to Chrome Web Store.

### Santé planifiée des connecteurs

`connector-health.yml` exécute les fixtures des six connecteurs, sans réseau de plateforme ni session
navigateur. Permissions : `health-capture` a `contents: read`; `issue-writer` a `actions: read`,
`contents: read`, `issues: write`; `conclusion` a `contents: read`. Seul l'acteur issue admis reçoit
le token. L'evidence courante est l'unique `connector-health-evidence.v1.json` de l'artifact
`connector-health-report`, conservé 14 jours.

Le workflow fixe Node `22.23.1`, pnpm `10.32.1`, le graphe gelé et les actions par SHA. Il lie le
dépôt, la ref de branche par défaut, le SHA et le workflow, mais `contents: read` ne peut pas prouver
la protection de branche : ce contrôle reste hors bande. Le nettoyage PGID ne revendique que le
groupe contrôlé, pas le confinement de code committé malveillant. Après
`CONCLUSION_ACTOR_STARTED`, seuls `passed`, `failed_recorded` et `failed_unreported` existent. Avant
ce marqueur, `pre_actor_bootstrap_interrupted` signifie rouge sans terminal ni revendication.

---

## Environment variables

### Landing (`apps/landing/.env.example`)

| Variable                                   | Scope   | Required            | Purpose                             |
| ------------------------------------------ | ------- | ------------------- | ----------------------------------- |
| `PUBLIC_SUPABASE_URL`                      | public  | yes                 | Supabase project URL                |
| `PUBLIC_SUPABASE_ANON_KEY`                 | public  | yes                 | Supabase anon key (client-safe)     |
| `PUBLIC_CHROME_STORE_URL`                  | public  | recommended         | Install CTA link                    |
| `PUBLIC_LANDING_URL`                       | public  | recommended         | Canonical site URL (redirects, OG)  |
| `SUPABASE_SERVICE_ROLE_KEY`                | private | yes (server)        | Admin client (webhooks, credits)    |
| `GLM_API_KEY`                              | private | for `/api/generate` | Zhipu GLM API                       |
| `GLM_MODEL`                                | private | optional            | Default `glm-4-flash`               |
| `LEMON_SQUEEZY_API_KEY`                    | private | for checkout        | Lemon Squeezy API                   |
| `LEMON_SQUEEZY_STORE_ID`                   | private | for checkout        | Store ID                            |
| `LEMON_SQUEEZY_WEBHOOK_SECRET`             | private | for webhooks        | HMAC verification                   |
| `LEMON_SQUEEZY_CREDITS_STARTER_VARIANT_ID` | private | for checkout        | Credit pack variant                 |
| `LEMON_SQUEEZY_CREDITS_PRO_VARIANT_ID`     | private | for checkout        | Credit pack variant                 |
| `LEMON_SQUEEZY_CREDITS_POWER_VARIANT_ID`   | private | for checkout        | Credit pack variant                 |
| `MISSIONPULSE_PERF_CACHE_HTML`             | private | optional            | Set `1` to cache HTML 5 min         |
| `COPILOT_SESSION_SIGNING_SECRET`           | private | Copilot pilot       | Signs short extension sessions      |
| `COPILOT_ROLLOUT_ENABLED`                  | private | Copilot pilot       | Exact `true`; otherwise fail closed |
| `COPILOT_ROLLOUT_USER_IDS`                 | private | Copilot pilot       | Explicit internal user allowlist    |
| `COPILOT_EXTENSION_REDIRECT_URIS`          | private | Copilot pilot       | Exact Chrome Identity callbacks     |
| `CRON_SECRET`                              | private | Copilot pilot       | Authenticates receipt maintenance   |
| `MISSIONPULSE_EVE_ENABLED`                 | private | Copilot pilot       | Exact `true`; otherwise fail closed |
| `MISSIONPULSE_EVE_BASE_URL`                | private | Copilot pilot       | Same-project Eve protocol origin    |
| `MISSIONPULSE_EVE_TIMEOUT_MS`              | private | optional            | Bounded Eve request deadline        |

### Dashboard (`apps/dashboard/.env.example`)

| Variable                     | Scope      | Required    | Purpose                          |
| ---------------------------- | ---------- | ----------- | -------------------------------- |
| `PUBLIC_SUPABASE_URL`        | public     | yes         | Same Supabase project as landing |
| `PUBLIC_SUPABASE_ANON_KEY`   | public     | yes         | Anon key                         |
| `PUBLIC_LANDING_URL`         | public     | yes         | Auth redirects, login links      |
| `PUBLIC_CHROME_STORE_URL`    | public     | recommended | Extension install link           |
| `PUBLIC_DASHBOARD_BASE_PATH` | build-time | optional    | Default `/dashboard`             |

### Extension

Production defaults are compiled at build time: account linking uses
`https://missionpulse.app`, while bearer Copilot calls use the cookieless
`https://copilot.missionpulse.app`. The latter is the only MissionPulse Copilot
`host_permission`. Any origin change requires the matching `VITE_COPILOT_*_ORIGIN`
build variables, manifest update, verification and CWS resubmission.

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
6. Attach both custom domains: `missionpulse.app` and the cookieless
   `copilot.missionpulse.app` to this same project.
7. Keep `configureVercelJson: false`: the reviewed sibling SvelteKit/Eve services
   and `/eve/v1/**` rewrite are committed explicitly in `apps/landing/vercel.json`.
8. Keep the rollout flag and user allowlist closed until Eve retention/deletion
   and uncertain-outcome reconciliation have verified operator procedures.
9. Keep private Copilot KPI exports disabled until the public privacy promise has
   been reviewed. Net credits are measurable; Eve monetary cost and Premium
   retention remain explicitly unavailable without provider billing and verified
   subscription-history sources.
10. Set a random `CRON_SECRET` of at least 16 characters. The committed daily
    Vercel Cron calls `/api/internal/copilot/receipt-maintenance`, whose
    service-role RPC physically drains receipts after their 90-day expiry.
    Alert when the last successful invocation is older than 25 hours; this is
    the operational deletion target, not a stronger public SLA. One invocation
    is capped at 100 batches of 1,000 rows; exhausting that budget returns 503
    and must trigger the same alert.

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
3. Apply migrations:

```bash
# One-time: link CLI to production project
supabase link --project-ref <your-project-ref> --workdir apps/landing

# Push all migrations in apps/landing/supabase/migrations/
supabase db push --workdir apps/landing
```

4. Store `SUPABASE_SERVICE_ROLE_KEY` only in Vercel server env (never `PUBLIC_*`).
5. Before a Copilot deployment, run the physical database contract after local
   Supabase is started and reset:

```bash
pnpm --filter @pulse/landing test:db
```

### Lemon Squeezy

1. Configure webhook URL: `https://missionpulse.app/api/webhooks/lemon`
2. Set `LEMON_SQUEEZY_WEBHOOK_SECRET` in Vercel.
3. Map credit pack variant IDs in env.

---

## Chrome Web Store

### Build artifact

The candidate version must already be committed consistently in the root package, extension package and source manifest. Never bump it inside a release workflow. On the exact clean commit, run the complete local/build/packaged-MV3 gate and seal its immutable evidence:

```bash
pnpm --filter @pulse/extension release:seal-candidate -- \
  --input output/playwright/mv3-evidence/final-gate-input.json \
  --dist apps/extension/dist \
  --output output/playwright/mv3-evidence/tested-dist-seal.json
```

The input must bind the exact clean commit, committed version, Node/pnpm versions, lockfile, connector configuration, effective built manifest, complete nonempty committed MV3 scenario inventory, aggregate report, zero skips/failures/runtime diagnostics, and identical tree receipts before and after browser exercise. A per-test file is not aggregate evidence.

After the seal exists, the flow is package-only. Do not install, build, bump, resolve connectors, delete or rewrite `dist`:

```bash
pnpm --filter @pulse/extension package:sealed -- \
  --seal output/playwright/mv3-evidence/tested-dist-seal.json \
  --dist apps/extension/dist \
  --releases apps/extension/releases \
  --artifact-id artifact-0.2.2-<commit> \
  --journal-id journal-0.2.2-<commit>

pnpm --filter @pulse/extension verify:release-artifact -- \
  --bundle apps/extension/releases/v0.2.2 \
  --zip apps/extension/releases/v0.2.2/missionpulse.zip \
  --checksum apps/extension/releases/v0.2.2/missionpulse.zip.sha256 \
  --validation apps/extension/releases/v0.2.2/validation.json \
  --extract-fresh /tmp/missionpulse-0.2.2-consumer-check
```

The accepted bundle contains exactly the immutable ownership marker, canonical STORE ZIP, exact checksum sidecar and JCS validation record. Recompute the ZIP SHA-256 after every upload/download and immediately before any Store handoff.

### Release automation

Start `release.yml` manually with the source commit/version and the exact Actions run/artifact that archived `tested-dist-seal.json` with its tested `dist/`. The workflow invokes the same package-only runner and verifies the downloaded artifact in a separate job. Its maximum state is `package_validated`.

### Chrome Web Store boundary

There is no automatic provider publication. Store readiness requires a structured, authorized receipt covering listing completeness, privacy disclosure, permission justification, all four credential-presence checks, and a known-good rollback target. Credentials remain in the operator/provider secret store and must never enter local evidence:

- `CHROME_EXTENSION_ID`
- `CHROME_CLIENT_ID`
- `CHROME_CLIENT_SECRET`
- `CHROME_REFRESH_TOKEN`

Submission, observation, production promotion and rollback are external receipt-driven transitions. A green local package does not claim any of them.

### Manifest checklist

- Version aligned with `package.json` (currently `0.2.2`)
- `minimum_chrome_version`: `114`
- Permissions: sidePanel, storage, cookies, alarms, notifications, declarativeNetRequest, scripting, activeTab, identity
- Host permissions: shipped mission connectors + the configured Supabase project +
  the cookieless Copilot API only
- LinkedIn: `optional_host_permissions` only

### Dev code tree-shaking

Verified: production `dist/` contains no `bootstrapDevMode`, `DevPanel`, `chrome-stubs`, or `qa-seed`. All `src/dev/` imports are behind `import.meta.env.DEV` dynamic imports.

---

## DNS & domains

| Record             | Target                                                        |
| ------------------ | ------------------------------------------------------------- |
| `missionpulse.app` | Vercel landing project                                        |
| `www`              | Redirect to apex (recommended)                                |
| `copilot`          | Same Vercel landing project; no account cookies or browser UI |

Preview deployments use `*.vercel.app`; add Supabase redirect URLs per preview if testing auth.

---

## Post-deploy smoke tests

- [ ] Landing home loads over HTTPS
- [ ] `/login`, `/register`, `/register/passkey` work
- [ ] OAuth callback sets session cookie; redirect to `/dashboard`
- [ ] Dashboard loads authenticated state; unauthenticated redirects to landing login
- [ ] `/api/generate` returns 503 without `GLM_API_KEY` (or 200 when configured)
- [ ] `copilot.missionpulse.app/api/copilot/entitlement` rejects missing bearer credentials and never relies on account cookies
- [ ] Eve health is deployed through the committed sibling-service rewrite, while Eve session routes reject browser calls without Vercel OIDC
- [ ] Receipt maintenance rejects a missing/wrong bearer, succeeds with the Vercel `CRON_SECRET`, and its last successful run is less than 25 hours old
- [ ] `private.copilot_job_facts` is inaccessible to `anon` and `authenticated`; no public Copilot metrics route exists
- [ ] Extension loads in Chrome; side panel opens; scan runs on a connected platform
- [ ] Extension syncs with Supabase (host permission for project URL)

---

## Known gaps (non-blocking for build)

| Priority | Item                                                                                         | Owner |
| -------- | -------------------------------------------------------------------------------------------- | ----- |
| High     | Configure Vercel env vars (see tables above)                                                 | Ops   |
| High     | Supabase production project + migrations (`apps/landing/supabase/migrations/`)               | Ops   |
| High     | Supabase Auth redirect URLs: `https://missionpulse.app/api/auth/callback`                    | Ops   |
| High     | Lemon Squeezy webhook: `https://missionpulse.app/api/webhooks/lemon`                         | Ops   |
| High     | Chrome Web Store GitHub secrets for release workflow                                         | Ops   |
| Medium   | Hardcoded Supabase URL in extension manifest — changing project requires code + CWS resubmit | Dev   |
| Low      | CSP not configured (rely on Vercel headers + SvelteKit defaults)                             | Dev   |

---

## Suggested commit before deploy

Stage production-relevant changes only (exclude `reports/performance/`):

- Landing auth refactor (`hooks.server.ts`, `auth-cookie.ts`, login/register routes)
- Dashboard `hooks.server.ts`
- Extension performance/connector changes (if tested)
- `docs/PRODUCTION.md`, updated `.env.example` files

Do **not** commit `.env` files or `SUPABASE_SERVICE_ROLE_KEY`.
