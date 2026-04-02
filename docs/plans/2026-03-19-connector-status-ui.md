> **⚠️ Historical document** — Ce plan a été rédigé pendant une phase antérieure du projet. Certains choix techniques mentionnés (XState, offscreen document, API Anthropic, Malt, Comet) ne reflètent plus l'architecture actuelle. Voir `README.md` et `AGENTS.md` pour l'état courant.


# Connector Status UI — Plan d'implementation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Afficher l'etat de chaque connecteur en temps reel pendant le scan, et les erreurs persistees hors scan.

**Architecture:** Refactorer le composant existant `ConnectorStatus.svelte` pour accepter les nouveaux types `ConnectorStatus` du actor model, creer un composant liste `ConnectorStatusList.svelte`, ajouter `url` a `ConnectorMeta`, et integrer dans FeedPage sous ScanProgress.

**Tech Stack:** Svelte 5 (runes), TailwindCSS 4, TypeScript strict

**Design doc:** `docs/plans/2026-03-19-connector-status-ui-design.md`

---

### Task 1: Ajouter `url` a ConnectorMeta

**Files:**
- Modify: `src/lib/shell/connectors/index.ts`

**Step 1: Add `url` field to `ConnectorMeta` interface (line 19-23)**

```ts
export interface ConnectorMeta {
  id: ConnectorId;
  name: string;
  icon: string;
  url: string;
}
```

**Step 2: Add `url` to each entry in `getConnectorsMeta()` (line 36-71)**

```ts
return [
  {
    id: 'free-work',
    name: 'Free-Work',
    icon: 'https://www.google.com/s2/favicons?domain=free-work.com&sz=32',
    url: 'https://www.free-work.com',
  },
  {
    id: 'comet',
    name: 'Comet',
    icon: 'https://www.google.com/s2/favicons?domain=comet.co&sz=32',
    url: 'https://app.comet.co',
  },
  {
    id: 'lehibou',
    name: 'LeHibou',
    icon: 'https://www.google.com/s2/favicons?domain=lehibou.com&sz=32',
    url: 'https://www.lehibou.com',
  },
  {
    id: 'hiway',
    name: 'Hiway',
    icon: 'https://www.google.com/s2/favicons?domain=hiway.fr&sz=32',
    url: 'https://app.hiway.fr',
  },
  {
    id: 'collective',
    name: 'Collective',
    icon: 'https://www.google.com/s2/favicons?domain=collective.work&sz=32',
    url: 'https://app.collective.work',
  },
  {
    id: 'cherry-pick',
    name: 'Cherry Pick',
    icon: 'https://www.google.com/s2/favicons?domain=cherry-pick.io&sz=32',
    url: 'https://www.cherry-pick.io',
  },
];
```

**Step 3: Run tests**

Run: `pnpm vitest run`
Expected: PASS (no tests directly depend on ConnectorMeta shape)

**Step 4: Commit**

```bash
git add src/lib/shell/connectors/index.ts
git commit -m "feat(connectors): add url field to ConnectorMeta"
```

---

### Task 2: Refactorer ConnectorStatus.svelte

**Files:**
- Modify: `src/ui/molecules/ConnectorStatus.svelte`
- Modify: `src/lib/core/types/connector.ts` (delete deprecated file or redirect)

The existing component imports from the deprecated `$lib/core/types/connector`. We refactor it to use the new `ConnectorStatus` type from `connector-status.ts` and support both scan-time and persisted display.

**Step 1: Rewrite `ConnectorStatus.svelte`**

```svelte
<script lang="ts">
  import type { ConnectorStatus as ConnectorStatusType } from '$lib/core/types/connector-status';
  import type { PersistedConnectorStatus } from '$lib/core/types/connector-status';
  import Icon from '../atoms/Icon.svelte';

  let {
    name,
    icon = '',
    url = '',
    status = null,
    persisted = null,
  }: {
    name: string;
    icon?: string;
    url?: string;
    status?: ConnectorStatusType | null;
    persisted?: PersistedConnectorStatus | null;
  } = $props();

  let imgFailed = $state(false);

  // Derive display state from either live status or persisted
  let state = $derived(status?.state ?? persisted?.lastState ?? 'pending');
  let missionsCount = $derived(status?.missionsCount ?? persisted?.missionsCount ?? 0);
  let retryCount = $derived(status?.retryCount ?? 0);
  let errorMessage = $derived.by(() => {
    if (status?.error) return status.error.message;
    if (persisted?.error && typeof persisted.error === 'object' && 'message' in persisted.error) {
      return persisted.error.message as string;
    }
    return null;
  });

  let isSessionError = $derived.by(() => {
    if (!errorMessage) return false;
    const msg = errorMessage.toLowerCase();
    return msg.includes('session') || msg.includes('expir');
  });

  let relativeTime = $derived.by(() => {
    const ts = persisted?.lastSyncAt;
    if (!ts) return null;
    const diff = Date.now() - ts;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "a l'instant";
    if (minutes < 60) return `il y a ${minutes}min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `il y a ${hours}h`;
    return `il y a ${Math.floor(hours / 24)}j`;
  });

  // State-dependent visuals
  let stateConfig = $derived.by(() => {
    switch (state) {
      case 'pending':
        return { icon: 'loader', color: 'text-text-muted', label: 'En attente', spin: false };
      case 'detecting':
        return { icon: 'loader', color: 'text-accent-blue', label: 'Detection...', spin: true };
      case 'fetching':
        return { icon: 'loader', color: 'text-accent-blue', label: 'Scraping...', spin: true };
      case 'retrying':
        return { icon: 'loader', color: 'text-accent-amber', label: `Retry ${retryCount}/3...`, spin: true };
      case 'done':
        return { icon: 'check', color: 'text-accent-emerald', label: `${missionsCount} mission${missionsCount > 1 ? 's' : ''}`, spin: false };
      case 'error':
        return { icon: 'x-circle', color: 'text-red-400', label: errorMessage ?? 'Erreur', spin: false };
      default:
        return { icon: 'loader', color: 'text-text-muted', label: '...', spin: false };
    }
  });

  function handleReconnect() {
    if (url) {
      try {
        chrome.tabs.create({ url });
      } catch {
        window.open(url, '_blank');
      }
    }
  }
</script>

<div class="flex items-center gap-2.5 py-1.5">
  <!-- Connector icon -->
  <div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/[0.04]">
    {#if icon.startsWith('http') && !imgFailed}
      <img src={icon} alt={name} width="14" height="14" class="rounded-sm" onerror={() => { imgFailed = true; }} />
    {:else}
      <span class="text-[9px] font-bold text-text-secondary">{name.slice(0, 2).toUpperCase()}</span>
    {/if}
  </div>

  <!-- Name -->
  <span class="min-w-0 flex-1 truncate text-[11px] font-medium text-text-primary">{name}</span>

  <!-- Status -->
  <div class="flex items-center gap-1.5">
    {#if state === 'error' && isSessionError && url}
      <button
        class="text-[10px] text-accent-blue hover:underline"
        onclick={handleReconnect}
      >
        Reconnecter
      </button>
    {/if}

    {#if relativeTime && state === 'error'}
      <span class="text-[9px] text-text-muted">{relativeTime}</span>
    {/if}

    <span class="flex items-center gap-1 text-[10px] {stateConfig.color}">
      <span class:animate-spin={stateConfig.spin}>
        <Icon name={stateConfig.icon} size={12} />
      </span>
      <span class="max-w-24 truncate">{stateConfig.label}</span>
    </span>
  </div>
</div>
```

**Step 2: Run tests**

Run: `pnpm vitest run`
Expected: PASS

**Step 3: Commit**

```bash
git add src/ui/molecules/ConnectorStatus.svelte
git commit -m "refactor(ui): update ConnectorStatus component for actor model types"
```

---

### Task 3: Creer ConnectorStatusList.svelte

**Files:**
- Create: `src/ui/molecules/ConnectorStatusList.svelte`

**Step 1: Create the list component**

```svelte
<script lang="ts">
  import type { ConnectorStatus } from '$lib/core/types/connector-status';
  import type { PersistedConnectorStatus } from '$lib/core/types/connector-status';
  import ConnectorStatusItem from './ConnectorStatus.svelte';
  import { getConnectorsMeta } from '$lib/shell/connectors/index';

  let {
    statuses = new Map(),
    persistedStatuses = [],
    isScanning = false,
  }: {
    statuses?: Map<string, ConnectorStatus>;
    persistedStatuses?: PersistedConnectorStatus[];
    isScanning?: boolean;
  } = $props();

  const meta = getConnectorsMeta();
  function getMeta(id: string) {
    return meta.find((m) => m.id === id);
  }

  // During scan: show all connectors from statuses map
  let scanEntries = $derived([...statuses.entries()]);

  // Outside scan: show only persisted errors
  let errorEntries = $derived(
    persistedStatuses.filter((s) => s.lastState === 'error')
  );

  let shouldShow = $derived(isScanning ? scanEntries.length > 0 : errorEntries.length > 0);
</script>

{#if shouldShow}
  <div class="mt-3 space-y-0.5">
    {#if isScanning}
      {#each scanEntries as [id, status] (id)}
        {@const m = getMeta(id)}
        <ConnectorStatusItem
          name={m?.name ?? id}
          icon={m?.icon ?? ''}
          url={m?.url ?? ''}
          {status}
        />
      {/each}
    {:else}
      {#each errorEntries as persisted (persisted.connectorId)}
        {@const m = getMeta(persisted.connectorId)}
        <ConnectorStatusItem
          name={m?.name ?? persisted.connectorName}
          icon={m?.icon ?? ''}
          url={m?.url ?? ''}
          {persisted}
        />
      {/each}
    {/if}
  </div>
{/if}
```

**Step 2: Run tests**

Run: `pnpm vitest run`
Expected: PASS

**Step 3: Commit**

```bash
git add src/ui/molecules/ConnectorStatusList.svelte
git commit -m "feat(ui): add ConnectorStatusList component"
```

---

### Task 4: Integrer dans FeedPage

**Files:**
- Modify: `src/ui/pages/FeedPage.svelte`

**Step 1: Add import**

Add to imports section:
```ts
import ConnectorStatusList from "../molecules/ConnectorStatusList.svelte";
```

**Step 2: Add component in template after ScanProgress (around line 537)**

Insert after the `<ScanProgress ... />` closing tag and before the `{#if isOffline}` block:

```svelte
<ConnectorStatusList
  statuses={connectorStatuses}
  {persistedStatuses}
  isScanning={isLoading}
/>
```

**Step 3: Run tests**

Run: `pnpm vitest run`
Expected: PASS

**Step 4: Build**

Run: `pnpm build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/ui/pages/FeedPage.svelte
git commit -m "feat(ui): integrate ConnectorStatusList in FeedPage"
```

---

### Task 5: Nettoyer l'ancien type deprecated

**Files:**
- Modify: `src/lib/core/types/connector.ts`

**Step 1: Check if anyone still imports from this file**

Run: `grep -r "types/connector'" src/ --include='*.ts' --include='*.svelte'`

If only `ConnectorStatus.svelte` imported it (now refactored), delete the file.
If other files still import, keep it with a re-export or migrate them.

**Step 2: Delete or update**

If safe to delete:
```bash
rm src/lib/core/types/connector.ts
```

**Step 3: Run tests + build**

Run: `pnpm vitest run && pnpm build`
Expected: PASS

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove deprecated connector.ts type file"
```

---

### Task 6: Verification finale

**Step 1: Full test suite**

Run: `pnpm vitest run`
Expected: All PASS

**Step 2: Build**

Run: `pnpm build`
Expected: Build succeeds

**Step 3: Manual smoke test**

- Load extension in Chrome
- Open side panel
- Start scan → verify list of sources appears with state progression
- Verify completed sources show green checkmark + mission count
- Verify failed source shows red with error type
- If session error → verify "Reconnecter" link appears and opens platform
- Close panel, reopen → verify only error sources show (if any)
- If no errors → verify no source list visible

**Step 4: Final commit if needed**
