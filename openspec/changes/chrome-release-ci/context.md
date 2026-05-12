# Context: Chrome Release CI

## Objective

Fiabiliser la CI et le workflow de release pour pouvoir publier facilement des versions successives de l’extension MissionPulse sur le Chrome Web Store.

## Constraints

- Platform: Chrome Extension Manifest V3, Svelte 5, Vite, Turborepo
- Offline first: yes
- Design system: Analytical Blueprint
- Package manager: pnpm 10.32.1
- Architecture: Functional Core & Imperative Shell remains mandatory for app code; CI/release scripts must not weaken it.

## Current Findings

- Existing CI workflows: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/workflows/connector-health.yml`.
- Existing release path: tag `v*.*.*` builds, verifies manifest, creates ZIP, creates GitHub release, then uploads to Chrome Web Store when secrets are configured.
- **Fixed**: Version mismatch — manifest was `0.1.0` while package.json files were `0.2.1`. Aligned manifest to `0.2.1`.
- **Fixed**: `bump-version.ts` now bumps root `package.json` too (monorepo consistency).
- **Fixed**: `verify-manifest.ts` now exits with code 1 on version mismatch (was only a warning).
- **Fixed**: `verify-manifest.ts` supports `--expected-version <semver>` for CI release gate.
- **Fixed**: Release workflow now validates version in built manifest matches tag version.
- **Fixed**: Release workflow now validates root `package.json` version after bump as well.
- **Fixed**: Release workflow now validates extension `apps/extension/package.json` version after bump (symmetric with root package check).
- **Fixed**: Release workflow uses reproducible ZIP (sorted file list, no timestamps).
- **Fixed**: Release workflow uses `secrets.CHROME_EXTENSION_ID` in job `if` (was incorrectly using `env`).
- **Fixed**: `connector-health.yml` missing `corepack enable` step (inconsistent with other workflows).
- **Added**: Manual dispatch for release workflow with `version` and `dry_run` inputs.
- **Added**: `publish-skip-notice` job explains why CWS publish was skipped.

## Technical Decisions

| Decision                                                             | Justification                                                                                               | Agent         |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------- |
| Use GitHub Actions as delivery gate                                  | Existing workflows already target CI, release, and connector health                                         | @orchestrator |
| Keep Chrome Web Store credentials in GitHub Secrets only             | Avoid secrets in repository; aligns with store publishing requirements                                      | @orchestrator |
| Version mismatch = hard CI failure, not warning                      | Prevents shipping wrong version to Chrome Web Store                                                         | @codegen      |
| Bump all 3 version files in lockstep (root pkg, ext pkg, manifest)   | Monorepo consistency; single source of truth for version                                                    | @codegen      |
| Reproducible ZIP via sorted find + zip -X                            | Ensures identical ZIP for same source; aids debugging                                                       | @codegen      |
| Manual dispatch with dry_run                                         | Allows testing release pipeline without publishing                                                          | @codegen      |
| CWS publish gated on secrets availability                            | Workflow succeeds even without CWS secrets configured                                                       | @codegen      |
| `--expected-version` flag on verify-manifest                         | Release-specific validation: tag version must equal manifest version                                        | @codegen      |
| Export pure release helpers from scripts with direct-execution guard | Tests can import the real validation/versioning logic without duplicating it or triggering CLI side effects | @integrator   |

## Artifacts Produced

| File                                                           | Agent         | Status                                                                                    |
| -------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------- |
| `openspec/changes/chrome-release-ci/context-log.jsonl`         | @orchestrator | created                                                                                   |
| `openspec/changes/chrome-release-ci/context.md`                | @orchestrator | updated                                                                                   |
| `apps/extension/src/manifest.json`                             | @codegen      | version aligned to 0.2.1                                                                  |
| `apps/extension/scripts/bump-version.ts`                       | @codegen      | bumps root pkg too                                                                        |
| `apps/extension/scripts/verify-manifest.ts`                    | @codegen      | hard error + --expected-version                                                           |
| `.github/workflows/release.yml`                                | @codegen      | version gates (root pkg + ext pkg + manifest), manual dispatch, dry run, reproducible ZIP |
| `.github/workflows/connector-health.yml`                       | @codegen      | added corepack enable                                                                     |
| `.github/workflows/README.md`                                  | @codegen      | documented all changes                                                                    |
| `apps/extension/tests/unit/scripts/verify-manifest.test.ts`    | @integrator   | imports real script helpers + covers parseArgs                                            |
| `apps/extension/tests/unit/scripts/bump-version.test.ts`       | @integrator   | imports real script helpers                                                               |
| `apps/extension/tests/unit/scripts/release-validation.test.ts` | @integrator   | validates all three version files with shared helpers                                     |

## Integration Summary

- Resolved the test/script drift by exporting pure helpers from the release scripts and guarding `main()` so unit tests can import the real logic safely.
- Tightened release validation by checking root `package.json` version consistency in both workflow documentation and read-only integration tests.
- Final review approved the chrome-release-ci scope.
- Post-review verification found global branch blockers outside this scope: extension typecheck fails in `hiway.connector.ts` and `settings-page.svelte.ts`; Playwright E2E timed out with many UI flow failures while the working tree contains many unrelated runtime/UI changes.

## Verification Summary

| Command                                                                   | Result               | Scope                            |
| ------------------------------------------------------------------------- | -------------------- | -------------------------------- |
| `pnpm --filter @pulse/extension exec vitest run tests/unit/scripts`       | ✅ 71 tests passed   | chrome-release-ci                |
| `pnpm --filter @pulse/extension verify-manifest --expected-version 0.2.1` | ✅ passed            | chrome-release-ci                |
| `pnpm --filter @pulse/extension exec tsc --noEmit`                        | ❌ failed            | unrelated current worktree drift |
| `pnpm --filter @pulse/extension test:e2e`                                 | ❌ timed out/failing | unrelated current worktree drift |

## Inter-Agent Notes

<!-- Format: [@source → @destination] Message -->

[@orchestrator → @codegen] Focus on CI/CD and release automation only. Do not change product runtime behavior unless required by release validation.
[@tests → @codegen] Extract pure functions from verify-manifest.ts and bump-version.ts to src/lib/core/release/ so tests can import instead of duplicating logic.
[@tests → @codegen] The release-validation.test.ts version consistency check will FAIL in dev (package.json=0.2.1, manifest.json=0.1.0) and PASS after release workflow bumps both. This is intentional.
