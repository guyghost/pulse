# Integration Gaps — Design Document

**Date** : 2026-03-13
**Context** : After implementing Chrome APIs upgrade (alarms, session storage, Gemini Nano, UX polish), several integration gaps remain.

---

## Gap 1 — SW ↔ Side Panel communication + chargement intelligent

### Probleme
Le SW scanne via alarm mais le side panel ne le sait pas. Le side panel relance un scan complet a chaque ouverture.

### Solution

**SW → Side Panel (message + storage fallback) :**
- Apres scan alarm, SW envoie `chrome.runtime.sendMessage({ type: 'SCAN_COMPLETE', missions })`
- Panel ouvert → ecoute et met a jour le feed
- Panel ferme → missions deja persistees en IndexedDB

**Side Panel au mount (chargement intelligent) :**
1. Charge missions depuis IndexedDB (`getMissions()`)
2. Si missions existent → affiche immediatement
3. Verifie `lastSync` — si < intervalle de scan → pas de re-scan
4. Sinon → lance un scan

**Side Panel ecoute scans background :**
- `chrome.runtime.onMessage` dans FeedPage → quand `SCAN_COMPLETE` recu, met a jour feedActor

### Fichiers
- `src/background/index.ts` — sendMessage apres scan alarm
- `src/ui/pages/FeedPage.svelte` — chargement intelligent + listener
- `src/lib/shell/messaging/bridge.ts` — type SCAN_COMPLETE

---

## Gap 2 — Settings UX : intervalle lie au toggle auto-scan

### Probleme
Slider intervalle actif meme quand auto-scan off.

### Solution
- `autoScan === false` → bloc frequence grise (opacity-40, pointer-events-none)
- Texte conditionnel : "Activez le scan automatique pour configurer la frequence."

### Fichiers
- `src/ui/pages/SettingsPage.svelte`

---

## Gap 3 — Progression reelle du scan par connecteur

### Probleme
ScanProgress affiche toujours 50% pendant le scan.

### Solution

**Scanner emet la progression via callback :**
```ts
type ScanProgressInfo = {
  current: number;       // connecteurs termines
  total: number;         // connecteurs total
  connectorName: string; // nom du connecteur en cours
};
onProgress?: (progress: ScanProgressInfo) => void;
```

**FeedPage** maintient les states et les passe a ScanProgress.

**ScanProgress ameliore :**
- Barre : `(current / total) * 100`
- Texte : "Scraping Malt... (3/7)"

### Fichiers
- `src/lib/shell/scan/scanner.ts` — parametre onProgress
- `src/ui/pages/FeedPage.svelte` — callback + states
- `src/ui/organisms/ScanProgress.svelte` — affichage reel

---

## Gap 4 — Indicateur Gemini Nano indisponible

### Probleme
Pas d'indication quand le scoring IA est inactif.

### Solution
- Au mount, appeler `isPromptApiAvailable()`
- Badge dans le header :
  - `available` → rien
  - `after-download` → "IA en telechargement..."
  - `no` → "Scoring IA indisponible"

### Fichiers
- `src/ui/pages/FeedPage.svelte`
