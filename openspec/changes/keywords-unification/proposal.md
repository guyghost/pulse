# Proposal: Unifier compétences et mots-clés en une seule liste `keywords`

## Why — Produit

Le profil expose aujourd'hui **deux listes parallèles** :

- `stack` (compétences) → alimente **uniquement le scoring local** (`rawStackScore` vs `mission.stack`).
- `searchKeywords` (mots-clés) → alimente **uniquement la requête API connecteur** (`buildSearchContext`).

Cette distinction est invisible pour un utilisateur non technique, qui ne sait
pas si « SaaS » ou « React » va dans « compétences » ou « mots-clés ». Résultat :
saisie dupliquée ou second champ vide et expérience dégradée. On collapse les
deux en **une seule liste `keywords`** qui alimente les deux canaux.

## Decision (confirmée produit)

Liste unifiée `keywords` alimente **à la fois** :

1. le **scoring local** (match contre `mission.stack` — les termes de domaine
   sont scoring-neutres, cf. modèle) ;
2. la **requête API** (joint en free-text `query`, `skills: []` inchangé).

Merge complet, pas un input cosmétique sur deux champs cachés.

## Source de vérité

`apps/extension/src/models/keywords-unification.model.md` — modèle autoritatif
(états, invariants, migration, périmètre). Cette proposal ne le duplique pas.

## What Changes

### Core (pur)

| Fichier                             | Changement                                                                                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/types/profile.ts`             | `UserProfile.stack` → `keywords` ; supprime `searchKeywords`.                                                                                                                          |
| `core/profile/normalize-profile.ts` | `ProfileDraftInput` : `stack`/`stackInput` → `keywords`/`keywordInput` ; supprime `searchKeywords`/`keywordInput` (l'ancien). `withProfileDefaults` + `normalizeProfileDraft` suivent. |
| `core/profile/defaults.ts`          | `DEFAULT_PROFILE.stack: []` → `keywords: []` ; supprime `searchKeywords` ; `isDefaultProfile` suit.                                                                                    |
| `core/profile/profile-impact.ts`    | Fusionne les items `stack` (25) + `search-keywords` (10) → `keywords` (35). `ProfileImpactFieldId` / `ProfileImpactInput` suivent.                                                     |
| `core/connectors/search-context.ts` | `query` dérivé de `profile.keywords` (was `searchKeywords`). Comportement identique.                                                                                                   |
| `core/scoring/relevance.ts`         | `rawStackScore(missionStack, profileKeywords)` — param renommé, logique inchangée. `ScoringWeights.stack` / `DeterministicBreakdown.stack` **inchangés** (nom de dimension).           |
| `core/types/schemas.ts`             | `UserProfileSchema` : `stack`+`searchKeywords` → `keywords` + preprocess shim (legacy `stack`/`searchKeywords` → `keywords`).                                                          |
| `core/types/type-guards.ts`         | Hérite le shim via `UserProfileSchema` (pas de code supplémentaire).                                                                                                                   |

### Shell (I/O)

| Fichier                                                     | Changement                                                                                                        |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `shell/storage/migration-registry.ts`                       | Ajoute data migration v1→v2 : merge `stack`+`searchKeywords` → `keywords` dans le store `profile`. Idempotente.   |
| `shell/storage/db.ts`                                       | `APP_DATA_VERSION` 1 → 2. `saveProfile`/`getProfile` écrivent/lisent la nouvelle forme (shim en lecture).         |
| `shell/messaging/bridge.ts` + `schemas.ts`                  | Messages profil : `stack` → `keywords`, supprime `searchKeywords`.                                                |
| `shell/ai/build-cv-summary.ts`                              | `profile.stack` → `profile.keywords`.                                                                             |
| `shell/notifications/notify-missions.ts`                    | Si lit `profile.stack` → `profile.keywords`. `requiredStacks` (alert prefs) **inchangé**.                         |
| `shell/notifications/daily-digest.ts`                       | Idem. `requiredStacks` **inchangé**.                                                                              |
| `shell/sync/connected-dashboard.ts`                         | Vérifier sync profil : si envoie `stack`/`searchKeywords`, adapter. `required_stacks` (alert prefs) **inchangé**. |
| `background/index.ts`                                       | `profileStacks` (TJM) → `profileKeywords`.                                                                        |
| `shell/.../tjm.facade.ts`                                   | Suit.                                                                                                             |
| LinkedIn extractor (`merge-candidate-profile.ts`/similaire) | `stack` → `keywords`.                                                                                             |

### State (runes)

| Fichier                             | Changement                                                                                                                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/state/settings-page.svelte.ts` | `profileStack`/`stackInput`/`addStack`/`removeStack`/`setStack` → `profileKeywords`/`keywordInput`/`addKeyword`/`removeKeyword`/`setKeywords`. Supprime l'ancien éditeur `searchKeywords` (folded). |
| `lib/state/feed-page.svelte.ts`     | Suit.                                                                                                                                                                                               |

### UI

| Fichier                                                           | Changement                                                                                                                  |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `ui/organisms/ProfileSection.svelte`                              | Fusionne les deux sections (stack + mots-clés) → **une** section « Mots-clés ».                                             |
| `ui/organisms/OnboardingWizard.svelte`                            | Step « compétences » → « Mots-clés ». `requiredStacks: stack` → `requiredStacks: keywords` (nom `requiredStacks` inchangé). |
| `ui/pages/ProfilePage.svelte`                                     | Passe `keywords` au lieu de `stack`+`searchKeywords`.                                                                       |
| `ui/pages/FeedPage.svelte`                                        | `preferences.requiredStacks` **inchangé** (alert prefs, pas profil).                                                        |
| `ui/molecules/AlertBuilderCard.svelte`                            | **Inchangé** — `requiredStacks` est un concept d'alerte (contract dashboard).                                               |
| `ui/pages/CvPage.svelte`, `TJMPage.svelte`, `SettingsPage.svelte` | `profile.stack` → `profile.keywords`.                                                                                       |

### Dev / mocks / tests

- `dev/mocks.ts`, `dev/qa-seed.ts`, `dev/chrome-stubs.ts` : forme profil mise à jour.
- Tous les tests référençant `profile.stack` / `searchKeywords` / `profileStack` / `stackInput` / `addStack` / `removeStack` / items d'impact `stack`+`search-keywords` : mis à jour vers `keywords`.
- Nouveau test : data migration v1→v2 (idempotence, merge, no-op sur record manquant).
- Nouveau test : shim preprocess (legacy `stack`+`searchKeywords` → `keywords` via `parseUserProfile`).
- `profile-impact.test.ts` : un seul item `keywords` (poids 35).

## Non-renommé (volontaire — cf. modèle)

`Mission.stack`, `ScoringWeights.stack`, `DEFAULT_SCORING_WEIGHTS.stack`,
`DeterministicBreakdown.stack`, `ConnectedAlertPreferences.requiredStacks`,
`AlertHistoryEntry.requiredStacks`, `SmartAlertCriteria.requiredStacks`.

## Constraints

- FC&IS : `keywords` sur le type pur `UserProfile` ; toute I/O (migration, save/load) en `shell/`. Core n'importe jamais shell.
- TS strict, pas de `any` (shim typé via `unknown` + narrowing).
- Pas de `tailwind.config.js` ; TailwindCSS 4 CSS-first ; Svelte 5 runes uniquement.
- `DB_VERSION` (structurel) **inchangé** — aucun store/index ajouté. Seul `APP_DATA_VERSION` monte.
- Conventional commit : `refactor(profile): unify stack and searchKeywords into keywords`

## Tests

- `pnpm --filter @pulse/extension typecheck`
- `pnpm --filter @pulse/extension lint`
- `pnpm --filter @pulse/extension test` (unitaires, dont migration + shim + impact + scoring + search-context)
- `pnpm --filter @pulse/extension test:regression` (parsers inchangés — doit rester vert sans regen)
- `pnpm ci:check` (pre-push gate)

## Risque

- **Perte de profil au upgrade** : mitigé par shim (Layer 1) + migration (Layer 2). Invariant 1.
- **Sync dashboard** : `requiredStacks`/`required_stacks` inchangés. Si le dashboard sync le **profil** (pas seulement les alertes), vérifier `connected-dashboard.ts` avant de casser le contrat.
- **Blast radius** : ~50 fichiers. Mécanique mais vaste — exécuter par couches (Core → Shell → State → UI → Dev → Tests) avec typecheck entre chaque.
