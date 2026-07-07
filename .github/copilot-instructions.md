# Copilot Instructions — MissionPulse

MissionPulse is a Chrome extension (Manifest V3) in a pnpm + Turborepo monorepo. It scrapes freelance-mission platforms via the user's existing browser sessions and surfaces them in a single scored feed. 100% local-first: no backend, no telemetry, no stored credentials.

`AGENTS.md`, `README.md`, and `.github/CONTRIBUTING.md` are the long-form sources of truth. This file captures the project-specific rules an agent is most likely to get wrong.

## Monorepo layout

- `apps/extension/` — Chrome extension (Svelte 5 + Vite + MV3). All paths below are relative to here.
- `apps/landing/` — static marketing site (missionpulse.app).
- `packages/design/`, `packages/domain/`, `packages/ui/`, `packages/tsconfig/` — shared.

Run commands from the repo root unless noted. Most tasks target the extension: `pnpm --filter @pulse/extension <script>`.

## Commands

```bash
pnpm dev:local        # local Supabase + .env.local + dev servers (Chrome APIs stubbed with mocks)
pnpm dev              # dev servers only
pnpm ci:check         # format:check && lint && typecheck && test && build  (also the pre-push gate)
pnpm improvement:loop # format, lint, typecheck, tests, parser regression, connector health checks

# Extension-scoped
pnpm --filter @pulse/extension typecheck
pnpm --filter @pulse/extension lint
pnpm --filter @pulse/extension test
pnpm --filter @pulse/extension test:watch
pnpm --filter @pulse/extension test:coverage          # 70% gate on src/lib/core/**
pnpm --filter @pulse/extension test:regression        # golden parser regression
UPDATE_GOLDENS=1 pnpm --filter @pulse/extension test:regression   # regenerate goldens
pnpm --filter @pulse/extension health-check           # fixture-based, no live platform calls
pnpm --filter @pulse/extension health-check:json
pnpm --filter @pulse/extension test:e2e               # Playwright (builds @pulse/ui first)
```

Run a **single** unit test:

```bash
pnpm --filter @pulse/extension exec vitest run tests/unit/scoring/relevance.test.ts
# or by name pattern:
pnpm --filter @pulse/extension exec vitest run -t "deduplicates by URL"
```

Dev Panel: `Ctrl+Shift+D` inside the side panel toggles mock injection, state switches, and bridge logs.

The extension dev server runs on **http://localhost:5176** (see `apps/extension/vite.config.ts`); in dev mode Chrome APIs are stubbed with mocks, so the side panel UI is fully drivable in a normal browser tab. Use the Playwright MCP server (`.mcp.json`) for visual verification of UI changes — start `pnpm dev` first, then navigate the browser to the side panel URL.

## Architecture — Functional Core / Imperative Shell (strict)

`apps/extension/src/lib/core/` is **pure**: no `fetch`, no `indexedDB`, no `chrome.*`, no `async/await`, no `Date.now()`, no `Math.random()`, no `console`. Anything non-deterministic (current time, generated IDs) is passed in as a parameter from the shell.

`apps/extension/src/lib/shell/` owns all I/O, async, retries, and orchestration, and delegates computation to core.

- **Shell may import core. Core MUST NEVER import shell.** Treat a `core/` file importing from `shell/` as a build error.
- Connectors inject `new Date()` and ID prefixes into the pure parsers in `core/connectors/`.
- `vitest.config.ts` enforces a 70/70/60/70 coverage gate on `src/lib/core/**` — keep new pure logic there so it is covered by mock-free unit tests.

## Workflow rule: Model → Review → Implement → Verify

Any change to a workflow, business feature, or state decision must go through this loop. **Never jump from prompt to code.**

1. **Model** — Define states, events, transitions, side effects, and invariants explicitly. Authoritative models live in `apps/extension/src/models/*.model.md` and proposed changes in `openspec/changes/`. Use XState for important workflows. If the behavior cannot be modeled, it is not ready to implement.
2. **Review** — Confirm the model covers nominal paths, errors, cancellations, retries, permissions, and terminal states. Disallow implicit or free-text-driven transitions.
3. **Implement** — UI, messaging, and orchestration consume the model. LLMs live only inside dedicated AI workers (e.g. `lib/shell/ai/`); they may propose/extract/classify/enrich content but **never decide a state transition**.
4. **Verify** — Test allowed and forbidden transitions and model invariants; confirm no business logic leaked outside the model.

Short form: **the LLM produces signals; the model decides.**

## Svelte 5 & styling conventions

- Svelte 5 runes only. Use `$props()`, `$state`, `$derived`, `$effect`.
- Forbidden: `export let`, `$:` reactive declarations, `writable`/`readable`/`derived` stores, `on:click`/`on:input`, `createEventDispatcher`, `$$props`/`$$restProps`. Use native event attributes (`onclick`) and callback props.
- Shared UI state lives in `src/lib/state/*.svelte.ts` as factory functions or classes using runes.
- TailwindCSS 4, CSS-first. The design tokens live in `packages/design/` and are surfaced via `apps/extension/src/ui/design-tokens.css`. **Do not add `tailwind.config.js`/`.ts`** or JS/TS Tailwind config.
- Atomic Design in `src/ui/`: atoms → molecules → organisms → templates → pages. Atoms/molecules receive data via props only; organisms and pages may touch state modules.

## Connectors & messaging

- One platform = a **pure parser** in `core/connectors/{platform}-parser.ts` (`parse{Platform}HTML(html, now, idPrefix)`) + an **I/O connector** in `shell/connectors/{platform}.connector.ts`. Register new connectors in `shell/connectors/index.ts`, add `host_permissions` to `src/manifest.json`, and add a mock-free parser test in `tests/unit/connectors/`.
- When a platform's DOM changes, the connector throws a typed `ConnectorError`; the runner marks it `error`, notifies the user, and other connectors continue. Do not swallow connector errors.
- The side panel never calls IndexedDB, `chrome.cookies`, or other `chrome.*` APIs directly. Everything crosses contexts through `src/lib/shell/messaging/bridge.ts` with typed messages.

## Commit hygiene

- Conventional Commits with domain scope: `feat(connector): …`, `fix(tjm): …`, `refactor(scoring): …`.
- No `any` (TypeScript strict). No stored credentials, cookies, session tokens, or generated release ZIPs in commits.
- `pre-push` runs `ci:check`. Make it green locally before pushing.
