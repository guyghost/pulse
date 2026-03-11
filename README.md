# MissionPulse

Extension Chrome pour freelances tech : feed de missions centralisé avec scoring de pertinence et analyse TJM par LLM.

## Stack

Svelte 5 (runes) · TailwindCSS 4 · XState 5 · TypeScript strict · Vite · Chrome Manifest V3

## Architecture

**Functional Core & Imperative Shell** — séparation stricte entre logique pure et I/O.

```
src/lib/
├── core/          # Fonctions pures (scoring, parsing, agrégation) — zéro I/O
└── shell/         # I/O (storage, messaging, connectors, use cases)
```

Voir [AGENTS.md](./AGENTS.md) pour les conventions détaillées.

## Development

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
```

Charge le dossier `dist/` dans `chrome://extensions` (mode développeur).

## Test

```bash
pnpm test
pnpm test:e2e
```
