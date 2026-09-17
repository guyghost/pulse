# Workflows GitHub

Les workflows appliquent deux frontières distinctes :

- La CI peut builder et éprouver un répertoire MV3 non packagé, mais ce répertoire est explicitement **non scellé** (unsealed) et n'est jamais présenté comme un package Store.
- L'automatisation de release consomme un `TestedDistSealV1` déjà archivé plus le `dist/` exact testé, exécute le protocole package-only et s'arrête à `package_validated`.

Aucun workflow ne bump une version, ne crée une archive ad hoc, ne soumet au Chrome Web Store, ne revendique un rollout supervisé ni ne promeut une release. Ces transitions ultérieures exigent leurs reçus signés modélisés et une autorisation explicite.

## `ci.yml`

Se déclenche sur les push et pull requests vers `develop`/`main`, et par dispatch manuel.

Le workflow exécute les gates format, lint, TypeScript, unitaires, build, E2E navigateur et MV3 packagé. Le job de build upload `chrome-extension-dist-unsealed` uniquement pour inspection éphémère. Il ne produit pas de ZIP.

La gate MV3 packagée complète doit utiliser l'inventaire de scénarios commité à `apps/extension/tests/mv3/scenarios.v1.json`. Un sealer local ultérieur est responsable de lier cet inventaire exact non vide, le résultat agrégé, zéro skip/failure/diagnostic et des arbres canoniques pré/post identiques.

## `release.yml`

Ce workflow est manuel et local-first. Il accepte :

- `source_commit` : commit propre exact enregistré par le seal ;
- `expected_version` : version de l'extension commitée ;
- `evidence_run_id` : run Actions ayant archivé le candidat scellé ;
- `evidence_artifact` : artifact contenant exactement `tested-dist-seal.json` et son `dist/` testé.

Le job installe le vérificateur commité avant d'ingérer le seal. À partir de `Download sealed candidate evidence`, il n'effectue aucune installation, build, bump de version, résolution de connecteurs ni réécriture de `dist`. Il n'appelle que les frontières partagées `package:sealed` et `verify:release-artifact`, upload ensemble le ZIP, le sidecar de checksum, l'enregistrement de validation, le seal et le reçu de package, puis les retélécharge dans un second job et recalcule chaque digest.

La revendication maximale du workflow est `package_validated`. La readiness Store, la soumission, l'observation, la promotion et le rollback restent des événements modélisés séparés.

## Commandes locales

Le worktree doit être propre au commit candidat exact avant de produire un seal. Le sealer consomme une entrée de gate complète ; il ne fabrique pas de preuves manquantes.

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

La commande package n'installe, ne build, ne bump et ne supprime jamais `dist`. Exécuter le vérificateur consommateur contre le bundle publié exact et un chemin d'extraction frais absent :

```bash
pnpm --filter @pulse/extension verify:release-artifact -- \
  --bundle apps/extension/releases/v0.2.2 \
  --zip apps/extension/releases/v0.2.2/missionpulse.zip \
  --checksum apps/extension/releases/v0.2.2/missionpulse.zip.sha256 \
  --validation apps/extension/releases/v0.2.2/validation.json \
  --extract-fresh /tmp/missionpulse-0.2.2-consumer-check
```

## Actions utilisées

| Action                      | Version | Rôle                                   |
| --------------------------- | ------- | -------------------------------------- |
| `actions/checkout`          | v6.0.2  | Checkout exact de la source            |
| `actions/setup-node`        | v6      | Toolchain Node                         |
| `pnpm/action-setup`         | v6      | Toolchain pnpm                         |
| `actions/cache`             | v6      | Cache dépendances et navigateur        |
| `actions/upload-artifact`   | v7      | Transfert de preuves immuable          |
| `actions/download-artifact` | v8      | Entrée scellée et recheck consommateur |
| `codecov/codecov-action`    | v7      | Upload de couverture non bloquant      |

Les permissions du workflow de release restent en lecture seule. Son `GITHUB_TOKEN` sert uniquement
à télécharger l'artifact de preuve explicitement nommé depuis le run explicitement nommé.
