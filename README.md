# MissionPulse

**Extension Chrome pour freelances tech.** Feed de missions centralisé avec scoring IA et analyse TJM.

> Votre radar freelance. 5 plateformes, un seul panneau, scoré pour vous.

## Monorepo Structure

```
pulse/
├── apps/
│   ├── extension/     # Extension Chrome (Svelte 5 + Vite + MV3)
│   └── landing/       # Landing page statique (missionpulse.app)
├── packages/
│   └── tsconfig/      # Shared TypeScript config
├── turbo.json         # Turborepo pipeline
└── pnpm-workspace.yaml
```

## Features

- **Feed centralisé** — Agrège les missions de 5 plateformes freelance
- **Scoring IA** — Gemini Nano (Chrome built-in AI) analyse la pertinence sémantique
- **Scoring multi-critères** — Stack, TJM, localisation, remote, séniorité, urgence (startDate)
- **Dashboard TJM** — Tendances du taux journalier par stack et par source
- **Déduplication** — Fusionne automatiquement les missions postées sur plusieurs plateformes
- **Scan parallèle** — 5 connecteurs lancés simultanément (pool de 3)
- **Smart notifications** — Alertes configurables par stack + TJM + score
- **Comparaison** — Comparez jusqu'à 3 missions côte à côte
- **Export** — JSON, CSV, Markdown avec label de filtres appliqués
- **Favoris & masquage** — Bookmark ou cache des missions
- **Offline** — Fonctionne sans réseau grâce au cache local (IndexedDB + chrome.storage)
- **Raccourcis clavier** — Navigation rapide sans quitter le clavier
- **Backup & Restore** — Export/import du profil et des données
- **100% local** — Aucun serveur, aucun tracking, aucune collecte

### Plateformes supportées

| Plateforme | Status | Notes |
|---|---|---|
| [Free-Work](https://www.free-work.com) | ✅ Opérationnel | API publique, header `Accept-Language: fr` requis |
| [LeHibou](https://www.lehibou.com) | ✅ Opérationnel | Session cookie requise |
| [Hiway](https://hiway-missions.fr) | ✅ Opérationnel | API Supabase publique |
| [Collective](https://app.collective.work) | ✅ Opérationnel | GraphQL API, session requise, Cloudflare |
| [Cherry Pick](https://app.cherry-pick.io) | ✅ Opérationnel | Session cookie requise |

### Compatibilité navigateurs

| Navigateur | Status |
|---|---|
| Chrome | ✅ Testé |
| Brave | ✅ Compatible |
| Edge | ✅ Compatible |
| Arc | ✅ Compatible |
| Dia | ✅ Compatible (fix Accept-Language) |

## Quick Start

```bash
# Prérequis: Node.js >= 22, pnpm >= 10
pnpm install
pnpm dev          # Dev server (UI sans Chrome)
pnpm test         # 717 tests unitaires
pnpm build        # Build extension
```

## Tech Stack

| Couche | Technologie | Version |
|---|---|---|
| UI | Svelte 5 (runes) | ^5.x |
| Styling | TailwindCSS 4 (CSS-first) | ^4.x |
| State | Svelte 5 runes ($state, $derived, $effect) | ^5.x |
| Language | TypeScript (strict) | ^5.x |
| Build | Vite + @crxjs/vite-plugin | ^6.x |
| Monorepo | Turborepo | ^2.x |
| Testing | Vitest (717 tests) + Playwright | latest |
| Runtime | Chrome Extension Manifest V3 | MV3 |
| IA | Gemini Nano (Chrome built-in AI) | — |
| Validation | Zod | ^3.23 |
| Icons | Lucide Svelte | ^0.460 |

## Architecture

**Functional Core & Imperative Shell (FC&IS)** — le code métier pur est séparé des side effects.

```
apps/extension/src/lib/
├── core/                  # FONCTIONS PURES — zéro I/O, zéro async
│   ├── scoring/           # Relevance, bonus (séniorité/startDate), dedup, sort, smart notifications
│   ├── connectors/        # Parsers purs (HTML/JSON → Mission[])
│   ├── types/             # Types + barrel exports (index.ts)
│   ├── errors/            # Result<T,E> + erreurs typées
│   ├── export/            # Formatage export (JSON/CSV/MD)
│   └── ...
│
└── shell/                 # I/O, async, orchestration
    ├── connectors/        # 5 connecteurs (fetch + cookies + declarativeNetRequest)
    ├── scan/              # Scanner parallèle (pool de 3)
    ├── ai/                # Gemini Nano scoring sémantique
    ├── storage/           # IndexedDB, chrome.storage, caches
    ├── facades/           # Feed controller, settings facade
    └── ...
```

**Règle fondamentale : Shell → Core. Core ne connaît pas Shell.**

### UI (Atomic Design)

```
apps/extension/src/ui/
├── atoms/       # Button, Badge, Chip, Toast, Skeleton, ConnectionIndicator
├── molecules/   # MissionCard, SearchInput, LastScanInfo, TJMGauge, ConnectorStatus
├── organisms/   # MissionFeed, FilterBar, ProfileSection, ScanSettings, MissionComparison, DangerZone
├── templates/   # FeedLayout, SettingsLayout, OnboardingLayout
└── pages/       # FeedPage, TJMPage, SettingsPage, OnboardingPage
```

### State (Svelte 5 runes)

| Module | Fichier | Rôle |
|---|---|---|
| App Navigation | `app-navigation.svelte.ts` | Routing, transitions, onboarding |
| Feed | `feed.svelte.ts` | Missions, recherche, filtrage |
| Feed Page | `feed-page.svelte.ts` | État complet du FeedPage (seen, favoris, filtres, comparaison) |
| Settings | `settings-page.svelte.ts` | Profil, export, backup, reset |
| Connection | `connection.svelte.ts` | Détection réseau |
| Toast | `toast.svelte.ts` | Notifications UI |

## Development

```bash
pnpm dev                    # Dev server avec mocks Chrome
pnpm test                   # 717 tests unitaires
pnpm test:watch             # Watch mode
pnpm test:coverage          # Coverage (seuil 70% sur core/)
pnpm test:e2e               # Playwright E2E
pnpm typecheck              # TypeScript strict
pnpm lint                   # ESLint
pnpm health-check           # Vérification connecteurs vs sites live
```

### Dev Panel

**Ctrl+Shift+D** ouvre le panneau de dev : injection de missions mock, toggle états, logs bridge.

## Chrome Web Store

### Assets disponibles

```
apps/extension/store-assets/
├── screenshot-1-feed.png       # 1280×800 — Feed avec missions scorées
├── screenshot-2-tjm.png        # 1280×800 — Dashboard TJM
├── screenshot-3-privacy.png    # 1280×800 — Architecture 100% locale
├── promo-tile-440x280.png      # 440×280 — Tile promotionnelle
└── *.svg                       # Sources éditables
```

### Description courte (132 car.)

> Radar freelance : 5 plateformes, scoring IA, analyse TJM. 100% local, zéro tracking. Gratuit et open source.

### Landing page

`apps/landing/` — site statique déployé sur [missionpulse.app](https://missionpulse.app). L'URL Chrome Store est configurable dans `config.js`.

## Contributing

- **Conventional commits** : `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- **FC&IS strict** : jamais d'import shell depuis core
- **Svelte 5 only** : runes, pas de stores, pas de Svelte 4
- **TypeScript strict** : pas de `any`
- **Tests** : toute feature core a ses tests purs (sans mocks)

## License

MIT
