# GitHub workflows

The workflows enforce two distinct boundaries:

- CI may build and exercise an unpacked MV3 directory, but that directory is explicitly **unsealed** and is never presented as a Store package.
- Release automation consumes an already archived `TestedDistSealV1` plus the exact tested `dist/`, runs the package-only protocol, and stops at `package_validated`.

No workflow bumps a version, creates an ad hoc archive, submits to Chrome Web Store, claims a monitored rollout, or promotes a release. Those later transitions require their modeled signed receipts and explicit authorization.

## `ci.yml`

Triggers on pushes and pull requests to `develop`/`main`, and by manual dispatch.

The workflow runs format, lint, TypeScript, unit, build, browser E2E, and packaged-MV3 gates. The build job uploads `chrome-extension-dist-unsealed` for short-lived inspection only. It does not emit a ZIP.

The complete packaged-MV3 gate must use the committed scenario inventory at `apps/extension/tests/mv3/scenarios.v1.json`. A later local sealer is responsible for binding that exact nonempty inventory, the aggregate result, zero skips/failures/diagnostics, and identical pre/post canonical trees.

## `release.yml`

This workflow is manual and local-first. It accepts:

- `source_commit`: exact clean commit recorded by the seal;
- `expected_version`: committed extension version;
- `evidence_run_id`: Actions run that archived the sealed candidate;
- `evidence_artifact`: artifact containing exactly `tested-dist-seal.json` and its tested `dist/`.

The job installs the committed verifier before ingesting the seal. From `Download sealed candidate evidence` onward, it performs no install, build, version bump, connector resolution, or `dist` rewrite. It calls only the shared `package:sealed` and `verify:release-artifact` boundaries, uploads the ZIP, checksum sidecar, validation record, seal and package receipt together, then downloads them in a second job and recomputes every digest.

The workflow's maximum claim is `package_validated`. Store readiness, submission, observation, promotion and rollback remain separate modeled events.

## Local commands

The worktree must be clean at the exact candidate commit before producing a seal. The sealer consumes complete gate input; it does not manufacture missing evidence.

```bash
pnpm --filter @pulse/extension release:seal-candidate -- \
  --input output/playwright/mv3-evidence/final-gate-input.json \
  --dist apps/extension/dist \
  --output output/playwright/mv3-evidence/tested-dist-seal.json

pnpm --filter @pulse/extension package:sealed -- \
  --seal output/playwright/mv3-evidence/tested-dist-seal.json \
  --dist apps/extension/dist \
  --releases apps/extension/releases \
  --artifact-id artifact-0.2.2-<commit> \
  --journal-id journal-0.2.2-<commit>
```

The package command never installs, builds, bumps, or deletes `dist`. Run the consumer verifier against the exact published bundle and a fresh absent extraction path:

```bash
pnpm --filter @pulse/extension verify:release-artifact -- \
  --bundle apps/extension/releases/v0.2.2 \
  --zip apps/extension/releases/v0.2.2/missionpulse.zip \
  --checksum apps/extension/releases/v0.2.2/missionpulse.zip.sha256 \
  --validation apps/extension/releases/v0.2.2/validation.json \
  --extract-fresh /tmp/missionpulse-0.2.2-consumer-check
```

## Actions in use

| Action                      | Version | Purpose                           |
| --------------------------- | ------- | --------------------------------- |
| `actions/checkout`          | v6.0.2  | Exact source checkout             |
| `actions/setup-node`        | v6      | Node toolchain                    |
| `pnpm/action-setup`         | v6      | pnpm toolchain                    |
| `actions/cache`             | v6      | Dependency and browser cache      |
| `actions/upload-artifact`   | v7      | Immutable evidence transfer       |
| `actions/download-artifact` | v8      | Sealed input and consumer recheck |
| `codecov/codecov-action`    | v7      | Non-blocking coverage upload      |

Les permissions du workflow de release restent en lecture seule. Son `GITHUB_TOKEN` sert uniquement
à télécharger l'artifact de preuve explicitement nommé depuis le run explicitement nommé.
