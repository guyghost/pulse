# Connector Health workflow retirement model

Status: **REVISION 7 — REVIEWED FOR RETIREMENT (2026-08-20)**.

This revision supersedes the active Connector Health workflow protocol. The
scheduled GitHub Actions workflow and its issue-writing orchestration are
retired because they repeatedly report infrastructure/tooling failures as
connector failures and create noisy issues without exercising authenticated
browser sessions.

The user-approved retirement request is a deterministic signal. This model,
not issue text, command output or an LLM, decides the allowed transition.

## Scope

This model owns only the remote automation named **Connector Health**:

- `.github/workflows/connector-health.yml`;
- the connector-failure issue template used by that automation;
- `apps/extension/scripts/connector-health/` and tests that exercise those
  workflow-only scripts;
- documentation that claims the scheduled workflow or automatic issue writer
  is active.

The following behavior is explicitly outside the retirement and must remain:

- pure parser-health classification in
  `src/lib/core/connectors/parser-health-logic.ts`;
- scan-time parser-health orchestration and local storage in `src/lib/shell/`;
- the fixture-only local `health-check` commands and their reporter/runner;
- parser, connector, scanner and storage tests that protect extension runtime
  behavior;
- historical Supabase migrations and schema compatibility.

## States and transitions

```text
active
  -> RETIREMENT_REVIEWED -> retirement_ready
  -> RETIRE_IMPLEMENTED -> verifying

verifying
  -> VERIFY_PASSED -> retired
  -> VERIFY_FAILED -> verification_failed

verification_failed
  -> FIX_PREPARED -> verifying
```

| State                 | Event                 | Guard                                               | Next                  | Effects                                                   |
| --------------------- | --------------------- | --------------------------------------------------- | --------------------- | --------------------------------------------------------- |
| `active`              | `RETIREMENT_REVIEWED` | scope and retained runtime boundaries are explicit  | `retirement_ready`    | record this reviewed model                                |
| `retirement_ready`    | `RETIRE_IMPLEMENTED`  | only in-scope scheduled/issue automation is removed | `verifying`           | delete workflow automation and remove stale documentation |
| `verifying`           | `VERIFY_PASSED`       | all invariants and the verification matrix pass     | `retired`             | no further effect                                         |
| `verifying`           | `VERIFY_FAILED`       | any invariant or required check fails               | `verification_failed` | retain failure evidence; do not claim retirement complete |
| `verification_failed` | `FIX_PREPARED`        | fix remains inside reviewed scope                   | `verifying`           | rerun the complete verification matrix                    |

Every absent state/event pair is forbidden. `retired` is the only successful
terminal. `verification_failed` is non-terminal and cannot be presented as a
successful retirement.

## Effects and invariants

After `RETIRE_IMPLEMENTED`:

1. GitHub has no scheduled or manual workflow named Connector Health.
2. Repository code has no workflow-only actor that can query or create GitHub
   issues for connector health.
3. No workflow grants `issues: write` for connector-health automation.
4. CI and release workflows remain unchanged except for dependency-pin updates
   separately covered by their own policy models.
5. Local fixture health checks remain runnable and cannot access live browser
   sessions, cookies or authenticated connector endpoints.
6. Runtime parser-health state, events, persistence and notifications remain
   byte-for-byte unchanged by this retirement.
7. Historical database migrations are never rewritten or deleted.
8. Reintroducing remote connector-health automation requires a new model and
   review; a retry, free-text issue or LLM signal cannot reactivate it.

Cancellation has no special recovery transition: before the removal lands,
the repository remains `active`; after it lands and verifies, it is `retired`.
There is no runtime retry or partial issue-write path in `retired` because the
workflow and token-bearing actor no longer exist.

## Review

Review completed against the project checklist:

- **Nominal:** workflow, issue writer, workflow-only scripts/tests and stale
  docs are removed; local/runtime health behavior is retained.
- **Errors:** missing references, broken local checks or any CI failure select
  `VERIFY_FAILED`, never `retired`.
- **Cancellation:** an interrupted edit or check cannot produce a successful
  terminal claim.
- **Retries:** only `verification_failed -> FIX_PREPARED -> verifying` is
  allowed; retirement never retries an issue write.
- **Permissions:** successful retirement removes the connector-health
  `issues: write` authority and introduces no replacement token path.
- **Terminal states:** `retired` is the sole successful terminal;
  `verification_failed` requires correction and full re-verification.
- **Boundary:** parser-health runtime behavior, fixture health checks and
  historical database artifacts are explicitly preserved.

No transition is controlled by free text or an LLM.

## Verification matrix

Retirement reaches `retired` only when all rows pass:

| Requirement                   | Required evidence                                                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflow absent               | repository search and workflow inventory contain no `connector-health.yml` or `name: Connector Health`                                         |
| Issue writer absent           | no remaining workflow/script reference can create connector-health issues and no connector-health workflow permission includes `issues: write` |
| Workflow-only code absent     | `scripts/connector-health/` and its dedicated unit tests are absent                                                                            |
| Local fixture checks retained | `pnpm --filter @pulse/extension health-check` succeeds                                                                                         |
| Runtime health retained       | parser-health core, shell and storage unit tests succeed                                                                                       |
| CI integrity                  | format, lint, typecheck, unit tests and production build succeed under the pinned toolchains                                                   |
| Model drift absent            | changed files stay within this scope; runtime parser-health and historical migrations have no diff                                             |
