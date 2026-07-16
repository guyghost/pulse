# MV3 packaged harness model

Status: reviewed target for Task 10 revision
Date: 2026-07-16

## Scope

This model owns the production-package verification lifecycle only. It never
changes application state or product behavior. The tested authority is the
exact `apps/extension/dist` tree produced by the canonical `test:mv3` command.

## States

```text
absent
  -> built
  -> manifest_validated
  -> artifact_sealed
  -> browser_launched
  -> diagnostics_armed
  -> bootstrap_observed
  -> exercising
  -> teardown_settling
  -> artifact_reverified
  -> passed

Any state -- failure --> failed
passed | failed -- evidence_attached --> archived
```

`passed`, `failed`, and `archived` are terminal for one Playwright test
fixture. A new test gets a fresh profile and a fresh lifecycle while using the
same sealed `dist` tree.

## Events and transitions

| State                 | Event                  | Guard                                                                                                      | Next state            | Effect                                                                                                        |
| --------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `absent`              | `BUILD_COMPLETED`      | build exited zero                                                                                          | `built`               | none                                                                                                          |
| `built`               | `MANIFEST_VERIFIED`    | post-build validator exited zero                                                                           | `manifest_validated`  | none                                                                                                          |
| `manifest_validated`  | `ARTIFACT_SCANNED`     | no forbidden DEV signature and strict permissions                                                          | `artifact_sealed`     | persist manifest, scan result and deterministic tree digest                                                   |
| `artifact_sealed`     | `BROWSER_STARTED`      | only sealed `dist` is loaded                                                                               | `browser_launched`    | create isolated persistent Chromium profile                                                                   |
| `browser_launched`    | `OBSERVERS_INSTALLED`  | page listeners and browser CDP auto-attach are active                                                      | `diagnostics_armed`   | observe page errors, console failures and worker Runtime events                                               |
| `diagnostics_armed`   | `WORKER_RESTARTED`     | Runtime is enabled before CDP `stopWorker` / `startWorker` and the post-stop execution context is observed | `bootstrap_observed`  | evaluate any harness probe, call `runIfWaitingForDebugger` fail-closed, retain the complete diagnostic stream |
| `bootstrap_observed`  | `USE_STARTED`          | extension id and side-panel path match the package                                                         | `exercising`          | expose the harness to the test                                                                                |
| `exercising`          | `USE_COMPLETED`        | none                                                                                                       | `teardown_settling`   | flush late browser tasks                                                                                      |
| `teardown_settling`   | `DIAGNOSTICS_ACCEPTED` | every diagnostic collection is empty                                                                       | `artifact_reverified` | recompute the tree digest                                                                                     |
| `artifact_reverified` | `DIGEST_MATCHED`       | post-test digest equals the sealed digest                                                                  | `passed`              | attach final evidence                                                                                         |
| any non-terminal      | `FAILURE`              | any rejected guard/effect or diagnostic                                                                    | `failed`              | attach diagnostics and artifact evidence                                                                      |
| `passed` or `failed`  | `CLEANUP_COMPLETED`    | context/profile cleanup attempted                                                                          | `archived`            | close CDP/context and remove profile                                                                          |

No transition is inferred from console text. Console/Runtime records are
signals; the deterministic diagnostic policy decides whether they are
blocking.

## Blocking diagnostic policy

- every page `pageerror`;
- every page `console.error` and every page warning matching the failure
  vocabulary;
- every service-worker `console.error` and every service-worker warning
  matching the failure vocabulary;
- every service-worker CDP `Runtime.exceptionThrown`, including unhandled
  promise rejections;
- any diagnostic arriving during the defined teardown settling window.

The diagnostic assertion is a fixture teardown invariant and runs after
`await use(...)`; individual tests receive only deeply frozen snapshot copies,
so they cannot opt out by omitting an assertion or mutating the fixture-owned
record.

## Artifact identity

The tree digest is SHA-256 over a sorted sequence of relative POSIX path, byte
length, and per-file SHA-256. The manifest is part of that tree. The same digest
must be observed before launch and after `use`; mutation is terminal failure.

Before launch the harness also rejects any packaged byte sequence identifying
`src/dev`, Chrome stubs, the DevPanel, bridge logger, DEV globals, or DEV storage
keys. Runtime absence alone is insufficient.

## Invariants

1. `pnpm --filter @pulse/extension test:mv3` is the canonical interface and its
   config discovers `tests/mv3/**`; any legacy command is an alias only.
2. CI installs Chromium, runs that exact command, and uploads
   `output/playwright` even on failure.
3. `verify-manifest --post-build` succeeds before the digest is sealed.
4. Manifest API permissions, optional host permissions, background worker and
   side panel path equal the explicit expected package contract; connector host
   permissions are freshly derived from the build resolver/config/environment,
   while feature-owned non-connector hosts remain explicit. No superset,
   unknown connector id, duplicate or unmapped connector passes.
5. Observers are installed before the canonical restarted worker bootstrap. The
   initial launch context establishes identity and the baseline execution
   generation; only a post-stop execution context can satisfy the bootstrap
   transition, even when Chromium reuses the same service-worker target.
6. The transfer from `diagnostics_armed` to `bootstrap_observed` cannot skip CDP
   Runtime exception/rejection observation.
7. A test body cannot report success before teardown diagnostics and the second
   digest have passed.
8. No Vite server, DEV stub, external backend, or product mutation is introduced
   by this harness.
