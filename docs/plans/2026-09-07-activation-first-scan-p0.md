# Design — Activation premier scan (fixes P0)

Date: 2026-09-07  
Repo: `guyghost/pulse` (`develop`)  
Scope: extension Chrome (`apps/extension`)  
Statut: design prêt à implémenter (Cloud Agents indisponibles hors Pro)

## Objectif

Augmenter le taux **install → premier scan utile → mission ouverte/sauvegardée**.

Un premier scan est « utile » s’il remonte au moins une mission **ou** explique clairement pourquoi le feed est vide avec une action correctrice immédiate (connecter une session, pas « ajuster le profil » à tort).

## Non-objectifs

- Brancher Malt / nouvelles plateformes (P1/P2).
- Refonte Premium / checkout.
- Refonte visuelle landing.
- Scraping backend (interdit produit).
- Remplacer le modèle XState onboarding-flow : on l’étend, on ne le réécrit pas.

## Constat runtime (état actuel)

| Zone             | Fichier(s)                                          | Comportement actuel                                                   | Problème activation                                              |
| ---------------- | --------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Flow             | `models/onboarding-flow.*`, `OnboardingFlow.svelte` | welcome → connecting → wizard → notifying → persist → scan            | `connecting` = cases à cocher sans preuve de session             |
| Shell onboarding | `OnboardingPage.svelte`                             | `START_SCAN` → `applyConnectedSources` + `feedController.startScan()` | Si `connectedSources=[]` (SKIP), rien n’est écrit ; scan partiel |
| Profil défaut    | `core/profile/defaults.ts`, `scanner.ts`            | `createDefaultProfile()` utilisé **en mémoire** pendant le scan       | Pas toujours **persisté** avant arrivée feed                     |
| Skip → feed      | `app-navigation.svelte.ts` `completeOnboarding`     | Seed `withProfileDefaults({})` en fire-and-forget                     | Course : feed peut monter avec `profile=null`                    |
| Story feed       | `core/feed/build-feed-story.ts`                     | empty scanned → « Ajuster le profil »                                 | Mauvais diagnostic si cause = sessions absentes                  |
| Source model     | `onboarding-source.*`                               | Machine complète (permission + session)                               | **Pas branchée** au runtime (doc explicite)                      |
| Event latent     | `SOURCE_SESSION` / `markSession` dans flow          | Existe déjà                                                           | UI connecting ne l’émet pas                                      |

## Principes (alignés PRODUCT / onboarding-flow.model)

1. **Never block first value** — un scan part dans tous les cas (SKIP inclus).
2. **Diagnostiquer avant de conseiller** — empty state selon cause réelle (sessions / filtres / profil).
3. **Une action primaire** par écran.
4. **Local-first** — cookies Chrome, pas de credentials stockés.
5. **Model decides** — transitions via machines ; shell = I/O seulement.
6. Réutiliser `createDefaultProfile` / `isDefaultProfile` / `buildFeedStory` / `onboarding-source` plutôt que dupliquer.

---

# P0-A — Profil défaut durable + empty state actionnable

## Problème

Après SKIP ou scan partiel, le feed peut s’ouvrir sans profil durable, ou avec un empty state qui pointe vers le profil alors que le vrai frein est l’absence de session plateforme.

## Décisions

### A1. Persister un profil avant/pendant tout `START_SCAN`

Quand l’effet `START_SCAN` part (`partial: true` **ou** `false`) :

1. Construire le profil à persister :
   - chemin nominal (après wizard) : `finalizeProfile(ctx)` déjà dans `onboarding-flow.logic.ts` ;
   - chemin partiel / SKIP : `createDefaultProfile()` puis overlay des champs draft non vides (`firstName`, `jobTitle`, `keywords`, TJM si > 0).
2. Shell (`OnboardingPage.runEffect`) :
   - **toujours** `saveProfile(profile)` avant `startScan()` si aucun profil durable n’existe, ou si `isDefaultProfile` et le draft apporte plus de signal ;
   - en cas d’échec save : continuer le scan (never block) mais poser `error` typé non bloquant.
3. `completeOnboarding` :
   - attendre la seed profil (plus de fire-and-forget) **ou** garantir que P0-A1 a déjà persisté → supprimer la race `profile=null`.

### A2. Marqueur « profil à compléter »

- Réutiliser `isDefaultProfile(profile)`.
- Sur le feed, si profil défaut **et** `hasCompletedScan` : bannière / story secondary « Affinez votre profil pour un meilleur score » (sévérité `attention`, pas `critical`).
- Ne pas bloquer la qualification des missions déjà visibles.

### A3. Enrichir `buildFeedStory` pour empty post-scan

Étendre `FeedStoryInput` :

```ts
enabledConnectorCount: number; // enabledConnectors.length
sessionReadyCount: number; // connecteurs enabled avec session détectée
```

Nouvel ordre de précédence empty (après filtres) :

1. `hasCompletedScan && sessionReadyCount === 0` → **cause sessions**
2. `hasCompletedScan && enabledConnectorCount === 0` → **cause connecteurs désactivés**
3. `hasCompletedScan && visibleCount === 0` → **cause profil/critères** (comportement actuel)
4. `!hasCompletedScan` → never-scanned (inchangé)

#### Copy cible — sessions manquantes

- statusLabel: `Sources déconnectées`
- title: `Aucune session plateforme détectée`
- description: `Le scan a tourné, mais Pulse n’a pas pu lire vos missions. Ouvrez Free-Work (ou LeHibou) dans Chrome, connectez-vous, puis relancez.`
- primaryActionLabel: `Ouvrir Free-Work`
- primaryActionIcon: `external-link`
- evidence: ajouter `{ label: 'Sessions', value: '0 / N' }`

#### Copy cible — aucun connecteur enabled

- title: `Aucune source activée`
- primaryActionLabel: `Choisir une source`
- Action shell : ouvrir settings sources **ou** reset onboarding connecting (préférence : panneau sources / health, pas re-wizard complet).

#### Wiring `handleFeedStoryPrimaryAction`

Aujourd’hui scanned-empty → `onNavigateToProfile`.  
Nouveau :

| Story               | Action                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| sessions manquantes | `chrome.tabs.create` URL login Free-Work (fallback 1re source enabled) + toast « Revenez puis Relancer » |
| aucun connecteur    | ouvrir SourceHealth / settings connectors                                                                |
| profil/critères     | profil (inchangé)                                                                                        |
| filtres             | clear filters (inchangé)                                                                                 |

### A4. Tests

- Unit `build-feed-story` : 3 nouveaux cas (no session / no enabled / scanned empty profil).
- Unit / integration onboarding shell : SKIP → `saveProfile` appelé avec profil `isDefaultProfile` **avant** `startScan`.
- Unit `completeOnboarding` : après await, `profile !== null`.
- Ne pas casser invariant « SCAN_FAILED → completed ».

### A5. Critères de done P0-A

- [x] SKIP ou scan partiel laisse un profil IndexedDB lisible au mount feed _(A1 : `ensureDurableProfileBeforeScan` dans le shell onboarding + seed attendue dans `completeOnboarding`)_.
- [x] Empty post-scan sans session n’invite **pas** à « Ajuster le profil » _(A3, PR #376)_.
- [x] CTA primaire ouvre une plateforme réelle _(A3, PR #376)_.
- [x] Tests unitaires verts sur `buildFeedStory` + chemin persist _(A3 + `mergeDraftOntoDefault` + `ensure-durable-profile` + `app-navigation`)_.

---

# P0-B — Connecting réel (session) puis scan

## Problème

L’écran `connecting` laisse croire qu’une case cochée = source prête. Or `CONNECT_SOURCE` ne vérifie ni permission ni cookie. Le modèle `onboarding-source` décrit déjà le bon gate mais n’est pas branché.

## Décision produit

**Connect-first pragmatique (sans réordonner tout le wizard en v1) :**

1. Garder l’ordre actuel du flow : welcome → connecting → wizard → notify → scan.
2. Transformer `connecting` en **preuve de session** (pas une simple sélection).
3. Autoriser `NEXT` seulement si `sessionReadyCount >= 1` **ou** escape hatch explicite « Continuer sans source » (équivalent SKIP contrôlé, copy honnête).
4. v1.1 (hors P0 strict si trop large) : après 1 source `ready`, proposer « Scanner maintenant » avant le wizard (refinement profil après). Documenté ici comme phase B-opt.

## Design UI `connecting`

### États par source (projection)

Réutiliser les projections `onboarding-source` :

| État              | UI                                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| idle / selecting  | ligne source + CTA `Connecter`                                                                                                                  |
| checking          | spinner « Vérification… »                                                                                                                       |
| permission_denied | « Autorisation Chrome manquante » + lien aide (pas `permissions.request` auto si le modèle l’interdit — suivre `onboarding-source.model.md` §7) |
| session_missing   | « Pas de session » + CTA `Ouvrir {Source}`                                                                                                      |
| ready             | check vert + label `Session détectée`                                                                                                           |

### Interactions

1. Tap source → shell lance check permission (contains-only) puis session (même pipeline que `checkSourceSessions` / connecteurs existants).
2. Si `session_missing` → `chrome.tabs.create(loginUrl)` ; au focus retour sidepanel → re-check ; succès → émettre `SOURCE_SESSION { sourceId, hasSession: true }` (déjà supporté par `markSession`).
3. Persister `enabledConnectors` dès qu’une source passe `ready` (pas seulement au `START_SCAN`) — aligné décision `onboarding-source` « durable après mutation Settings ».
4. Bouton primaire :
   - enabled si ≥1 `ready` → label `Continuer` ;
   - sinon disabled **sauf** lien secondaire `Continuer sans source (feed peut être vide)`.

### Wiring machine

**Option recommandée (moindre risque) :**

- Garder `onboarding-flow` comme orchestrateur UI.
- Brancher un **acteur enfant** ou façade shell qui exécute la logique déjà spécifiée dans `onboarding-source` (même si la machine source n’est pas encore montée telle quelle).
- Minimum viable P0-B : ne pas monter toute la machine source si coûteux ; réutiliser le code shell existant `controller.checkSourceSessions` / cookie checks des connecteurs, et n’émettre vers le flow que `SOURCE_SESSION` / erreurs affichées localement.

**Option complète (si temps) :** monter `onboarding-source.machine` et mapper ses projections → UI connecting.

Hypothèse non-binding : option recommandée d’abord pour livrer en une PR ; option complète en follow-up.

## Phase B-opt (hors P0 bloquant) — Scan avant wizard

Si une source devient `ready` sur `connecting` :

- ✅ **Implémenté (2026-09-09)** : CTA « Scanner maintenant » affiché quand ≥ 1 source
  prête — émet `SKIP` (→ `START_SCAN { partial: true }`, `notifyEnabled: false`), le
  wizard reste accessible au return via la bannière A2 (« profil à compléter »).
  Copy : « Scan partiel avec vos sources connectées — affinez le profil ensuite. »

- CTA alternatif `Scanner maintenant` → transition directe `scanning` avec `START_SCAN { partial: true }` + profil défaut, puis feed, puis soft-prompt « Complétez votre profil » (A2).
- Le wizard reste accessible depuis feed/profil.

À n’implémenter que si P0-A + connecting session sont stables.

## Tests P0-B

- UI/logic : source sans session → `NEXT` primary disabled ; escape hatch disponible.
- Session détectée → source dans `connectedSources` via `SOURCE_SESSION`.
- `applyConnectedSources` écrit Settings avant scan quand ≥1 ready.
- SKIP / « sans source » → `autoScan` : suivre règle produit `onboarding-source` (`autoScan=false` sur skip sans consentement) **si** on branche ce modèle ; sinon documenter l’écart temporaire dans la PR.

## Critères de done P0-B

- [x] Impossible de croire qu’une case cochée sans session = connecté _(la case à cocher a disparu : chaque source affiche un état de session vérifié via `detectSession` — ready / pas de session / vérification impossible)_.
- [x] Au moins un chemin mesurable : 1 session réelle → scan → missions **ou** empty story sessions (A3) si DOM/parser fail _(ready → `SOURCE_SESSION` → NEXT → scan ; A3 couvre l’empty)_.
- [x] Aucun credential stocké _(cookies via `detectSession`, zéro stockage)_.
- [x] Tests couvrant session_missing → open tab → recheck → ready _(niveaux module `verify-source-session` + UI `onboarding-connecting` ; le wiring focus de la page reste à couvrir e2e)_.

### Implémentation P0-B (PR 2026-09-09) — option recommandée

- `shell/onboarding/verify-source-session.ts` : vérification par source via le registry
  existant (`getConnectors` + `detectSession`), I/O injectées ; `openSourceInNewTab`
  (chrome.tabs, fallback `window.open` en dev).
- `OnboardingFlow.svelte` (connecting) : états par source (idle / checking / ready /
  session-missing / unavailable), CTA « Ouvrir {source} », « Réessayer », escape hatch
  « Continuer sans source » (SKIP) affiché quand 0 source prête, copy honnête.
- `OnboardingPage` : orchestration locale (états hors machine), `SOURCE_SESSION` émis
  vers le flow quand ready, persistance immédiate de `settings.enabledConnectors`,
  re-check au retour de focus pour les sources sans session.
- **Écart documenté** : `autoScan=false` sur skip (règle `onboarding-source`) non appliqué —
  la machine source n’est pas montée (option recommandée du plan). SKIP scanne toujours ;
  l’empty state A3 rend le résultat honnête.

---

# Ordre d’implémentation suggéré

1. **A3** — `buildFeedStory` + wiring CTA (faible risque, valeur immédiate).
2. **A1/A2** — persist profil défaut + banner.
3. **B** — connecting session réelle + `SOURCE_SESSION`.
4. **B-opt** — scan immédiat post-ready (si besoin).

Une PR par étape sur `develop`, titres :

- `fix(feed): diagnose empty post-scan by session readiness`
- `fix(onboarding): persist default profile before first scan`
- `fix(onboarding): verify platform sessions in connecting step`

## Fichiers touchés (prévision)

**P0-A**

- `src/lib/core/feed/build-feed-story.ts` (+ tests)
- `src/models/feed-story.model.md` (si présent)
- `src/ui/pages/FeedPage.svelte` (`handleFeedStoryPrimaryAction`)
- `src/ui/pages/OnboardingPage.svelte` (`runEffect`)
- `src/lib/state/app-navigation.svelte.ts` (`completeOnboarding`)
- éventuellement `src/lib/core/profile/defaults.ts` (doc / helper `mergeDraftOntoDefault`)

**P0-B**

- `src/ui/organisms/OnboardingFlow.svelte` (UI connecting)
- `src/ui/pages/OnboardingPage.svelte` (checks session, open tab)
- `src/models/onboarding-flow.model.md` (doc connecting = preuve)
- optionnel : brancher `onboarding-source.machine.ts`

## Analytics / preuve GTM (local-only)

Pas de télémétrie serveur. Pour valider en interne :

- compteur local (chrome.storage) `activation.funnel` : `welcome_start`, `source_ready`, `first_scan_started`, `first_scan_missions_gt_0`, `empty_no_session_shown`, `empty_profile_shown`.
- Export diagnostic existant (`improvement-loop.md`) doit pouvoir inclure ces compteurs.

Hors scope si trop lourd pour la première PR : reporter après A3.

## Risques

| Risque                                              | Mitigation                                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| Double vérité OnboardingWizard vs OnboardingFlow    | Ne toucher que `OnboardingFlow` / Page ; marquer ancien wizard deprecated dans PR |
| `onboarding-source` trop strict (epochs) retarde P0 | Option recommandée : checks shell existants + events flow                         |
| Open tab Free-Work sans host permission             | Suivre modèle permission contains-only ; empty state « autorisation »             |
| Profil défaut trop permissif noie le feed           | OK pour activation ; A2 + skills P1 affinent ensuite                              |

## Acceptance globale P0

Un reviewer peut vérifier manuellement :

1. Install fresh → Skip → feed a un profil stocké ; si aucune session, story « Sessions » + CTA Open Free-Work (pas Profil).
2. Install fresh → Commencer → connecter Free-Work avec vrai login → session ready → finir notify → scan → missions visibles **ou** erreur parser claire.
3. Cocher une source **sans** être loggé → pas de ready ; NEXT bloqué sauf escape hatch.
4. Reload extension après (1) : pas de re-onboarding forcé ; profil toujours là.

---

## Annexe — Copy FR proposée

**Escape hatch connecting**  
`Continuer sans source`  
Aide : `Vous pourrez connecter Free-Work ou LeHibou plus tard. Le premier scan risque de ne rien remonter.`

**Banner profil défaut**  
`Profil provisoire — affinez stack et TJM pour un scoring utile.`  
CTA : `Compléter`

**Toast après open plateforme**  
`Connectez-vous dans l’onglet, puis revenez ici — on revérifie la session.`
