> **⚠️ Historical document** — Ce plan a été rédigé pendant une phase antérieure du projet. Certains choix techniques mentionnés (XState, offscreen document, API Anthropic, Malt, Comet) ne reflètent plus l'architecture actuelle. Voir `README.md` et `AGENTS.md` pour l'état courant.


# Refactoring Connecteurs + XState — Plan d'implementation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Nettoyer le code mort (TJM, offscreen, bridge types, filtres machine), ameliorer les connecteurs (IDs stables, retry, API JSON Comet, LeHibou enrichi), et uniformiser l'architecture.

**Architecture:** FC&IS — parsers purs dans `src/lib/core/connectors/`, connectors shell dans `src/lib/shell/connectors/`. Machines XState v5 dans `src/machines/`. Tests unitaires dans `tests/unit/`.

**Tech Stack:** TypeScript strict, Svelte 5 (runes), XState v5, Vitest, pnpm

---

## Phase 1 : Nettoyage du code mort

### Task 1: Supprimer le feature TJM complet

**Files:**
- Delete: `src/ui/pages/TJMPage.svelte`
- Delete: `src/machines/tjm.machine.ts`
- Delete: `src/lib/shell/storage/tjm-cache.ts`
- Delete: `src/lib/shell/usecases/analyze-tjm.ts`
- Delete: `src/lib/core/tjm/aggregator.ts`
- Delete: `src/lib/core/tjm/build-analysis.ts`
- Delete: `tests/unit/machines/tjm.test.ts`
- Delete: `tests/unit/tjm/aggregator.test.ts`
- Delete: `tests/unit/tjm/build-analysis.test.ts`

**Step 1: Delete all TJM feature files**

```bash
rm src/ui/pages/TJMPage.svelte
rm src/machines/tjm.machine.ts
rm src/lib/shell/storage/tjm-cache.ts
rm src/lib/shell/usecases/analyze-tjm.ts
rm src/lib/core/tjm/aggregator.ts
rm src/lib/core/tjm/build-analysis.ts
rm tests/unit/machines/tjm.test.ts
rm tests/unit/tjm/aggregator.test.ts
rm tests/unit/tjm/build-analysis.test.ts
rmdir src/lib/core/tjm
rmdir tests/unit/tjm
```

**Step 2: Move `SeniorityLevel` from `tjm.ts` to `profile.ts`**

`src/lib/core/types/profile.ts` imports `SeniorityLevel` from `./tjm`. Move the type inline:

```typescript
// profile.ts — line 1: remove the import, add the type directly
export type SeniorityLevel = 'junior' | 'confirmed' | 'senior';

import type { RemoteType } from './mission';
// ... rest unchanged
```

**Step 3: Delete `src/lib/core/types/tjm.ts`**

```bash
rm src/lib/core/types/tjm.ts
```

**Step 4: Clean `src/lib/shell/storage/db.ts`**

Remove TJM-related code:
- Line 2: remove `import type { TJMDataPoint } from '../../core/types/tjm';`
- Lines 19-22: remove `tjmHistory` object store creation block
- Lines 26-28: remove `tjmCache` object store creation block
- Lines 75-86: remove `saveTJMDataPoint()` and `getTJMDataPoints()` functions

The resulting file keeps only `missions` and `profile` stores.

**Step 5: Clean `src/dev/mocks.ts`**

- Line 3: remove `import type { TJMAnalysis } from '$lib/core/types/tjm';`
- Lines 68-78: remove `mockTJMAnalysis` export

**Step 6: Clean `src/lib/shell/messaging/bridge.ts`**

- Lines 2, 4: remove TJM imports (`TJMAnalysis`, `SeniorityLevel`)
- Lines 13-17: remove `TJMQuery` interface
- Lines 26-27: remove `TJM_REQUEST` and `TJM_RESULT` from `BridgeMessage` union

(Other dead bridge types handled in Task 3.)

**Step 7: Run tests**

```bash
pnpm test
```

Expected: all tests pass (deleted tests no longer run, no remaining imports of deleted files).

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: remove TJM feature (page, machine, storage, analysis)"
```

---

### Task 2: Supprimer le document offscreen

**Files:**
- Delete: `src/offscreen/index.ts`
- Delete: `src/offscreen/index.html`

**Step 1: Delete offscreen files**

```bash
rm src/offscreen/index.ts
rm src/offscreen/index.html
rmdir src/offscreen
```

**Step 2: Run tests**

```bash
pnpm test
```

Expected: all pass (offscreen was never imported).

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove dead offscreen document"
```

---

### Task 3: Nettoyer les types bridge morts

**Files:**
- Modify: `src/lib/shell/messaging/bridge.ts`

**Step 1: Remove dead types from `BridgeMessage` union**

After Task 1 already removed `TJM_REQUEST`, `TJM_RESULT`, `TJMQuery`, and TJM imports, now remove:
- `ScanSnapshot` interface (lines 6-11)
- `SCAN_START` (line 20)
- `SCAN_STATUS` (line 21)
- `SCRAPE_URL` (line 23)
- `SCRAPE_RESULT` (line 24)
- `SCRAPE_ERROR` (line 25)
- `MISSIONS_SEEN` (line 31)

The resulting `bridge.ts` should be:

```typescript
import type { Mission } from '../../core/types/mission';
import type { UserProfile } from '../../core/types/profile';

export type BridgeMessage =
  | { type: 'MISSIONS_UPDATED'; payload: Mission[] }
  | { type: 'GET_PROFILE' }
  | { type: 'PROFILE_RESULT'; payload: UserProfile | null }
  | { type: 'SAVE_PROFILE'; payload: UserProfile }
  | { type: 'SCAN_COMPLETE'; payload: Mission[] };

function devLog(direction: '→' | '←', type: string, payload?: unknown): void {
  if (import.meta.env.DEV) {
    import('../../../dev/bridge-logger').then(({ logBridgeMessage }) => {
      logBridgeMessage(direction, type, payload);
    }).catch((err) => console.warn('[Dev] bridge-logger load failed', err));
  }
}

export function sendMessage<T extends BridgeMessage>(
  message: T,
): Promise<BridgeMessage> {
  devLog('→', message.type, 'payload' in message ? message.payload : undefined);
  return chrome.runtime.sendMessage(message);
}

export function onMessage(
  handler: (
    message: BridgeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: BridgeMessage) => void,
  ) => boolean | void,
): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    devLog('←', message.type, 'payload' in message ? message.payload : undefined);
    return handler(message, sender, sendResponse);
  });
}
```

**Step 2: Run tests**

```bash
pnpm test
```

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove dead bridge message types"
```

---

### Task 4: Supprimer les parsers morts et la dep @xstate/svelte

**Files:**
- Delete: `src/lib/core/connectors/cherrypick-parser.ts`
- Delete: `src/lib/core/connectors/hiway-parser.ts`
- Modify: `package.json:15`

**Step 1: Delete dead parser files**

```bash
rm src/lib/core/connectors/cherrypick-parser.ts
rm src/lib/core/connectors/hiway-parser.ts
```

**Step 2: Remove `@xstate/svelte` from `package.json`**

Remove line 15 (`"@xstate/svelte": "^3.0.0",`) from the `dependencies` block.

**Step 3: Reinstall deps**

```bash
pnpm install
```

**Step 4: Run tests**

```bash
pnpm test
```

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove dead parsers and unused @xstate/svelte dep"
```

---

### Task 5: Simplifier feedMachine (retirer les filtres)

**Files:**
- Modify: `src/machines/feed.machine.ts`
- Modify: `tests/unit/machines/feed.test.ts`

**Step 1: Update the test file first — remove filter tests**

In `tests/unit/machines/feed.test.ts`, delete:
- The `'applies and clears filters'` test (lines 105-123)
- The `'combines search and filter simultaneously'` test (lines 125-154)

**Step 2: Run tests to confirm they still work minus the filter tests**

```bash
pnpm test tests/unit/machines/feed.test.ts
```

**Step 3: Simplify `feedMachine`**

Remove from `src/machines/feed.machine.ts`:
- `ActiveFilters` type (lines 8-12)
- `activeFilters` from `FeedContext` (line 18)
- `SET_FILTERS` and `CLEAR_FILTERS` from `FeedEvent` (lines 28-29)
- `DEFAULT_FILTERS` constant (lines 75-79)
- `activeFilters` parameter from `recomputeFilteredMissions` signature (line 38) and all filter logic inside (lines 53-67)
- `context.activeFilters` references in `setMissions` (line 94), `setSearch` (line 113), `clearSearch` (line 119)
- `setFilters` action (lines 121-131)
- `clearFilters` action (lines 132-136)
- `activeFilters: DEFAULT_FILTERS` from initial context (line 145)
- `SET_FILTERS` transition (lines 173-175)
- `CLEAR_FILTERS` transition (lines 176-178)

The simplified `recomputeFilteredMissions` only takes `missions` and `searchQuery`:

```typescript
const recomputeFilteredMissions = (
  missions: Mission[],
  searchQuery: string,
): Mission[] => {
  if (!searchQuery.trim()) return missions;

  const query = searchQuery.toLowerCase().trim();
  return missions.filter(
    (m) =>
      (m.title ?? '').toLowerCase().includes(query) ||
      m.stack.some((s) => s && s.toLowerCase().includes(query)) ||
      ((m.description ?? '').toLowerCase().includes(query)),
  );
};
```

The simplified machine context:

```typescript
type FeedContext = {
  missions: Mission[];
  filteredMissions: Mission[];
  searchQuery: string;
  error: string | null;
};
```

Update all `recomputeFilteredMissions` call sites to remove the third `activeFilters` argument.

**Step 4: Run tests**

```bash
pnpm test tests/unit/machines/feed.test.ts
```

Expected: all remaining tests pass.

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove unused filter infrastructure from feedMachine"
```

---

## Phase 2 : Amelioration des connecteurs

### Task 6: Ajouter le retry a BaseConnector.fetchHTML()

**Files:**
- Modify: `src/lib/shell/connectors/base.connector.ts:43-53`

**Step 1: Add retry logic to `fetchHTML`**

Replace the `fetchHTML` method with a version that retries once on transient errors:

```typescript
protected async fetchHTML(url: string): Promise<string> {
  const doFetch = async (): Promise<string> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, {
        credentials: 'include',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return response.text();
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  };

  try {
    return await doFetch();
  } catch (firstError) {
    await new Promise((r) => setTimeout(r, 1000));
    return doFetch();
  }
}
```

This retries once after 1 second delay on any failure (network, timeout, HTTP error).

**Step 2: Run tests**

```bash
pnpm test
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add single retry with 1s delay to BaseConnector.fetchHTML()"
```

---

### Task 7: IDs stables pour le parser Malt

**Files:**
- Modify: `src/lib/core/connectors/malt-parser.ts:46`
- Modify: `tests/unit/connectors/malt.test.ts`

**Step 1: Update the test to expect stable IDs**

In `tests/unit/connectors/malt.test.ts`, the fixture HTML already has `href="/project/dev-react-senior-abc123"` and `href="/project/dev-java-xyz789"`. Add a test:

```typescript
it('extrait un ID stable depuis le href', () => {
  const missions = parseMaltHTML(FIXTURE_HTML, NOW, ID_PREFIX);
  expect(missions[0].id).toBe('malt-dev-react-senior-abc123');
  expect(missions[1].id).toBe('malt-dev-java-xyz789');
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/connectors/malt.test.ts
```

Expected: FAIL — current IDs are `malt-test-0`, `malt-test-1`.

**Step 3: Update the parser to extract stable IDs**

In `src/lib/core/connectors/malt-parser.ts`, change the ID extraction (around line 19-20, after `href` is extracted):

```typescript
// Extract stable ID from href slug, fallback to index
const slugMatch = href.match(/\/project\/([^/?]+)/);
const id = slugMatch ? `malt-${slugMatch[1]}` : `${idPrefix}-${index}`;
```

And update line 46: change `id: \`${idPrefix}-${index}\`` to just `id,`.

**Step 4: Update existing test expectations**

In `malt.test.ts`, update the test `'parse les cartes de mission'` to expect `id: 'malt-dev-react-senior-abc123'` instead of `id: 'malt-test-0'`.

**Step 5: Run tests**

```bash
pnpm test tests/unit/connectors/malt.test.ts
```

Expected: all pass.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat(malt): extract stable IDs from mission href slug"
```

---

### Task 8: IDs stables pour le parser generique (Hiway, CherryPick)

**Files:**
- Modify: `src/lib/core/connectors/generic-parser.ts:43`

**Step 1: Update generic parser to extract ID from href**

In `src/lib/core/connectors/generic-parser.ts`, after the `href` is extracted (line 16), add slug extraction:

```typescript
const titleEl = card.querySelector('h2 a, h3 a, .mission-title a, a.title');
const title = titleEl?.textContent?.trim() ?? '';
const href = titleEl?.getAttribute('href') ?? '';
const url = href.startsWith('http') ? href : `${baseUrl}${href}`;

// Extract stable ID from href path, fallback to index
const pathSlug = href.replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '').replace(/[/?#].*$/, '').replace(/\//g, '-');
const id = pathSlug ? `${idPrefix.split('-')[0]}-${pathSlug}` : `${idPrefix}-${index}`;
```

And update line 43: change `id: \`${idPrefix}-${index}\`` to just `id,`.

**Step 2: Run tests**

```bash
pnpm test
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(generic): extract stable IDs from mission href path"
```

---

### Task 9: Nettoyer le parser LeHibou (supprimer _idPrefix, ajouter remote)

**Files:**
- Modify: `src/lib/core/connectors/lehibou-parser.ts`
- Modify: `src/lib/shell/connectors/lehibou.connector.ts:24`
- Modify: `tests/unit/connectors/lehibou.test.ts`

**Step 1: Update tests first**

In `tests/unit/connectors/lehibou.test.ts`:

1. Update function signature in all calls: change `parseLeHibouHTML(html, NOW, ID_PREFIX)` to `parseLeHibouHTML(html, NOW)` (remove third arg).

2. Update the remote test expectation — add remote detection test. The fixture has location "Paris" but no explicit remote text, so remote should remain `null` for existing fixtures. Add a new fixture + test for remote detection:

```typescript
it('detecte le remote depuis le texte de la carte', () => {
  const htmlRemote = `
  <html><body>
  <a class="mission-card" href="/annonce/rem-ote-123?source=search-engine">
    <header class="mission-card__header">
      <h1 class="mission-card__header__title">Dev React Full Remote</h1>
    </header>
    <section class="mission-card__informations">
      <div class="mission-card__informations__item"><span></span><span>Full remote</span></div>
      <div class="mission-card__informations__item"><span></span><span>6 mois</span></div>
      <div class="mission-card__informations__item"><span></span><span>ASAP</span></div>
    </section>
    <footer class="mission-card__footer">
      <div class="mission-card__footer__dailyPrice">700 \u20ac/jour</div>
    </footer>
  </a>
  </body></html>`;
  const missions = parseLeHibouHTML(htmlRemote, NOW);
  expect(missions[0].remote).toBe('full');
});
```

3. Update the existing `'client, remote et description sont null/vide'` test: keep `remote: null` expectation for the current fixture (no remote text in it).

**Step 2: Run tests to see failures**

```bash
pnpm test tests/unit/connectors/lehibou.test.ts
```

Expected: fails on signature change and new remote test.

**Step 3: Update the parser**

In `src/lib/core/connectors/lehibou-parser.ts`:

1. Add `detectRemote` to imports from `parser-utils` (line 2):
```typescript
import { parseTJM, detectRemote, createMission } from './parser-utils';
```

2. Remove `_idPrefix` parameter from function signature (line 7):
```typescript
export function parseLeHibouHTML(html: string, now: Date): Mission[] {
```

3. Add remote detection after stack extraction (around line 40):
```typescript
// Detect remote from card text
const fullText = card.textContent?.toLowerCase() ?? '';
const remote = detectRemote(fullText);
```

4. Update the `createMission` call: change `remote: null` to `remote,`.

**Step 4: Update the connector**

In `src/lib/shell/connectors/lehibou.connector.ts`, line 24: remove the third argument:
```typescript
const missions = parseLeHibouHTML(html, now);
```

**Step 5: Run tests**

```bash
pnpm test tests/unit/connectors/lehibou.test.ts
```

Expected: all pass.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat(lehibou): remove vestigial idPrefix, add remote detection"
```

---

### Task 10: Uniformiser le registry des connecteurs

**Files:**
- Modify: `src/lib/shell/connectors/hiway.connector.ts`
- Modify: `src/lib/shell/connectors/cherrypick.connector.ts`
- Modify: `src/lib/shell/connectors/generic.connector.ts`
- Modify: `src/lib/shell/connectors/index.ts`

**Step 1: Export classes instead of instances for Hiway and CherryPick**

Change `generic.connector.ts` to export the `GenericConnector` class (currently private):

```typescript
// Make class exportable — change from private to exported
export class GenericConnector extends BaseConnector {
  // ... unchanged
}

export function createGenericConnector(config: GenericConnectorConfig): GenericConnector {
  return new GenericConnector(config);
}

export type { GenericConnectorConfig };
```

Change `hiway.connector.ts` to export a config instead of an instance:

```typescript
import type { GenericConnectorConfig } from './generic.connector';

export const HiwayConfig: GenericConnectorConfig = {
  id: 'hiway',
  name: 'Hiway',
  baseUrl: 'https://hiway-missions.fr',
  missionsPath: '/missions',
  idPrefix: 'hw',
  source: 'hiway',
};
```

Change `cherrypick.connector.ts` similarly:

```typescript
import type { GenericConnectorConfig } from './generic.connector';

export const CherryPickConfig: GenericConnectorConfig = {
  id: 'cherry-pick',
  name: 'Cherry Pick',
  baseUrl: 'https://cherry-pick.io',
  missionsPath: '/missions',
  idPrefix: 'cp',
  source: 'cherry-pick',
};
```

**Step 2: Update the registry to instantiate everything uniformly**

```typescript
import { FreeWorkConnector } from './freework.connector';
import { MaltConnector } from './malt.connector';
import { CometConnector } from './comet.connector';
import { LeHibouConnector } from './lehibou.connector';
import { GenericConnector } from './generic.connector';
import { HiwayConfig } from './hiway.connector';
import { CollectiveConnector } from './collective.connector';
import { CherryPickConfig } from './cherrypick.connector';
import type { PlatformConnector } from './platform-connector';

export const connectorRegistry: PlatformConnector[] = [
  new FreeWorkConnector(),
  new MaltConnector(),
  new CometConnector(),
  new LeHibouConnector(),
  new GenericConnector(HiwayConfig),
  new CollectiveConnector(),
  new GenericConnector(CherryPickConfig),
];

export function getConnector(id: string): PlatformConnector | undefined {
  return connectorRegistry.find(c => c.id === id);
}
```

**Step 3: Run tests**

```bash
pnpm test
```

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: uniformize connector registry instantiation"
```

---

## Phase 3 : Investigation des plateformes (necessite acces navigateur)

### Task 11: Investiguer l'API JSON de Comet

**Prerequis:** Se connecter a `app.comet.co` dans Chrome, ouvrir les DevTools > Network, naviguer vers `/missions` et identifier les appels XHR/Fetch JSON.

**Objectif:** Trouver l'endpoint API (probablement GraphQL ou REST), noter:
- L'URL de l'endpoint
- Les headers requis (auth, content-type)
- La structure de la reponse (champs disponibles)
- La pagination (cursor, page, offset)

**Step 1: Investiguer via le navigateur**

Utiliser les outils Chrome (DevTools Network tab) pour capturer les appels API quand on navigue sur les missions Comet.

**Step 2: Reecrire le connector et parser**

Une fois l'API identifiee, reecrire `comet.connector.ts` sur le modele de `freework.connector.ts`:
- Fetch JSON au lieu de HTML
- Parser type avec interface pour la reponse API
- IDs stables depuis l'API

**Step 3: Mettre a jour les tests**

Reecrire `tests/unit/connectors/comet.test.ts` avec des fixtures JSON au lieu de HTML.

**Step 4: Run tests & commit**

```bash
pnpm test tests/unit/connectors/comet.test.ts
pnpm test
git add -A
git commit -m "feat(comet): rewrite connector to use JSON API"
```

---

### Task 12: Investiguer et ameliorer le connecteur Malt

**Prerequis:** Se connecter a `malt.fr` dans Chrome, verifier ce que retourne `/s?q=` en contexte authentifie et chercher des appels API.

**Objectif:**
- Verifier que l'URL `/s?q=` retourne bien des missions en contexte auth
- Chercher une API JSON cachee (appels XHR dans les DevTools)
- Verifier les selecteurs CSS reels du DOM

**Step 1: Investiguer via le navigateur**

**Step 2: Ajuster le connecteur/parser si necessaire**

Si une API JSON est trouvee, reecrire comme Comet (Task 11). Sinon, valider/corriger les selecteurs CSS et l'URL.

**Step 3: Tests & commit**

```bash
pnpm test tests/unit/connectors/malt.test.ts
pnpm test
git add -A
git commit -m "feat(malt): validate and improve connector"
```

---

### Task 13: Valider les selecteurs Hiway et CherryPick

**Prerequis:** Se connecter aux sites respectifs et inspecter le DOM reel.

**Objectif:** Remplacer les selecteurs speculatifs du parser generique si necessaire, ou creer des parsers dedies si le DOM est tres different.

**Step 1: Inspecter le DOM reel**

Pour chaque site:
- Se connecter
- Naviguer vers la page missions
- Inspecter les selecteurs CSS des cartes mission

**Step 2: Ajuster le parser generique ou creer un parser dedie**

Si les selecteurs generiques matchent, rien a faire. Sinon, creer un parser dedie ou ajouter des selecteurs au parser generique.

**Step 3: Tests & commit**

```bash
pnpm test
git add -A
git commit -m "feat(hiway,cherrypick): validate selectors against real DOM"
```

---

## Ordre d'execution recommande

1. **Tasks 1-5** (Phase 1) : peuvent etre executees sequentiellement, chacune auto-suffisante avec un commit
2. **Tasks 6-10** (Phase 2) : peuvent etre executees sequentiellement apres Phase 1
3. **Tasks 11-13** (Phase 3) : necessitent un acces navigateur authentifie, a faire manuellement ou avec aide de Claude in Chrome

Chaque task est independante au sein de sa phase et produit un commit atomique.
