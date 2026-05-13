# Spec: Dashboard Microfrontend

## Objective

Create a connected MissionPulse dashboard in `apps/dashboard` for freelancers to track applications, maintain a canonical CV profile, and prepare future synchronization through the Chrome extension to LinkedIn and targeted mission platforms.

The landing remains the public, non-connected surface. The dashboard becomes the connected product surface and shares the same design system through `@pulse/ui`.

## Tech Stack

- SvelteKit with Svelte 5 runes
- TypeScript strict mode
- TailwindCSS 4 through `@pulse/ui/app.css`
- Supabase SSR for session/profile bootstrap
- Vercel adapter, matching the landing deployment target

## Commands

- Dev: `pnpm --filter @pulse/dashboard dev`
- Build: `pnpm --filter @pulse/dashboard build`
- Typecheck: `pnpm --filter @pulse/dashboard typecheck`
- Check: `pnpm --filter @pulse/dashboard check`

## Project Structure

```text
apps/dashboard/
├── src/
│   ├── lib/
│   │   ├── core/              # Pure dashboard domain types and calculations
│   │   └── server/            # Supabase SSR client
│   ├── routes/                # Connected SvelteKit dashboard routes
│   ├── app.css                # Imports shared UI design system
│   └── app.html
├── package.json
├── svelte.config.js
├── tsconfig.json
└── vite.config.ts
```

## Code Style

Use Svelte 5 runes only.

```svelte
<script lang="ts">
  import { Button } from '@pulse/ui';

  let { label }: { label: string } = $props();
  let isSaving = $state(false);
  let status = $derived(isSaving ? 'Sauvegarde...' : label);
</script>

<Button loading={isSaving}>{status}</Button>
```

## Testing Strategy

- Start with Svelte typechecking and production build for the scaffold.
- Add pure unit tests under `apps/dashboard/tests/unit/` when CV/application scoring rules move from mock data to domain logic.
- Add Playwright E2E for the critical connected flow once auth and extension synchronization are wired.

## Boundaries

- Always: keep landing and dashboard as separate apps, reuse `@pulse/ui`, keep pure domain logic out of Svelte components.
- Ask first: database schema changes, extension manifest changes for external web messaging, adding a router/orchestration framework.
- Never: store platform credentials, make the dashboard scrape directly, duplicate extension connector logic in the web app.

## Success Criteria

- `apps/dashboard` is a workspace package named `@pulse/dashboard`.
- The app builds as a SvelteKit microfrontend and uses the shared UI package.
- The first screen exposes application tracking, CV update status, and extension synchronization readiness.
- Unauthenticated users are handled without placing private dashboard behavior in the landing app.

## Open Questions

- Final deployment split: subdomain such as `app.missionpulse.app` or path routing behind a reverse proxy.
- Extension sync protocol: Chrome external messaging, Supabase-backed queue, or both.
- Source of truth for applications and CV: Supabase tables, extension IndexedDB, or a hybrid model with explicit sync.
