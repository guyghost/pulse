# Design — Dev Experience (DX) Toolkit

**Date:** 2026-03-11
**Statut:** Approuvé

## Objectif

Permettre le développement UI sans charger l'extension dans Chrome, avec des données mock réalistes, un panel de contrôle dev, et des outils de debug (XState inspector, bridge logging).

## 1. Detection de l'environnement

Flag `isDev` basé sur `import.meta.env.DEV` (Vite). Quand `isDev === true` et `chrome.runtime` n'existe pas → mode mock automatique.

## 2. Mock data & Chrome API stubs

Module `src/dev/mocks.ts` :
- `UserProfile` mock réaliste
- 8-10 `Mission[]` mock avec scores variés, stacks différentes, TJM variés
- `TJMAnalysis` mock
- Stubs `chrome.runtime.sendMessage`, `chrome.storage.local`, `chrome.cookies`

Stubs injectés au boot (`main.ts`) uniquement en mode dev quand `chrome.runtime` n'est pas disponible.

## 3. Dev Panel (drawer overlay)

Composant `src/dev/DevPanel.svelte` — drawer en bas, toggle `Ctrl+Shift+D`, visible uniquement en dev.

Fonctionnalités :
- Switcher d'état : boutons empty / loading / loaded / error
- Injecter des missions : slider nombre (0-50), bouton refresh
- Simuler un scan : cycle scanning → progress → complete avec mock
- Profil : toggle onboarding complété / pas complété
- Bridge logger : log temps réel des messages bridge (type, payload résumé, timestamp)

## 4. XState Inspector

`@statelyai/inspect` en mode dev — panel dans Chrome DevTools ou onglet séparé. Affiche états, transitions, contexte de chaque machine.

## 5. Bridge logging

Wrapper `sendMessage` et `onMessage` pour logger en dev :
```
[Bridge] → SCAN_START                    12:34:56.789
[Bridge] ← SCAN_STATUS {progress: 0.5}  12:34:57.123
[Bridge] ← MISSIONS_UPDATED [8 items]   12:34:58.456
```
Logs dans la console ET dans le Dev Panel.

## 6. Structure

```
src/dev/                    # Tree-shaken en production
├── index.ts                # isDev flag, bootstrap dev mode
├── mocks.ts                # Données mock (profil, missions, TJM)
├── chrome-stubs.ts         # Stubs chrome.* APIs
├── DevPanel.svelte         # Drawer overlay de contrôle
└── bridge-logger.ts        # Intercepteur de messages bridge
```

Rien dans le build production — Vite tree-shake tout derrière `if (import.meta.env.DEV)`.
