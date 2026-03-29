# Context: CI/CD et Health Checks Connecteurs

## Objective
Créer un pipeline CI/CD complet pour MissionPulse qui :
1. Build et package l'extension Chrome automatiquement
2. Publie vers Chrome Web Store sur release
3. Surveille l'état des connecteurs et alerte quand ils cassent

## Constraints
- Platform: Chrome Extension (Manifest V3)
- CI Platform: GitHub Actions
- Package Manager: pnpm
- Versioning: Semantic versioning via git tags
- Tech Stack: Vite, Svelte 5, TypeScript, Vitest

## Current State
- CI existe déjà: `.github/workflows/ci.yml` avec TypeScript check, tests unitaires, build
- Extension: Manifest V3 avec side panel, service worker, offscreen document
- Connecteurs: 5+ connecteurs (FreeWork, LeHibou, Hiway, Collective, CherryPick)
- Tests existants: Tests unitaires pour les parsers, tests E2E pour la résilience

## Technical Decisions
| Decision | Justification | Agent |
|----------|---------------|-------|
| `connector-health.yml` exécute `pnpm health-check:json` et parse un rapport JSON | Aligne le workflow avec le runner réel au lieu d'invoquer directement les fichiers de test | @integrator |
| Les fonctions réutilisables des connecteurs vivent dans des modules `*.health.ts` séparés | Évite l'import de `test.describe()` hors runtime Playwright et rend `run-health-checks.ts` exécutable | @integrator |
| Le lockfile pnpm est régénéré avec les nouvelles dépendances CI/tooling | Garantit que `pnpm install --frozen-lockfile` fonctionne en CI | @integrator |

## Artifacts Produced
| File | Agent | Status |
|------|-------|--------|
| `.github/workflows/release.yml` | @codegen/@integrator | integrated |
| `.github/workflows/connector-health.yml` | @codegen/@integrator | integrated |
| `scripts/build-extension.sh` | @codegen | created |
| `tests/health/run-health-checks.ts` | @tests/@integrator | integrated |
| `tests/health/connectors/` | @tests/@integrator | integrated |

## Inter-Agent Notes
<!-- Format: [@source → @destination] Message -->

### [@orchestrator → @codegen]
Crée le pipeline CI/CD complet pour MissionPulse :

**Workflows GitHub Actions:**
1. `release.yml` - Déclenché sur les tags semver (`v*`)
   - Bump version dans manifest.json et package.json
   - Build avec Vite
   - Créer un .zip signé avec sources
   - Upload artifact
   - Publier sur Chrome Web Store (si credentials configurés)

2. `connector-health.yml` - Déclenché périodiquement (cron)
   - Run tous les jours à 8h
   - Exécute les health checks des connecteurs
   - Crée une issue GitHub si un connecteur casse

3. Améliorer `ci.yml` existant
   - Ajouter cache pnpm optimisé
   - Ajouter lint avec ESLint
   - Ajouter format check avec Prettier
   - Ajouter couverture de tests
   - Build conditionnel sur PR

**Scripts de build:**
- `scripts/build-extension.sh` - Build pour production avec version bump
- `scripts/verify-manifest.ts` - Vérifier que manifest.json est valide

**Fichiers de référence:**
- `/Users/guy/Developer/dev/pulse/.github/workflows/ci.yml` (existant)
- `/Users/guy/Developer/dev/pulse/package.json`
- `/Users/guy/Developer/dev/pulse/src/manifest.json`
- `/Users/guy/Developer/dev/pulse/src/lib/shell/connectors/` (tous les connecteurs)

### [@orchestrator → @tests]
Crée le système de health checks pour les connecteurs :

**Objectif:** Détecter automatiquement quand un connecteur cesse de fonctionner (DOM changé, API modifiée, etc.)

**Structure:**
```
tests/health/
├── connectors/
│   ├── freework.health.test.ts
│   ├── lehibou.health.test.ts
│   ├── hiway.health.test.ts
│   ├── collective.health.test.ts
│   └── cherrypick.health.test.ts
├── run-health-checks.ts    # Script principal
├── reporter.ts             # Rapports et notifications
└── README.md               # Documentation
```

**Fonctionnement:**
- Chaque health check tente un vrai appel au site (pas de mock)
- Vérifie que le parsing fonctionne encore
- Mesure le temps de réponse
- Détecte les changements de structure HTML
- Génère un rapport JSON

**CI Integration:**
- Script qui peut être exécuté en CI
- Exit code non-zero si un connecteur est cassé
- Capture des screenshots en cas d'erreur (Playwright)
- Notification GitHub Issues ou Slack

**Connecteurs à tester:**
- FreeWork (API publique)
- LeHibou (HTML scraping)
- Hiway (HTML scraping)  
- Collective (HTML scraping)
- CherryPick (HTML scraping)

**Référence:**
- `/Users/guy/Developer/dev/pulse/src/lib/shell/connectors/` (implémentations)
- `/Users/guy/Developer/dev/pulse/tests/unit/connectors/` (tests existants)
- `/Users/guy/Developer/dev/pulse/tests/e2e/resilience/connector-failure.test.ts` (exemples E2E)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  GitHub Actions CI/CD                                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ ci.yml       │  │ release.yml  │  │ connector-health │   │
│  │              │  │              │  │ .yml             │   │
│  │ - Lint       │  │ - Tag trigger│  │ - Cron daily     │   │
│  │ - Test       │  │ - Version    │  │ - Run health     │   │
│  │ - Build      │  │ - Build zip  │  │   checks         │   │
│  │ - Coverage   │  │ - CWS publish│  │ - Create issues  │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Health Check System                                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  tests/health/connectors/                                    │
│  ├── freework.health.test.ts ──► API fetch + parse          │
│  ├── lehibou.health.test.ts ───► Scrape + parse             │
│  ├── hiway.health.test.ts ─────► Scrape + parse             │
│  ├── collective.health.test.ts ► Scrape + parse             │
│  └── cherrypick.health.test.ts ► Scrape + parse             │
│                                                              │
│  run-health-checks.ts                                        │
│  ├── Parallel execution                                      │
│  ├── Response time measurement                               │
│  ├── Structure validation                                    │
│  └── JSON report generation                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```
