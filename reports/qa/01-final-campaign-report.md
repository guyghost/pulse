# MissionPulse — Rapport final de campagne QA

**Branche :** `qa-fixes` (21 commits au-dessus de `main`, 85 fichiers, +7022/−415)
**Cible :** PR `qa-fixes` → `main` (en attente de review)
**Date :** 2026-06-28

## Synthèse

Campagne QA locale à l'échelle de la production sur l'extension Chrome MissionPulse, suivie de l'implémentation des décisions produit différées. Part d'un état initial non testé vers un état **1571/1571 tests verts, `tsc --noEmit` 0 erreur**.

Pipeline orchestré en 6 phases + intégration de 4 fonctionnalités.

| Phase | Travail | Livrable |
|-------|---------|----------|
| **0 — Seed data** | Seeder QA déterministe (500 missions) + fixture Playwright + bouton DevPanel | `reports/qa/seed-data.md`, 18 tests |
| **A — Inventaire** | 5 analystes domaine : features/routes/champs/modaux/états/workflows + critères d'acceptation + cas limites | `reports/qa/domain-*.md`, ~515 tests |
| **B — QA interactive** | Runner type utilisateur réel (port 5176) | **13 bugs confirmés** (2 HIGH, 6 MED, 7 LOW), screenshots |
| **RCA** | Causes communes + dépendances | `reports/qa/00-summary-and-root-causes.md` |
| **C — Fixes** | 5 agents (1 branche/domaine) + tests de régression | 13 bugs corrigés |
| **D — Ré-run** | Intégration `qa-fixes` + suite complète | vert |
| **Features** | 4 décisions produit différées | voir ci-dessous |

## État de validation final

- **Vitest : `1571/1571` tests passent** (116 fichiers). Base initiale non mesurée → +tests nets (Phase A seed/harness + Phase C régression + features).
- **`tsc --noEmit` : 0 erreur** (TypeScript strict, FC&IS respecté).
- Worktrees temporaires (`pulse-fix*`, `pulse-fix2-*`) nettoyés.

## Bugs corrigés (Phase C — 13)

| Domaine | Bugs | Branche |
|---------|------|---------|
| Onboarding | ONB-01 (avance malgré échec save alerte), B-1 (perte profil entre étapes) | `qa-fix/onboarding` |
| Feed | FEED-01→04 (scope counts, comparaison score, adoucissement erreur story, token tour) | `qa-fix/feed` |
| Applications/TJM | APP-01 (dossier recommandé pointait sur mission terminale), TJM-01/02/03, toast next-action | `qa-fix/applications-tjm` |
| Profile/CV | CV-01 (null-guard facades LinkedIn), presse-papier, dédup, dev-stubs | `qa-fix/profile-cv` |
| Settings | SET-01→05 (restore spinner, erreurs reset, a11y, idiomes) | `qa-fix/settings` |

Rapport détaillé des bugs : `reports/qa/qa-runner-bugs.md`. Analyse causes : `reports/qa/00-summary-and-root-causes.md`.

## Fonctionnalités implémentées (décisions produit différées)

| # | Décision | Implémentation | Branche |
|---|----------|----------------|---------|
| 1 | **Persister le profil** (ONB-02) | `saveProfile` ajouté à `AppLifecycleDeps` ; le profil par défaut seedé persiste après reload via fire-and-forget sur `completeOnboarding`. Un vrai profil existant n'est jamais écrasé. | `qa-fix2/persist-profile` |
| 2 | **Sync LinkedIn complète** (CV-01) | Nouvelle fn core pure `mergeCandidateProfileIntoUserProfile` (jobTitle écrasé, stack union dédupliquée case-insensitive, location fill-if-empty). Handler `SYNC` : merge → persist → broadcast `PROFILE_UPDATED`. Bug double-appel `IMPORT` corrigé. Dev stub + CvPage alignés. | `qa-fix2/linkedin-sync` |
| 3 | **Génération kits = feature premium** | Handler `GENERATE_ASSET` gate sur `premium_enabled` → `PREMIUM_REQUIRED` sinon ; exécute le générateur Gemini Nano existant + persiste. Nouveau code d'erreur `PREMIUM_REQUIRED` + toast premium + dev stub mock. | `qa-fix2/kit-generation` |
| 4 | **Nettoyage doc** | Réfs `TJMGauge` supprimées du README + scaffold plan (composant déjà supprimé en Phase C). | `qa-fix2/docs` |

**Politique de merge LinkedIn appliquée :** `jobTitle` ← draft (overwrite) ; `stack` ← union dédupliquée ; `location` ← rempli seulement si vide ; `tjm/remote/seniority/searchKeywords/scoringWeights` préservés.

**Génération non-premium :** toast « réservé à MissionPulse Premium » (la page Applications n'exposant pas de prop nav Settings).

## Journal des commits (sur `qa-fixes`)

```
1601efd0 fix(dev): update SYNC stub test to send a valid LinkedIn draft
d17f65b1 Merge qa-fix2/kit-generation
f9eb5038 Merge qa-fix2/linkedin-sync
33edebd2 Merge qa-fix2/persist-profile
5e491f5c Merge qa-fix2/docs
b7567e5e feat(cv): sync LinkedIn profile into the user profile (CV-01)
dc248826 feat(generation): gate kit generation behind MissionPulse Premium
1490a035 feat(onboarding): persist seeded default profile across reload
10d1aa5e docs(qa): remove stale TJMGauge references
20e158c9 test(qa): reconcile stale UI-constraint assertions after Phase C
93c238ef Merge qa-fix/profile-cv
3d328d55 Merge qa-fix/settings
0fed0523 Merge qa-fix/onboarding
4495784b Merge qa-fix/feed
cb5ff150 Merge qa-fix/applications-tjm
da860a67 chore(qa): add production-scale QA seed, e2e harness, and campaign reports
... + 5 commits de fix domaine (Phase C)
```

## Notes / limitations

- **Tests snapshot fragiles :** `tests/unit/ui/operational-ui-constraints.test.ts` assert des chaînes de code source — mis à jour pour matcher les refactorings Phase C. À surveiller lors de futures évolutions UI.
- **Génération en dev :** le stub retourne un asset mock (pas de vrai Gemini Nano en dev). En prod, nécessite Chrome avec built-in AI + `premium_enabled`.
- **Sync LinkedIn :** extraction basée sur la session navigateur existante (cookies LinkedIn + scripting). Aucun backend introduit (local-first respecté).
- **Aucune action destructive exécutée** : le danger-zone reset a été seulement confirmé « armé », jamais lancé. Aucun appel réseau réel LinkedIn/connecteurs.

## Rapports détaillés

- `reports/qa/00-summary-and-root-causes.md` — agrégation bugs + causes
- `reports/qa/qa-runner-bugs.md` — 13 bugs avec reproduction
- `reports/qa/domain-*.md` — inventaires par domaine (5)
- `reports/qa/seed-data.md` — seeder QA
- `reports/qa/screenshots/` — preuves visuelles
