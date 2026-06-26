# Contributing to MissionPulse

Thanks for helping improve MissionPulse. This project is local-first and privacy-sensitive, so contributions must preserve the functional core / imperative shell boundary and avoid collecting credentials.

## Setup

```bash
pnpm install
pnpm dev
pnpm ci:check
```

Use `pnpm dev:local` when you need the local Supabase stack for the landing/dashboard flows.

## Development Rules

- Use Svelte 5 runes only: `$props`, `$state`, `$derived`, `$effect`.
- Keep `apps/extension/src/lib/core/` pure: no I/O, no async, no `chrome.*`, no `Date.now()`.
- Keep side effects in `apps/extension/src/lib/shell/`.
- Do not commit secrets, local `.env` files, cookies, session tokens, or generated release ZIPs.
- Add or update tests for parser, scoring, storage, and messaging changes.
- Use Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.

## Before Opening a Pull Request

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

For extension UI changes, run the relevant Playwright tests from `apps/extension`.

## Useful Documentation

- [Project README](../README.md)
- [Documentation index](../docs/README.md)
- [Architecture decisions](../docs/adr/README.md)
- [CI/CD](../docs/CI-CD.md)
- [Open source readiness](../docs/open-source-readiness.md)
