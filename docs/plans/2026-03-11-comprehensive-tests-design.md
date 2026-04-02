> **⚠️ Historical document** — Ce plan a été rédigé pendant une phase antérieure du projet. Certains choix techniques mentionnés (XState, offscreen document, API Anthropic, Malt, Comet) ne reflètent plus l'architecture actuelle. Voir `README.md` et `AGENTS.md` pour l'état courant.


# Design — Tests complets (Machines XState + E2E Playwright)

**Date:** 2026-03-11
**Statut:** Approuvé

## Objectif

Couvrir l'ensemble des fonctionnalités avec des tests machines XState (unit) et des tests E2E Playwright contre le dev server (stubs Chrome).

## 1. Tests machines XState (Vitest)

Un fichier par machine. Créer un `createActor()`, envoyer des événements, vérifier états et contexte. Pas de mocks.

### feed.machine
- empty → loading → loaded (MISSIONS_LOADED)
- loaded → searching (SEARCH) → loaded (CLEAR_SEARCH)
- loaded → error (LOAD_ERROR)
- REFRESH depuis loaded
- Context: missions stockées, filteredMissions mis à jour, searchQuery
- Search filtre par title/stack/description

### onboarding.machine
- welcome → profile → connectors → firstScan → done
- BACK navigation (profile → welcome, connectors → profile)
- SET_PROFILE met à jour context.profile
- SET_CONNECTORS met à jour context.enabledConnectors
- SKIP_SCAN → done
- SCAN_DONE → done

### filters.machine
- inactive → active sur SET_STACK
- TOGGLE_STACK_ITEM ajoute/supprime
- SET_TJM_RANGE, SET_LOCATION, SET_REMOTE → active
- CLEAR_ALL → inactive
- Guard: retour automatique à inactive quand aucun filtre actif

### tjm.machine
- idle → aggregating (ANALYZE) → callingLLM (AGGREGATION_DONE) → ready (LLM_DONE)
- ERROR depuis aggregating et callingLLM
- RESET → idle depuis tout état
- Context: query, aggregatedData, analysis, error

## 2. Tests E2E Playwright

Contre le dev server (`pnpm dev`) avec stubs Chrome. Config Playwright avec `webServer` automatique.

### onboarding.test.ts
- Happy path: welcome → profil → connecteurs → scan → feed
- Navigation BACK entre steps

### feed.test.ts
- Scan + missions: cliquer Scanner → missions apparaissent
- Search: taper query → résultats filtrés
- Empty state visible
- Error state visible
- Filter par stack chip

### navigation.test.ts
- Feed → TJM → Settings → Feed
- Tabs actifs visuellement

### devpanel.test.ts
- Ctrl+Shift+D ouvre le panel
- Sections visibles (Feed State, Missions, Onboarding, Bridge Logs)
- Inject missions → apparaissent dans feed
- Set state empty/error → feed réagit
- Toggle onboarding → retour écran onboarding

## 3. Structure

```
tests/
├── unit/
│   ├── machines/
│   │   ├── feed.test.ts
│   │   ├── onboarding.test.ts
│   │   ├── filters.test.ts
│   │   └── tjm.test.ts
│   ├── scoring/          # existant
│   ├── tjm/              # existant
│   └── connectors/       # existant
└── e2e/
    ├── onboarding.test.ts
    ├── feed.test.ts
    ├── navigation.test.ts
    └── devpanel.test.ts
```

## 4. Config

- Vitest: inclure `tests/unit/**/*.test.ts` (déjà le cas)
- Playwright: ajouter `webServer: { command: 'pnpm dev', url: 'http://localhost:5173' }` et `baseURL`
