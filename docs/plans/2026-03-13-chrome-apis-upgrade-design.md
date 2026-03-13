# Chrome APIs Upgrade — Design Document

**Date** : 2026-03-13
**Target** : Chrome 130+
**Approche** : Couches progressives (chaque section livrée indépendamment)

---

## Section 1 — Badge + Alarms (scan autonome)

### Objectif
Scan automatique en arrière-plan à intervalle configurable. Badge sur l'icône avec le nombre de nouvelles missions non vues.

### Manifest
Ajouter la permission `alarms` :
```json
"permissions": ["sidePanel", "storage", "cookies", "alarms"]
```

### Service Worker (`background/index.ts`)
- Au démarrage : `chrome.alarms.create('auto-scan', { periodInMinutes: 30 })`
- `chrome.alarms.onAlarm` → déclenche `runScan()` depuis le SW
- Après scan : comparer missions trouvées aux `seenIds`, calculer le delta
- Badge : `chrome.action.setBadgeText({ text: '3' })` + `setBadgeBackgroundColor` accent-emerald + `setBadgeTextColor` blanc
- Side panel ouvert + missions vues → reset badge à `""`

### Settings
- Toggle "Scan automatique" (on/off)
- Select intervalle : 15min, 30min, 1h, 2h
- Stocké dans `chrome.storage.local`

### Notes
- `runScan` fonctionne déjà depuis le SW (fetch + credentials + host_permissions)
- Le bouton play du side panel reste pour le scan manuel

---

## Section 2 — storage.session (cache scan rapide)

### Objectif
`chrome.storage.session` pour les données éphémères, évitant des écritures IndexedDB inutiles.

### Données migrées vers storage.session
- Résultat du dernier scan (missions brutes avant dedup/scoring)
- État du scan (scanning, idle, error) — partagé entre SW et side panel
- Compteur de nouvelles missions (delta pour le badge)

### Données persistantes (inchangées)
- Missions scorées et dédupliquées → IndexedDB
- seenIds, favorites, hidden → chrome.storage.local
- Profil, settings → chrome.storage.local

### Nouveau module
`src/lib/shell/storage/session-storage.ts` :
- `getScanState()` / `setScanState()`
- `getNewMissionCount()` / `setNewMissionCount()` / `resetNewMissionCount()`

### Avantage
Side panel ouvert → lit l'état du dernier scan instantanément. SW et side panel partagent l'état sans messaging custom.

---

## Section 3 — Prompt API / Gemini Nano (scoring sémantique)

### Objectif
Gemini Nano embarqué pour scoring sémantique, extraction mots-clés, résumé. Fallback transparent sur le scoring actuel.

### Manifest
```json
"trial_tokens": ["<token_prompt_api>"]
```

### Détection — `src/lib/shell/ai/capabilities.ts`
- `isPromptApiAvailable()` → `self.ai?.languageModel?.capabilities()`
- Retourne `available`, `after-download`, ou `no`
- Gate avant tout appel — si `no`, fallback silencieux

### Scoring enrichi — `src/lib/core/scoring/semantic-scoring.ts`
- Pure function (FC&IS core)
- Input : mission + profil
- Prompt : "Évalue la pertinence de cette mission pour ce profil freelance. Score 0-100. Justifie en 1 phrase."
- Output : `{ score: number, reason: string }`
- `reason` affiché comme tag sur la MissionCard

### Résumé de mission (optionnel)
- Prompt : "Résume cette mission en 1 phrase concise pour un freelance"
- Stocké en IndexedDB, généré une seule fois

### Intégration scanner
- Après dedup, si Prompt API disponible → scoring sémantique en parallèle
- Si indisponible/timeout → scoring actuel (`relevance.ts`) tel quel
- Non bloquant : missions retournées immédiatement, scoring sémantique enrichit en async

### Rate limiting
- Max 10 appels Gemini Nano par scan
- Timeout 5s par appel

---

## Section 4 — UX polish (layout adaptatif + tabs frozen)

### sidePanel.getLayout() (Chrome 140)
- Détecter position left/right du panel
- State réactif `panelSide: 'left' | 'right'`
- Positionner le bouton stop côté intérieur de l'écran
- Usage futur : adapter tooltips, popovers

### tabs.Tab.frozen (Chrome 132)
- Dans `detectSession()` : vérifier si l'onglet plateforme est frozen
- Si frozen → skip détection de session (évite fetches inutiles)

### action.onUserSettingsChanged (Chrome 130)
- Écouter pin/unpin dans le SW
- Si pin → suggérer activation du scan auto via notification
