# GitHub workflows

The workflows enforce two distinct boundaries:

- CI may build and exercise an unpacked MV3 directory, but that directory is explicitly **unsealed** and is never presented as a Store package.
- Release automation consumes an already archived `TestedDistSealV1` plus the exact tested `dist/`, runs the package-only protocol, and stops at `package_validated`.

No workflow bumps a version, creates an ad hoc archive, submits to Chrome Web Store, claims a monitored rollout, or promotes a release. Those later transitions require their modeled signed receipts and explicit authorization.

## `ci.yml`

Triggers on pushes and pull requests to `develop`/`main`, and by manual dispatch.

The workflow runs format, lint, TypeScript, unit, build, browser E2E, and packaged-MV3 gates. The build job uploads `chrome-extension-dist-unsealed` for short-lived inspection only. It does not emit a ZIP.

The complete packaged-MV3 gate must use the committed scenario inventory at `apps/extension/tests/mv3/scenarios.v1.json`. A later local sealer is responsible for binding that exact nonempty inventory, the aggregate result, zero skips/failures/diagnostics, and identical pre/post canonical trees.

## `connector-health.yml`

Ce workflow planifié ou manuel exécute uniquement les fixtures committées des six connecteurs. Il
n'a accès à aucune session navigateur, aucun cookie, aucun identifiant de production et aucun
endpoint authentifié de plateforme connecteur. Seul `issue-writer` utilise ensuite l'API GitHub
authentifiée, après admission d'un échec vérifié. Le registre de santé reste égal au catalogue
complet, y compris Malt, même si une configuration de build exclut un connecteur.

Permissions exactes :

- `health-capture`: `contents: read` ;
- `issue-writer`: `actions: read`, `contents: read`, `issues: write` ;
- `conclusion`: `contents: read`.

Les permissions globales sont `{}`. Le vérificateur local de source et `conclusion` ne reçoivent
aucun `GITHUB_TOKEN` dans leur environnement. Seul l'acteur admis de `issue-writer` reçoit le token
pour les lectures d'étiquettes/issues et l'unique POST éventuel. Les actions d'artifact transfèrent
uniquement l'evidence du run courant : artifact `connector-health-report`, fichier unique
`connector-health-evidence.v1.json`, conservation 14 jours, sans overwrite.

Chaque job utilise `ubuntu-24.04`, Node `22.23.1`, pnpm `10.32.1`, admet le checkout exact avant
toute installation, puis vérifie l'identité `packageManager` avec intégrité et exécute
`pnpm install --frozen-lockfile`. Les entrées principales committées sont :

```text
pnpm --filter @pulse/extension exec tsx scripts/connector-health/capture.ts
pnpm --filter @pulse/extension exec tsx scripts/connector-health/issue-writer.ts
pnpm --filter @pulse/extension exec tsx scripts/connector-health/conclusion-cli.ts
```

Pins revus : `actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd`,
`pnpm/action-setup@0e279bb959325dab635dd2c09392533439d90093`,
`actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e`,
`actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` et
`actions/download-artifact@70fc10c6e5e1ce46ad2ea6f2b72d43f7d47b13c3`.

L'admission lie exactement dépôt, branche par défaut, ref, SHA, workflow, event et checkout propre.
Avec `contents: read`, elle ne peut pas vérifier la protection de branche : revues obligatoires,
protection et checks requis restent des contrôles administrateur hors bande. Le périmètre exécutable
fait confiance aux scripts/tests/dépendances revus. Les fixtures sont des données hostiles mais non
exécutables. Le PGID prouve seulement que le groupe contrôlé est vide ; il ne prétend pas contenir
du code committé malveillant qui ferait `setsid` ou se daemoniserait.

Les terminaux enfants sont `capture_passed`, `capture_failed`,
`capture_infrastructure_failed`, `issue_settled` et `issue_failed`. Après le marqueur
`CONCLUSION_ACTOR_STARTED`, les trois seules conclusions sont `passed`, `failed_recorded` et
`failed_unreported`; les deux dernières sont rouges. Une panne de checkout/setup/install/module ou
d'input avant le marqueur est `pre_actor_bootstrap_interrupted` : GitHub reste rouge, aucun terminal
XState n'est fabriqué et aucune conclusion de santé n'est revendiquée.

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
