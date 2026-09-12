# Suivi de traduction — documentation en français

> Règle (voir [AGENTS.md](../AGENTS.md)) : la documentation `.md` vivante est en français ;
> le code et les commentaires sont en anglais. Les archives (plans datés, rapports générés,
> snapshots d'audit) conservent leur langue d'origine.

Cette page liste la documentation vivante restant à traduire en français. Mettre à jour la
checklist au fil des traductions.

## Reste à traduire

### Specs vivantes

- [ ] `docs/specs/dashboard-microfrontend.md` (~940 lignes)

### Models vivants (`apps/extension/src/models/`)

> Source de vérité référencée par les commentaires du code (par nom de fichier — ne pas
> renommer). Traduire le contenu, pas les chemins.

- [ ] `release-readiness.model.md` (~4 400 lignes)
- [ ] `sealed-candidate-transport-producer.model.md` (~4 100 lignes)
- [ ] `mv3-packaged-harness.model.md` (~2 070 lignes)
- [ ] `packaged-tab-scenarios.model.md` (~1 950 lignes)
- [ ] `sealed-candidate-transport-consumer.model.md` (~1 770 lignes)
- [ ] `local-data-reset.model.md` (~1 600 lignes)
- [ ] `settings-persistence.model.md` (~1 380 lignes)
- [ ] `dataset-write-capability.model.md` (~1 250 lignes)
- [ ] `modal-focus.model.md` (~1 220 lignes)
- [ ] `application-tracking.model.md` (~1 100 lignes)
- [ ] `db-migration.model.md` (~1 030 lignes)
- [ ] `cv-experience-card-accessibility.model.md` (~980 lignes)
- [ ] `settings-release-compatibility.model.md` (~880 lignes)
- [ ] `mission-arrival-queue.model.md` (~700 lignes)
- [ ] `scan-lifecycle.model.md` (~580 lignes)
- [ ] `linkedin-import.model.md` (~560 lignes)
- [ ] `availability-sync.model.md` (~350 lignes)
- [ ] `location-tables-derivation.model.md` (~270 lignes)
- [ ] `app-shell.model.md` (~255 lignes)
- [ ] `launch-performance.model.md` (~250 lignes)
- [ ] `cv-experience-sync.model.md` (~220 lignes)
- [ ] `location-completion.model.md` (~215 lignes)
- [ ] `connector-build-config.model.md` (~205 lignes)
- [ ] `navigation-motion.model.md` (~195 lignes)
- [ ] `keywords-unification.model.md` (~195 lignes)
- [ ] `feed-filter-sheet.model.md` (~190 lignes)
- [ ] `profile-state.model.md` (~160 lignes)
- [ ] `onboarding-flow.model.md` (~145 lignes)
- [ ] `parsing-confidence.model.md` (~145 lignes)
- [ ] `feed-bottom-dock.model.md` (~140 lignes)
- [ ] `onboarding-workmode-location.model.md` (~140 lignes)
- [ ] `notification-deep-link.model.md` (~135 lignes)
- [ ] `premium-feature-flag.model.md` (~135 lignes)
- [ ] `undo-window.model.md` (~120 lignes)
- [ ] `connector-health-workflow.model.md` (~115 lignes)
- [ ] `keyboard-shortcuts-help.model.md` (~110 lignes)
- [ ] `mission-dedup.model.md` (~65 lignes)

### Models vivants (`packages/domain/src/models/`)

- [ ] `missionpulse-copilot.spec.md` (~170 lignes)
- [ ] `copilot-dossier.model.md` (~170 lignes)
- [ ] `remote-copilot-job.model.md` (~135 lignes)
- [ ] `copilot-metrics.model.md` (~95 lignes)
- [ ] `premium-entitlement-sync.model.md` (~55 lignes)

## Conservés en anglais (décision)

- `apps/landing/agent/instructions.md` — prompt système de l'agent Copilot (artefact
  produit/exécution, comme le code).
- `docs/plans/*.md` (datés), `docs/dao/**` (artefacts de gouvernance 081), `reports/`,
  `.impeccable/` — archives et artefacts générés.
- Les prompts utilisateur Gemini Nano et les messages de validation Zod restent en français
  (copy produit) ; uniquement les commentaires du code sont en anglais.

## Fait (2026-06)

- Règle ajoutée à `AGENTS.md` (section « Langues »).
- Passe complète sur les commentaires du code (`src/`, `tests/`, `packages/`, `scripts/`) :
  ~930 lignes traduites, copy UI et prompts conservés en français.
- Traduits : `README.md` racine, `AGENTS.md`, `PRODUCT.md`, `docs/README.md`, ADR 001–006
  - index, `docs/specs/feed-interaction.md`, `docs/CI-CD.md`, `docs/PRODUCTION.md`,
    `docs/open-source-readiness.md`, index `docs/` (design/plans/history/dao/specs),
    `packages/design/DESIGN.md`, `packages/ui/README.md`, `.github/*` (CONTRIBUTING,
    CODE_OF_CONDUCT, SECURITY, PR template, copilot-instructions, workflows/README),
    `apps/landing/src/lib/server/copilot/providers/README.md`.
