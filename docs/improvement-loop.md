# Boucle d'amélioration MissionPulse

Ce document décrit la boucle fermée utilisée pour améliorer l'extension Chrome de façon continue, sans télémétrie externe.

## Cycle

```text
Observer → Prioriser → Corriger → Vérifier → Publier → Apprendre
    ↑                                                      │
    └──────────────── feedback utilisateur / CI ───────────┘
```

| Phase         | Outil                                                                      | Sortie               |
| ------------- | -------------------------------------------------------------------------- | -------------------- |
| **Observer**  | `error-analytics`, `parser-health`, `SourceHealthPanel`, export diagnostic | Signaux locaux       |
| **Prioriser** | OpenSpec (`openspec/changes/`), issues GitHub, rapports QA                 | Proposition ciblée   |
| **Corriger**  | PR + parsers Core, connecteurs Shell, UI opérationnelle                    | Code + tests         |
| **Vérifier**  | `pnpm improvement:loop`, CI, health checks cron                            | Rapport vert/rouge   |
| **Publier**   | `release.yml` → Chrome Web Store                                           | Version taggée       |
| **Apprendre** | Changelog, fixtures regression, golden files                               | Base de connaissance |

## Commandes locales

```bash
# Boucle complète (format, lint, typecheck, tests, régression, health)
pnpm improvement:loop

# Sous-ensembles
pnpm ci:check                              # gate pre-push (sans health dédié)
pnpm --filter @pulse/extension test:regression
pnpm --filter @pulse/extension health-check
pnpm --filter @pulse/extension health-check:json
```

## Health checks connecteurs

Les health checks CI s'appuient sur les **fixtures locales** (pas d'appels live aux plateformes) :

- tests unitaires parsers Core (`tests/unit/connectors/`)
- régression golden (`tests/unit/regression/`, `UPDATE_GOLDENS=1` pour régénérer)
- registre de couverture (`tests/health/connector-registry.ts`)

Le workflow `.github/workflows/connector-health.yml` exécute ces checks chaque jour à 08:00 UTC et crée une issue si un connecteur casse.

## Export diagnostic (utilisateur)

Dans **Paramètres → Données**, l'export diagnostic produit un JSON local contenant :

- version extension
- résumé erreurs (50 dernières, ring buffer)
- état santé connecteurs (circuit breaker)
- métadonnées navigateur (user-agent, version Chrome)

Ce fichier peut être joint à une issue GitHub (template `bug_report.yml`, zone _Connector_) sans exposer sessions ni cookies.

## Régénérer les golden files

Quand un connecteur change de format (DOM, API) :

```bash
cd apps/extension
UPDATE_GOLDENS=1 pnpm test:regression
git diff tests/fixtures/regression/
```

Vérifier manuellement les diffs avant commit.

### Matrice fixtures (17 cas)

| Connecteur  | Fixtures                                                   | Cas couverts                                                  |
| ----------- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| lehibou     | `basic`, `no-price`, `remote`, `encoding`, `hybrid-onsite` | TJM absent, full remote, encodage HTML/NBSP, hybride + onsite |
| free-work   | `basic`, `remote-modes`, `tjm-edge`                        | full/partial/none, TJM null et min seul                       |
| hiway       | `basic`, `remote-modes`, `tjm-null`                        | télétravail/hybride/présentiel, budget null                   |
| collective  | `basic`, `remote-tjm`, `encoding`                          | REMOTE/HYBRID/ON_SITE, formats TJM variés, accents            |
| cherry-pick | `basic`, `remote-rates`, `tjm-description`                 | displacement API, TJM depuis description                      |

## OpenSpec — backlog actif

| Change                    | Focus                               |
| ------------------------- | ----------------------------------- |
| `connector-coverage`      | Couverture parsers par connecteur   |
| `missing-test-coverage`   | Gaps E2E parser-health              |
| `e2e-suite-stabilization` | Flakiness Playwright                |
| `improvement-loop`        | Infrastructure boucle (ce document) |

## Critères de sortie d'une itération

Une itération est considérée terminée quand :

1. `pnpm improvement:loop` passe en local
2. La CI PR est verte (lint, tests, build, E2E)
3. Les health checks connecteurs sont verts
4. Si parser modifié : golden files à jour ou fixture ajoutée
5. OpenSpec proposal mise à jour (section Results)

## Privacy

- Aucune donnée utilisateur n'est envoyée automatiquement
- L'export diagnostic est **opt-in** et reste local jusqu'au partage manuel
- Les health checks CI n'utilisent que des fixtures anonymisées du repo
