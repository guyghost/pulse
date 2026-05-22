# Spec: Connected Dashboard, Extension Sync, and Profile Extractors

## Objective

Align MissionPulse with the product promise shown on the landing page by making `apps/dashboard` the main connected product surface, while keeping `apps/extension` as the local executor for browser-session access and platform scraping.

Success means a signed-in freelancer can:

- Review all detected missions in the dashboard, with scores, source health, deduplication, TJM context, and connector status.
- Move a mission through the canonical pipeline: `detected` -> `selected` -> `application_prepared` -> `applied` -> `interview` -> `offer` -> `accepted` / `rejected` / `archived`.
- Keep a canonical CV/profile in Supabase, initially imported from LinkedIn by the extension.
- Run scans and profile extraction from the extension without storing platform credentials.
- See dashboard state synchronized through Supabase, not through a scraping backend.

## Assumptions and Decisions

- Supabase is the synchronization hub and source of truth for connected dashboard data.
- The extension keeps local IndexedDB/chrome.storage for offline-first execution and best-effort local UX.
- The dashboard never scrapes LinkedIn or mission platforms.
- Direct dashboard-to-extension communication is not required for v1; both surfaces converge through Supabase.
- LinkedIn v1 imports profile/CV data only: experiences, skills, summary, education, and links.
- Existing "100% local" copy on the landing is now inaccurate for the connected dashboard path and must be adjusted to "local execution, optional cloud sync".

## Tech Stack

- Monorepo: Turborepo + pnpm.
- Dashboard: SvelteKit, Svelte 5 runes, TypeScript strict, TailwindCSS 4 via `@pulse/ui/app.css`, Supabase SSR.
- Extension: Chrome MV3, Svelte 5, Vite + `@crxjs/vite-plugin`, TypeScript strict, IndexedDB, chrome.storage, Supabase JS.
- Core architecture: Functional Core & Imperative Shell.
- Tests: Vitest for pure/core and shell units, Playwright for dashboard/extension flows.

## Commands

- Full build: `pnpm build`
- Full tests: `pnpm test`
- Full typecheck: `pnpm typecheck`
- Dashboard dev: `pnpm --filter @pulse/dashboard dev`
- Dashboard check: `pnpm --filter @pulse/dashboard check`
- Dashboard test: `pnpm --filter @pulse/dashboard test`
- Extension dev: `pnpm --filter @pulse/extension dev`
- Extension test: `pnpm --filter @pulse/extension test`
- Extension E2E: `pnpm --filter @pulse/extension test:e2e`
- Landing dev: `pnpm --filter @pulse/landing dev`

## Project Structure

```text
apps/dashboard/
  src/lib/core/              Pure dashboard domain types and transforms
  src/lib/server/            Supabase SSR shell
  src/routes/                Connected dashboard screens
  tests/unit/                Dashboard pure unit tests

apps/extension/
  src/lib/core/              Pure parsers, scoring, tracking, CV normalization
  src/lib/shell/             Chrome, IndexedDB, Supabase, fetch, orchestration
  src/lib/state/             Svelte 5 rune state modules
  src/background/            Service worker and bridge handlers
  tests/unit/                Core/shell unit tests
  tests/e2e/                 Extension user flows

apps/landing/
  src/routes/+page.svelte    Public promise surface
  supabase/                  Current schema and migrations

docs/specs/
  dashboard-microfrontend.md This decision spec
```

## Code Style

Svelte 5 only:

```svelte
<script lang="ts">
  let { application }: { application: MissionApplication } = $props();
  let expanded = $state(false);
  let label = $derived(application.stage === 'offer' ? 'Offre' : 'En cours');
</script>

<button onclick={() => (expanded = !expanded)}>{label}</button>
```

Core stays pure:

```ts
export function normalizePipelineEvent(
  currentStage: ApplicationStage,
  nextStage: ApplicationStage,
  occurredAt: Date
): PipelineEvent | null {
  if (!isAllowedApplicationTransition(currentStage, nextStage)) {
    return null;
  }

  return { fromStage: currentStage, toStage: nextStage, occurredAt: occurredAt.toISOString() };
}
```

## Testing Strategy

- Pure core tests:
  - dashboard application filters, stage transitions, sync conflict resolution;
  - extension parsers, profile extractors, mission scoring, dedup, tracking adapters;
  - no mocks for pure parser/normalizer tests.
- Shell unit tests:
  - Supabase sync payload builders with mocked Supabase client;
  - Chrome bridge schemas and typed error responses;
  - LinkedIn permission/session/DOM failure branches.
- Integration tests:
  - extension scan result -> Supabase upsert payload;
  - dashboard Supabase rows -> dashboard view models;
  - local tracking migration -> canonical pipeline events.
- E2E tests:
  - extension scan -> dashboard feed;
  - dashboard pipeline update -> extension pull;
  - extension application update -> dashboard update;
  - LinkedIn import happy path and typed error states.

## Audit Summary

### Landing Promises

`apps/landing/src/routes/+page.svelte` promises:

- Chrome extension, free, open source.
- Scan of 5 platforms: Free-Work, LeHibou, Hiway, Collective, Cherry Pick.
- Side panel feed with missions consolidated, scored, deduplicated, and filtered.
- Score explanation by stack, TJM, location, seniority, and Gemini Nano semantic scoring.
- Mission comparison and shortlist.
- Application assistant: ready-to-copy message, source link, CV alignment, follow-up.
- Automatic background scan and smart alerts.
- TJM dashboard/history by stack/source.
- Existing browser sessions, no stored platform credentials.
- "100% local/private", "aucun serveur", "aucune collecte".
- 700+ tests, FC&IS, TypeScript strict.

### Dashboard Current State

`apps/dashboard` currently has:

- SvelteKit microfrontend package `@pulse/dashboard`.
- Supabase SSR session bootstrap and redirect to landing login.
- Account entitlements derived from `profiles`.
- Data read from `favorite_missions` and converted to draft applications.
- Mock CV and mock connector statuses.
- UI sections for applications, CV, sync readiness, feature access.
- Pure dashboard helpers and unit tests in `src/lib/core/dashboard.ts`.

Dashboard gaps:

- No canonical Supabase model for missions, applications, CV, pipeline events, sync status, or connector health.
- Applications are read from synced favorites only.
- Current dashboard stage model is `draft | applied | interview | offer | rejected`, not the canonical pipeline.
- No real CV editor/import history/profile source provenance.
- No real connector health from Supabase.
- No actions persist application stage changes.
- No realtime or pull-based sync status.

### Extension Current State

`apps/extension` currently has:

- Connectors for Free-Work, LeHibou, Hiway, Collective, Cherry Pick.
- Pure parsers in `src/lib/core/connectors/`.
- Shell connectors in `src/lib/shell/connectors/`.
- Scanner orchestration in the service worker with alarms, connector status, scoring, dedup, semantic scoring, notifications, and health snapshots.
- Local mission storage in IndexedDB.
- Local tracking storage in IndexedDB.
- Auth via Supabase JS and chrome.storage-backed session persistence.
- Best-effort Supabase sync for favorite missions only.
- Bridge handlers for scan, tracking, generated assets, auth, favorite sync, and connector health.
- UI pages for feed, applications, CV/profile sync draft, TJM, settings, and connector health.

Extension gaps:

- Supabase sync is limited to `favorite_missions`; no missions/applications/pipeline/CV/sync-status sync.
- Tracking stage models are inconsistent:
  - Core tracking: `new | interested | applying | applied | rejected | accepted | archived`.
  - Bridge schema: `interested | applied | interview | offer | accepted | rejected | withdrawn`.
  - Dashboard: `draft | applied | interview | offer | rejected`.
- No LinkedIn connector or profile extractor.
- No `linkedin.com` host permission, and no `scripting` / `activeTab` path for DOM extraction.
- `CvPage.svelte` prepares manual clipboard payloads; it does not import or sync a canonical CV.
- Side panel state has some direct fallback reads from IndexedDB for dev/offline. Runtime interactions should converge through service worker bridge.

### Existing Spec Open Questions

Replaced decisions:

- Extension sync protocol: Supabase-backed table sync with per-entity revision, operation metadata, and extension-origin writes. No dashboard scraping backend. No direct external messaging required for v1.
- Source of truth: Supabase is the source of truth for connected dashboard data; extension local stores are offline/cache/execution state and reconcile with Supabase.

## Promise Gap Matrix

| Landing promise              | Current implementation                                                                       | Missing work                                                                      | Priority |
| ---------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------- |
| 5 platforms scanned          | Extension has Free-Work, LeHibou, Hiway, Collective, Cherry Pick connectors and parser tests | Sync scan outputs to Supabase `missions`; expose connector health in dashboard    | P0       |
| Centralized mission feed     | Extension feed exists; dashboard reads only favorite snapshots                               | Dashboard feed from Supabase `missions`, filters, score, source, dedup groups     | P0       |
| Scoring IA with Gemini Nano  | Extension scoring and semantic cache exist                                                   | Persist score breakdown/semantic result to Supabase; dashboard explanation UI     | P1       |
| Deduplication                | Extension core dedup exists                                                                  | Persist canonical mission identity and duplicate source records                   | P1       |
| Smart alerts                 | Extension notifications exist                                                                | Dashboard notification preferences and sync of alert-worthy missions              | P2       |
| Mission comparison/shortlist | Extension comparison UI exists; dashboard has application cards                              | Supabase shortlist/selected state, dashboard comparison view                      | P1       |
| Application assistant        | Extension generated assets exist behind credits                                              | Dashboard generated asset history, prepared application status, copy/open actions | P1       |
| Pipeline follow-up           | Extension tracking exists locally, dashboard mock stage UI exists                            | Canonical application pipeline, events, follow-up dates, conflict resolution      | P0       |
| Dashboard TJM/history        | Extension TJM history exists locally; dashboard no real TJM                                  | Supabase `mission_market_rates` or derived views, dashboard TJM trend widgets     | P2       |
| Existing browser sessions    | Extension connectors use cookies/fetch sessions                                              | LinkedIn profile extraction via user session and typed errors                     | P0       |
| 100% local/private           | Extension local execution exists, but Supabase is now product decision                       | Update promise to local execution + explicit cloud sync controls                  | P0       |
| No platform credentials      | Preserved; auth is only MissionPulse/Supabase                                                | Keep credential boundary in spec, tests, and privacy copy                         | P0       |
| Open source/tests/FC&IS      | Repo has ADRs and many tests                                                                 | Keep new parser/sync core pure and tested                                         | P0       |

## Target Product Surface

### Dashboard

Dashboard becomes the connected cockpit:

- Feed: all synced missions, search, filters, score, source, dedup badge, freshness, hide/archive.
- Applications: kanban/list/table for canonical pipeline, next action, notes, generated assets, source link, activity timeline.
- CV canonical: profile summary, experiences, skills, education, links, import history, source confidence, manual overrides.
- Sync: extension connection status, last seen time, pending upload/download counts, conflicts, failed jobs.
- Connector health: per-platform readiness, last scan, last error type/message, session required, permission required.
- Account: Supabase session, credits, premium status, privacy/export/delete controls.

### Extension

Extension remains the local executor:

- Scans mission platforms through browser sessions.
- Extracts LinkedIn profile/CV from the browser context.
- Writes local-first results to IndexedDB.
- Uploads sanitized snapshots to Supabase when authenticated.
- Receives Supabase canonical state for applications/CV/settings when online.
- Shows typed connector/extractor errors in the side panel.

## Canonical Pipeline

Stages:

- `detected`: mission found by a connector and visible in the feed.
- `selected`: user shortlisted the mission or marked it as worth pursuing.
- `application_prepared`: pitch/message/CV notes are ready.
- `applied`: user has applied on the source platform or through a recruiter.
- `interview`: interview process started.
- `offer`: offer received or commercial terms under negotiation.
- `accepted`: mission accepted.
- `rejected`: opportunity declined by client/recruiter or refused by user.
- `archived`: no longer active, retained for history.

Allowed transitions:

```text
detected -> selected | archived
selected -> application_prepared | applied | archived
application_prepared -> applied | archived
applied -> interview | offer | rejected | archived
interview -> offer | rejected | archived
offer -> accepted | rejected | archived
accepted -> archived
rejected -> archived
archived -> detected
```

Dashboard and extension may expose shortcuts, but persisted state must be represented as valid pipeline events. For example, moving directly from `selected` to `applied` creates one event; moving from `detected` to `applied` should either be rejected by core or expanded by shell into `detected -> selected -> application_prepared -> applied` only if the user action explicitly requests "mark as applied".

## Supabase Data Model

All tables are RLS-protected with `auth.uid() = user_id`, except service-owned billing tables already present.

### Core Tables

```sql
profiles (
  id uuid primary key references auth.users(id),
  subscription_status text not null,
  subscription_period_end timestamptz,
  credit_balance integer not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
)

mission_sources (
  id text primary key, -- free-work, lehibou, hiway, collective, cherry-pick, linkedin, other
  label text not null,
  kind text not null check (kind in ('mission', 'profile', 'both')),
  created_at timestamptz not null
)

missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null references mission_sources(id),
  external_id text not null,
  canonical_key text not null,
  title text not null,
  client text,
  description text not null,
  stack text[] not null default '{}',
  tjm integer,
  location text,
  remote text check (remote in ('full', 'hybrid', 'onsite')),
  duration text,
  start_date date,
  published_at timestamptz,
  scraped_at timestamptz not null,
  url text not null,
  raw_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source, external_id)
)

mission_scores (
  mission_id uuid primary key references missions(id) on delete cascade,
  deterministic_score integer not null check (deterministic_score between 0 and 100),
  semantic_score integer check (semantic_score between 0 and 100),
  total_score integer not null check (total_score between 0 and 100),
  grade text,
  criteria jsonb not null default '{}'::jsonb,
  semantic_reason text,
  scorer_version text not null,
  scored_at timestamptz not null
)

mission_duplicates (
  user_id uuid not null references auth.users(id) on delete cascade,
  canonical_mission_id uuid not null references missions(id) on delete cascade,
  duplicate_mission_id uuid not null references missions(id) on delete cascade,
  confidence numeric not null,
  reason text not null,
  created_at timestamptz not null default now(),
  primary key (canonical_mission_id, duplicate_mission_id)
)
```

### Applications and Pipeline

```sql
applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_id uuid not null references missions(id) on delete cascade,
  stage text not null check (
    stage in (
      'detected',
      'selected',
      'application_prepared',
      'applied',
      'interview',
      'offer',
      'accepted',
      'rejected',
      'archived'
    )
  ),
  user_rating integer check (user_rating between 1 and 5),
  notes text not null default '',
  next_action_at timestamptz,
  applied_at timestamptz,
  archived_at timestamptz,
  rejected_reason text,
  accepted_terms jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  updated_by text not null check (updated_by in ('dashboard', 'extension', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, mission_id)
)

application_pipeline_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references applications(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_by text not null check (created_by in ('dashboard', 'extension', 'system')),
  client_event_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, client_event_id)
)

generated_application_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references applications(id) on delete cascade,
  type text not null check (type in ('pitch', 'cover_message', 'cv_summary')),
  content text not null,
  model text not null,
  credit_transaction_id uuid,
  created_at timestamptz not null default now()
)
```

### Canonical CV/Profile

```sql
candidate_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  summary text not null default '',
  location text,
  target_role text,
  tjm_min integer,
  tjm_max integer,
  remote_preference text,
  seniority text,
  completeness integer not null default 0 check (completeness between 0 and 100),
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
)

candidate_experiences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references candidate_profiles(id) on delete cascade,
  title text not null,
  company text,
  location text,
  start_date date,
  end_date date,
  is_current boolean not null default false,
  description text not null default '',
  skills text[] not null default '{}',
  source text not null,
  source_external_id text,
  position_index integer not null default 0
)

candidate_education (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references candidate_profiles(id) on delete cascade,
  school text not null,
  degree text,
  field text,
  start_date date,
  end_date date,
  description text not null default '',
  source text not null,
  position_index integer not null default 0
)

candidate_skills (
  profile_id uuid not null references candidate_profiles(id) on delete cascade,
  skill text not null,
  source text not null,
  confidence numeric,
  primary key (profile_id, skill)
)

candidate_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references candidate_profiles(id) on delete cascade,
  label text not null,
  url text not null,
  source text not null
)

profile_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null references mission_sources(id),
  status text not null check (status in ('success', 'partial', 'error')),
  imported_at timestamptz not null,
  extractor_version text not null,
  error_code text,
  error_message text,
  raw_hash text,
  field_counts jsonb not null default '{}'::jsonb
)
```

### Sync and Health

```sql
extension_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  install_id text not null,
  browser text,
  extension_version text not null,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, install_id)
)

sync_status (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references extension_devices(id) on delete cascade,
  entity text not null check (entity in ('missions', 'applications', 'candidate_profile', 'connector_health')),
  last_pull_at timestamptz,
  last_push_at timestamptz,
  pending_upload_count integer not null default 0,
  pending_download_count integer not null default 0,
  last_error_code text,
  last_error_message text,
  retry_after_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (device_id, entity)
)

connector_health_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid references extension_devices(id) on delete set null,
  source text not null references mission_sources(id),
  status text not null check (status in ('ready', 'needs_permission', 'needs_session', 'blocked', 'error', 'syncing')),
  error_code text,
  error_message text,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null
)
```

Keep `favorite_missions` during migration as a compatibility source. It should become either a view over `applications(stage in selected...)` or be deprecated after dashboard reads from canonical tables.

## Sync Protocol

### Direction

- Extension -> Supabase:
  - Scanned missions and score snapshots.
  - Application state changes made in the side panel.
  - Generated assets created in the extension.
  - LinkedIn profile import output.
  - Connector/extractor health events.
- Dashboard -> Supabase:
  - Application state changes.
  - Notes, ratings, next action dates.
  - Canonical CV edits.
  - User preferences that affect connected dashboard behavior.
- Extension <- Supabase:
  - Canonical applications for local side panel.
  - Candidate profile/settings used for scoring.
  - Conflict resolutions and dashboard edits.

### Mechanics

- Each local extension install has a stable `install_id` generated in shell and registered in `extension_devices`.
- Each syncable table has:
  - `revision bigint`.
  - `updated_at timestamptz`.
  - `updated_by`.
  - client-generated idempotency keys for event inserts.
- Extension stores a per-entity cursor in chrome.storage/IndexedDB:
  - last pushed local revision or event id.
  - last pulled remote `updated_at`.
  - last successful sync timestamp.
- Push is batched:
  - missions: upsert by `(user_id, source, external_id)`.
  - applications: upsert by `(user_id, mission_id)` with revision check.
  - pipeline events: insert-only with `client_event_id`.
  - profile import: transaction-like batch from normalized profile snapshot.
- Pull uses `updated_at > cursor` and excludes rows last written by the same device when possible.

### Conflict Resolution

- Pipeline events are append-only. The current `applications.stage` is derived from the latest valid event, then materialized for fast reads.
- Notes, ratings, next action dates, and CV fields are last-writer-wins by `updated_at` for v1, with conflict rows created when two updates touch the same field within a short window.
- Dashboard has final authority for manual CV edits.
- Extension profile imports never overwrite manually edited fields silently. They create field-level suggestions when a canonical field already has a dashboard edit newer than the import cursor.
- Duplicate mission upserts merge by source/external id first, then by canonical key/dedup confidence.
- Failed sync states are visible in both dashboard and extension with entity, code, message, retry timestamp.

## Chrome Permissions

Current permissions are sufficient for mission scan except LinkedIn extraction.

Required additions for LinkedIn v1:

- `host_permissions` or `optional_host_permissions`: `https://www.linkedin.com/*`.
- `permissions`: `scripting` for DOM extraction from a user-opened LinkedIn profile tab.
- `permissions`: `activeTab` for user-initiated import without broad always-on LinkedIn script access.
- Keep `cookies` only for session/readiness checks; never read or persist credential values.

Recommended LinkedIn extraction UX:

- User opens their LinkedIn profile in Chrome.
- User clicks "Importer depuis LinkedIn" in the extension.
- Extension validates active tab origin/path.
- Service worker injects a small script with `chrome.scripting.executeScript`.
- Script returns sanitized DOM-derived data, not raw full-page HTML.
- Shell passes sanitized raw data to a pure core parser/normalizer.

## Security and Privacy Boundaries

- Never store LinkedIn or mission-platform credentials.
- Do not build dashboard-side scraping, browser automation, or server fetches for platform sessions.
- Store only normalized mission/profile snapshots needed for product functionality.
- Do not sync raw LinkedIn HTML to Supabase. Store a hash and field counts in `profile_imports`.
- Supabase RLS is mandatory on all user-owned tables.
- Extension Supabase client uses anon key + user JWT only.
- Service role remains limited to billing/webhook/admin flows in landing server code.
- Gemini Nano remains optional, local, cached, and non-blocking. Semantic scores can be synced only as result snapshots.
- Provide export/delete controls for connected data.

## LinkedIn v1

### Core Parser

Add pure core modules:

```text
apps/extension/src/lib/core/profile-extractors/
  types.ts
  linkedin-parser.ts
  normalize-candidate-profile.ts
```

Core input is sanitized extractor payload, not browser APIs:

```ts
export interface RawPlatformProfile {
  source: 'linkedin';
  profileUrl: string;
  capturedAt: Date;
  sections: {
    headline?: string;
    summary?: string;
    experiences: RawExperience[];
    skills: string[];
    education: RawEducation[];
    links: RawProfileLink[];
  };
}

export interface CanonicalCandidateProfileDraft {
  title: string;
  summary: string;
  experiences: CandidateExperienceDraft[];
  skills: CandidateSkillDraft[];
  education: CandidateEducationDraft[];
  links: CandidateLinkDraft[];
  source: 'linkedin';
  confidence: number;
}
```

Rules:

- No `fetch`, no `chrome.*`, no async, no ambient time.
- `capturedAt` is injected by shell.
- Parser tolerates missing sections.
- Parser returns typed errors for malformed payloads.
- Unit tests use sanitized fixtures.

### Shell Extractor

Add shell modules:

```text
apps/extension/src/lib/shell/profile-extractors/
  platform-profile-extractor.ts
  linkedin.extractor.ts
  index.ts
  profile-extractor-errors.ts
```

Interface:

```ts
export interface PlatformProfileExtractor {
  readonly id: 'linkedin';
  readonly name: string;
  detectSession(now: number): Promise<Result<boolean, AppError>>;
  extractProfile(
    now: number,
    tabId?: number
  ): Promise<Result<CanonicalCandidateProfileDraft, AppError>>;
}
```

LinkedIn typed errors:

- `permission_required`: LinkedIn host permission or scripting permission missing.
- `session_required`: active page redirects to login or session markers missing.
- `profile_not_found`: active tab is not a LinkedIn profile page.
- `dom_changed`: required profile containers absent or parse confidence below threshold.
- `rate_limited_or_blocked`: LinkedIn returns challenge, checkpoint, or unusually empty DOM.
- `sync_failed`: normalized profile could not be persisted to Supabase.

### Dashboard Mapping

- `CanonicalCandidateProfileDraft.title` -> `candidate_profiles.title`.
- `summary` -> `candidate_profiles.summary`.
- Experiences -> `candidate_experiences`.
- Skills -> `candidate_skills`.
- Education -> `candidate_education`.
- Links -> `candidate_links`.
- Import metadata -> `profile_imports`.
- Existing dashboard edits produce field-level suggestions instead of blind overwrite.

## Extensible Platform Profile Extractors

LinkedIn is the first implementation. Future extractors follow the same template:

1. Add a pure parser/normalizer in `core/profile-extractors/{platform}-parser.ts`.
2. Add a shell extractor in `shell/profile-extractors/{platform}.extractor.ts`.
3. Register metadata in `shell/profile-extractors/index.ts`.
4. Add host/optional permissions if needed.
5. Add unit tests with sanitized fixtures.
6. Add shell tests for typed errors and permission/session behavior.
7. Add dashboard mapping only through canonical CV tables, never platform-specific dashboard tables.

Shared shell behavior:

- permission check;
- session check;
- extraction dispatch;
- normalized Supabase upload;
- sync status update;
- connector/extractor health event.

## Implementation Plan

### Phase 1: Audit, Gap Matrix, Supabase Schema

Tasks:

- Replace this spec's decisions in PR description and product docs.
- Add Supabase migrations for canonical missions, applications, pipeline events, CV profile, sync status, and connector health.
- Preserve `favorite_missions` as compatibility.
- Add RLS policies and indexes.
- Add generated TypeScript types if the project adopts Supabase type generation.

Acceptance:

- Schema supports every landing promise and canonical pipeline state.
- Existing auth/billing/profile behavior remains compatible.
- No dashboard scraping backend is introduced.

Verify:

- `pnpm --filter @pulse/landing test`
- Manual SQL review of RLS for every user-owned table.

### Phase 2: Shared Application/Pipeline Model

Tasks:

- Add shared pure pipeline types and transitions.
- Replace dashboard `ApplicationStage` and extension `ApplicationStatus` with canonical stage names.
- Fix bridge schema mismatch for tracking messages.
- Add pure tests for every valid and invalid transition.
- Add migration/adapters from current local tracking values:
  - `new` -> `detected`
  - `interested` -> `selected`
  - `applying` -> `application_prepared`
  - `applied` -> `applied`
  - `accepted` -> `accepted`
  - `rejected` -> `rejected`
  - `archived` -> `archived`

Acceptance:

- Dashboard and extension use the same stage union.
- Invalid transitions are rejected in core.
- Existing local tracking records can be read and migrated.

Verify:

- `pnpm --filter @pulse/extension test -- tests/unit/tracking`
- `pnpm --filter @pulse/dashboard test`
- `pnpm --filter @pulse/extension typecheck`

### Phase 3: Robust Supabase Sync Extension <-> Dashboard

Tasks:

- Register extension devices.
- Implement mission upsert sync from extension scan results.
- Implement application/pipeline event sync both ways.
- Implement sync cursors and retryable error reporting.
- Persist connector health snapshots/events to Supabase.
- Add side panel bridge messages for sync status and manual retry.

Acceptance:

- Signed-in extension scan populates dashboard mission feed.
- Dashboard stage changes appear in extension after pull.
- Extension stage changes appear in dashboard after push.
- Offline changes queue and retry without data loss.

Verify:

- Unit tests for sync payload builders and conflict handling.
- Integration tests with mocked Supabase client.
- Manual smoke with local dashboard and extension dev mode.

### Phase 4: Dashboard Complete Against Landing

Tasks:

- Replace mock dashboard data with Supabase reads.
- Build dashboard feed with mission score, source, dedup, filters, and freshness.
- Build applications pipeline and detail panel.
- Build canonical CV profile view/editor with import history.
- Build sync/connector health screen.
- Add generated assets history and application assistant UI.
- Adjust landing copy to reflect connected dashboard + local execution privacy model.

Acceptance:

- Every P0/P1 landing promise has a dashboard surface.
- Unauthenticated users are redirected cleanly.
- Dashboard never accesses platform sessions.

Verify:

- `pnpm --filter @pulse/dashboard check`
- `pnpm --filter @pulse/dashboard build`
- Dashboard Playwright smoke tests for feed, pipeline, CV, sync.

### Phase 5: LinkedIn Profile/CV Extractor

Tasks:

- Add LinkedIn optional host permission and `scripting`/`activeTab` permissions.
- Implement pure LinkedIn profile parser/normalizer with fixtures.
- Implement shell extractor using active tab DOM extraction.
- Implement Supabase upload to canonical CV tables.
- Add extension UI flow: permission -> session/profile check -> import preview -> sync.
- Add dashboard import history and field suggestions.

Acceptance:

- User can import LinkedIn profile data without entering LinkedIn credentials.
- Parser handles missing sections and typed failure states.
- Existing dashboard CV edits are not silently overwritten.

Verify:

- Unit parser tests with sanitized LinkedIn fixtures.
- Shell tests for permission/session/dom failure branches.
- Manual browser test on a LinkedIn profile page.

### Phase 6: E2E and Hardening

Tasks:

- Add E2E: scan -> Supabase sync -> dashboard feed.
- Add E2E: dashboard stage update -> extension pull.
- Add E2E: extension stage update -> dashboard update.
- Add E2E/manual: LinkedIn import happy path and typed errors.
- Add privacy/export/delete coverage.
- Add observability for sync status and connector health.

Acceptance:

- Critical connected flows are tested end-to-end.
- Sync failures are visible and recoverable.
- Privacy boundaries are documented and enforced.

Verify:

- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- `pnpm --filter @pulse/extension test:e2e`

## Risks and Mitigations

| Risk                                  | Impact                   | Mitigation                                                                 |
| ------------------------------------- | ------------------------ | -------------------------------------------------------------------------- |
| LinkedIn DOM changes frequently       | Import breaks            | Keep parser fixture-based, confidence scoring, typed `dom_changed` errors  |
| Supabase schema grows too fast        | Migration churn          | Ship Phase 1 as additive schema and keep `favorite_missions` compatibility |
| Conflicting dashboard/extension edits | Lost user notes/stages   | Append-only pipeline events, revision checks, field-level CV suggestions   |
| Privacy promise mismatch              | User trust issue         | Update landing copy before connected dashboard launch                      |
| MV3 service worker hibernation        | Missed sync              | Cursor-based retry and explicit manual sync action                         |
| Bridge stage mismatch                 | Runtime invalid messages | Phase 2 canonical stage union and schema tests                             |

## Boundaries

- Always: keep core pure, inject time, write parser tests with fixtures, expose typed errors in UI.
- Always: use Supabase only for connected sync and user-owned product data.
- Ask first: adding new external services, storing raw profile HTML, broad LinkedIn host permission instead of optional/activeTab flow.
- Never: store platform credentials, scrape from dashboard/server, bypass RLS, use Svelte legacy stores/events, add Tailwind JS config, put I/O in core.

## Open Questions

None blocking for implementation. Product copy must be updated because the prior "aucun serveur / 100% local" promise conflicts with the accepted Supabase hub decision.
