> **⚠️ Historical document** — Ce plan a été rédigé pendant une phase antérieure du projet. Certains choix techniques mentionnés (XState, offscreen document, API Anthropic, Malt, Comet) ne reflètent plus l'architecture actuelle. Voir `README.md` et `AGENTS.md` pour l'état courant.


# Premium Glass UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform MissionPulse into a premium glass morphism UI with minimal user interactions — single-screen onboarding, auto-scan feed, no manual filters.

**Architecture:** Bottom-up approach: update design tokens first, then atoms, molecules, organisms, pages. Each task is a visual layer that builds on the previous. The onboarding machine is simplified to a single state, FeedPage auto-triggers scan on mount, FilterBar is removed.

**Tech Stack:** Svelte 5 (runes), TailwindCSS 4 (CSS-first @theme), XState 5

---

## Task 1: Glass design tokens

**Files:**
- Modify: `src/ui/design-tokens.css`

**Step 1: Update design tokens with glass variables**

Replace the full content of `src/ui/design-tokens.css`:

```css
@import "tailwindcss";

@theme {
  --color-navy-900: #0F172A;
  --color-navy-800: #1E293B;
  --color-navy-700: #334155;
  --color-navy-600: #475569;
  --color-surface: #1E293B;
  --color-surface-hover: #273548;
  --color-surface-active: #2D3F56;
  --color-text-primary: #F8FAFC;
  --color-text-secondary: #94A3B8;
  --color-text-muted: #64748B;
  --color-accent-blue: #3B82F6;
  --color-accent-blue-hover: #2563EB;
  --color-accent-emerald: #10B981;
  --color-accent-amber: #F59E0B;
  --color-accent-red: #EF4444;
  --color-border: #334155;

  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;
  --radius-full: 9999px;

  --shadow-card: 0 1px 3px 0 rgb(0 0 0 / 0.3), 0 1px 2px -1px rgb(0 0 0 / 0.3);
  --shadow-card-hover: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.3);
  --shadow-glow-emerald: 0 0 12px rgba(16, 185, 129, 0.15);
  --shadow-glow-amber: 0 0 12px rgba(245, 158, 11, 0.12);
  --shadow-glow-blue: 0 0 12px rgba(59, 130, 246, 0.12);

  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 0.75rem;
  --spacing-lg: 1rem;
  --spacing-xl: 1.5rem;
}
```

**Step 2: Verify build**

```bash
pnpm build 2>&1 | tail -3
```

**Step 3: Commit**

```bash
git add src/ui/design-tokens.css
git commit -m "style: add glass morphism design tokens (glow shadows, radius-xl)"
```

---

## Task 2: Glass atoms (Button, Badge, SearchInput)

**Files:**
- Modify: `src/ui/atoms/Button.svelte`
- Modify: `src/ui/atoms/Badge.svelte`
- Modify: `src/ui/molecules/SearchInput.svelte`

**Step 1: Update Button with glass variant and transitions**

Replace `src/ui/atoms/Button.svelte`:

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';

  type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'glass';

  let {
    variant = 'primary',
    disabled = false,
    onclick,
    children,
  }: {
    variant?: ButtonVariant;
    disabled?: boolean;
    onclick?: () => void;
    children: Snippet;
  } = $props();

  let classes = $derived(
    variant === 'primary'
      ? 'bg-accent-blue hover:bg-accent-blue-hover text-white shadow-glow-blue'
      : variant === 'secondary'
      ? 'bg-white/5 hover:bg-white/10 text-text-primary border border-white/10'
      : variant === 'glass'
      ? 'bg-white/[0.07] hover:bg-white/[0.12] text-text-primary border border-white/10 backdrop-blur-md'
      : 'hover:bg-white/5 text-text-secondary hover:text-text-primary'
  );
</script>

<button
  class="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ease-out disabled:opacity-50 disabled:cursor-not-allowed {classes}"
  {disabled}
  {onclick}
>
  {@render children()}
</button>
```

**Step 2: Update Badge with glass style**

Replace `src/ui/atoms/Badge.svelte`:

```svelte
<script lang="ts">
  type BadgeVariant = 'tech' | 'status' | 'source';

  let { label, variant = 'tech' }: {
    label: string;
    variant?: BadgeVariant;
  } = $props();

  let classes = $derived(
    variant === 'tech'
      ? 'bg-white/10 text-accent-blue font-mono text-[11px]'
      : variant === 'status'
      ? 'bg-accent-emerald/20 text-accent-emerald text-[11px]'
      : 'bg-white/5 text-text-secondary text-[11px]'
  );
</script>

<span class="inline-flex items-center px-1.5 py-0.5 rounded-full {classes}">
  {label}
</span>
```

**Step 3: Update SearchInput with glass style**

Replace `src/ui/molecules/SearchInput.svelte`:

```svelte
<script lang="ts">
  import Icon from '../atoms/Icon.svelte';

  let { value = '', onSearch }: {
    value?: string;
    onSearch?: (query: string) => void;
  } = $props();

  let localValue = $state('');
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    localValue = value;
  });

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    localValue = target.value;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      onSearch?.(localValue);
    }, 300);
  }

  function clear() {
    localValue = '';
    onSearch?.('');
  }
</script>

<div class="relative">
  <div class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted">
    <Icon name="search" size={14} />
  </div>
  <input
    type="text"
    placeholder="Rechercher..."
    class="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-8 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20 transition-all duration-200"
    value={localValue}
    oninput={handleInput}
  />
  {#if localValue}
    <button
      class="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors duration-200"
      onclick={clear}
    >
      <Icon name="x" size={14} />
    </button>
  {/if}
</div>
```

**Step 4: Verify build**

```bash
pnpm build 2>&1 | tail -3
```

**Step 5: Commit**

```bash
git add src/ui/atoms/Button.svelte src/ui/atoms/Badge.svelte src/ui/molecules/SearchInput.svelte
git commit -m "style: glass morphism atoms (Button, Badge, SearchInput)"
```

---

## Task 3: Glass MissionCard

**Files:**
- Modify: `src/ui/molecules/MissionCard.svelte`

**Step 1: Rewrite MissionCard with glass design and score badge**

Replace `src/ui/molecules/MissionCard.svelte`:

```svelte
<script lang="ts">
  import type { Mission } from '$lib/core/types/mission';
  import Badge from '../atoms/Badge.svelte';
  import Icon from '../atoms/Icon.svelte';

  let { mission }: { mission: Mission } = $props();

  let expanded = $state(false);

  let scoreColor = $derived(
    (mission.score ?? 0) >= 80
      ? 'text-accent-emerald bg-accent-emerald/15'
      : (mission.score ?? 0) >= 50
      ? 'text-accent-amber bg-accent-amber/15'
      : 'text-text-muted bg-white/5'
  );

  let glowClass = $derived(
    (mission.score ?? 0) >= 80
      ? 'shadow-glow-emerald'
      : ''
  );

  function toggleExpand() {
    expanded = !expanded;
  }
</script>

<div
  class="bg-white/[0.07] backdrop-blur-md border border-white/10 border-t-white/15 rounded-xl {glowClass} hover:bg-white/[0.12] hover:scale-[1.01] transition-all duration-200 ease-out cursor-pointer p-3"
  onclick={toggleExpand}
  role="button"
  tabindex="0"
  onkeydown={(e) => { if (e.key === 'Enter') toggleExpand(); }}
>
  <div class="flex items-start justify-between gap-2">
    <div class="flex-1 min-w-0">
      <h3 class="text-sm font-semibold text-text-primary truncate">{mission.title}</h3>
      {#if mission.client}
        <p class="text-xs text-text-secondary mt-0.5">{mission.client}</p>
      {/if}
    </div>
    {#if mission.score !== null}
      <span class="text-xs font-mono font-bold px-2 py-0.5 rounded-full {scoreColor}">{mission.score}</span>
    {/if}
  </div>

  <div class="flex flex-wrap gap-1 mt-2">
    {#each mission.stack.slice(0, 3) as tech}
      <Badge label={tech} variant="tech" />
    {/each}
    {#if mission.stack.length > 3}
      <Badge label="+{mission.stack.length - 3}" variant="source" />
    {/if}
  </div>

  <div class="flex items-center gap-3 mt-2 text-xs text-text-secondary">
    {#if mission.tjm !== null}
      <span class="font-mono text-accent-blue font-semibold">{mission.tjm}€/j</span>
    {/if}
    {#if mission.location}
      <span>{mission.location}</span>
    {/if}
    {#if mission.remote}
      <span class="capitalize">{mission.remote}</span>
    {/if}
    {#if mission.duration}
      <span>{mission.duration}</span>
    {/if}
    <Badge label={mission.source} variant="source" />
  </div>

  {#if expanded && mission.description}
    <p class="mt-3 text-xs text-text-secondary leading-relaxed border-t border-white/5 pt-3">{mission.description}</p>
    <a
      href={mission.url}
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex items-center gap-1 mt-2 text-xs text-accent-blue hover:underline"
      onclick={(e) => e.stopPropagation()}
    >
      Voir la mission <Icon name="arrow-right" size={12} />
    </a>
  {/if}
</div>
```

**Step 2: Verify build**

```bash
pnpm build 2>&1 | tail -3
```

**Step 3: Commit**

```bash
git add src/ui/molecules/MissionCard.svelte
git commit -m "style: glass MissionCard with score badge and glow"
```

---

## Task 4: Glass navigation (App.svelte)

**Files:**
- Modify: `src/sidepanel/App.svelte`

**Step 1: Update App.svelte with glass nav and dot indicator**

In `src/sidepanel/App.svelte`, replace the outer `<div>` and `<nav>` section. Change the root div background and the nav styling.

Replace the root div opening:
```
<div class="w-[400px] h-screen flex flex-col bg-navy-900 text-text-primary font-sans">
```
with:
```
<div class="w-[400px] h-screen flex flex-col bg-navy-900 text-text-primary font-sans">
```
(keep the same — navy-900 background stays as the base)

Replace the nav block (lines 82-95):
```svelte
    <nav class="flex border-b border-white/5 bg-navy-900/80 backdrop-blur-xl">
      {#each navItems as item}
        <button
          class="flex-1 flex flex-col items-center justify-center gap-0.5 px-3 py-2.5 text-xs font-medium transition-all duration-200
            {currentPage === item.page
              ? 'text-white'
              : 'text-white/40 hover:text-white/70'}"
          onclick={() => navigate(item.page)}
        >
          <Icon name={item.icon} size={16} />
          <span>{item.label}</span>
          {#if currentPage === item.page}
            <div class="w-1 h-1 rounded-full bg-accent-blue mt-0.5"></div>
          {:else}
            <div class="w-1 h-1 mt-0.5"></div>
          {/if}
        </button>
      {/each}
    </nav>
```

**Step 2: Verify build**

```bash
pnpm build 2>&1 | tail -3
```

**Step 3: Commit**

```bash
git add src/sidepanel/App.svelte
git commit -m "style: glass navigation with dot indicator"
```

---

## Task 5: Single-screen onboarding

**Files:**
- Modify: `src/ui/organisms/OnboardingWizard.svelte`
- Modify: `src/ui/templates/OnboardingLayout.svelte`
- Modify: `src/ui/pages/OnboardingPage.svelte`

**Step 1: Replace OnboardingWizard with single-screen**

Replace `src/ui/organisms/OnboardingWizard.svelte`:

```svelte
<script lang="ts">
  import type { UserProfile } from '$lib/core/types/profile';
  import Chip from '../atoms/Chip.svelte';
  import Icon from '../atoms/Icon.svelte';

  let {
    onComplete,
    onUpdateProfile,
  }: {
    onComplete?: () => void;
    onUpdateProfile?: (profile: Partial<UserProfile>) => void;
  } = $props();

  let title = $state('');
  let stack = $state<string[]>([]);
  let stackInput = $state('');
  let tjm = $state(600);

  function addStack() {
    const trimmed = stackInput.trim();
    if (trimmed && !stack.includes(trimmed)) {
      stack = [...stack, trimmed];
      stackInput = '';
      onUpdateProfile?.({ stack });
    }
  }

  function removeStack(item: string) {
    stack = stack.filter(s => s !== item);
    onUpdateProfile?.({ stack });
  }

  function handleComplete() {
    onUpdateProfile?.({ title, stack, tjmMin: tjm, tjmMax: tjm + 150 });
    onComplete?.();
  }

  let canSubmit = $derived(title.trim().length > 0);
</script>

<div class="space-y-5">
  <div>
    <label for="ob-title" class="block text-xs text-text-secondary mb-1.5">Titre / Poste</label>
    <input
      id="ob-title"
      type="text"
      class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20 transition-all duration-200"
      placeholder="ex: Développeur Fullstack"
      bind:value={title}
    />
  </div>

  <div>
    <label for="ob-stack" class="block text-xs text-text-secondary mb-1.5">Stack technique</label>
    <div class="flex gap-1.5">
      <input
        id="ob-stack"
        type="text"
        class="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20 transition-all duration-200"
        placeholder="ex: React"
        bind:value={stackInput}
        onkeydown={(e) => { if (e.key === 'Enter') addStack(); }}
      />
      <button
        class="px-3 py-2.5 bg-white/[0.07] border border-white/10 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/[0.12] transition-all duration-200"
        onclick={addStack}
      >+</button>
    </div>
    {#if stack.length > 0}
      <div class="flex flex-wrap gap-1.5 mt-2">
        {#each stack as tech}
          <Chip label={tech} selected={true} onclick={() => removeStack(tech)} />
        {/each}
      </div>
    {/if}
  </div>

  <div>
    <label for="ob-tjm" class="block text-xs text-text-secondary mb-1.5">TJM cible (€/jour)</label>
    <input
      id="ob-tjm"
      type="number"
      class="w-32 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20 transition-all duration-200"
      bind:value={tjm}
    />
  </div>

  <button
    class="w-full py-3 bg-accent-blue hover:bg-accent-blue-hover text-white font-semibold rounded-xl shadow-glow-blue transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
    disabled={!canSubmit}
    onclick={handleComplete}
  >
    C'est parti <Icon name="arrow-right" size={16} />
  </button>
</div>
```

**Step 2: Update OnboardingLayout with glass style**

Replace `src/ui/templates/OnboardingLayout.svelte`:

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { content }: {
    content: Snippet;
  } = $props();
</script>

<div class="flex flex-col h-full items-center justify-center p-6">
  <div class="w-full max-w-sm">
    <div class="text-center mb-8">
      <h1 class="text-2xl font-bold text-white">MissionPulse</h1>
      <p class="text-sm text-text-secondary mt-1.5">Configurez en 30 secondes</p>
    </div>
    {@render content()}
  </div>
</div>
```

**Step 3: Simplify OnboardingPage to skip machine steps**

Replace `src/ui/pages/OnboardingPage.svelte`:

```svelte
<script lang="ts">
  import OnboardingLayout from '../templates/OnboardingLayout.svelte';
  import OnboardingWizard from '../organisms/OnboardingWizard.svelte';
  import type { UserProfile } from '$lib/core/types/profile';
  import { sendMessage } from '$lib/shell/messaging/bridge';

  let { onComplete }: { onComplete?: () => void } = $props();

  let profile: Partial<UserProfile> = {};

  function handleUpdateProfile(updates: Partial<UserProfile>) {
    profile = { ...profile, ...updates };
  }

  async function handleComplete() {
    try {
      await sendMessage({ type: 'SAVE_PROFILE', payload: profile as UserProfile });
    } catch {
      // Outside extension context
    }
    onComplete?.();
  }
</script>

<OnboardingLayout content={wizardContent}>
  {#snippet wizardContent()}
    <OnboardingWizard
      onComplete={handleComplete}
      onUpdateProfile={handleUpdateProfile}
    />
  {/snippet}
</OnboardingLayout>
```

**Step 4: Verify build**

```bash
pnpm build 2>&1 | tail -3
```

**Step 5: Commit**

```bash
git add src/ui/organisms/OnboardingWizard.svelte src/ui/templates/OnboardingLayout.svelte src/ui/pages/OnboardingPage.svelte
git commit -m "feat: single-screen onboarding (title, stack, TJM cible)"
```

---

## Task 6: Auto-scan FeedPage + slim progress bar

**Files:**
- Modify: `src/ui/pages/FeedPage.svelte`
- Modify: `src/ui/organisms/ScanProgress.svelte`
- Modify: `src/ui/templates/FeedLayout.svelte`

**Step 1: Replace ScanProgress with slim 2px bar**

Replace `src/ui/organisms/ScanProgress.svelte`:

```svelte
<script lang="ts">
  let {
    progress = 0,
    isScanning = false,
  }: {
    progress?: number;
    isScanning?: boolean;
  } = $props();
</script>

{#if isScanning}
  <div class="w-full h-0.5 bg-white/5 overflow-hidden">
    <div
      class="h-full bg-accent-blue/70 transition-all duration-500 ease-out"
      style:width="{Math.max(progress, 10)}%"
    ></div>
  </div>
{/if}
```

**Step 2: Simplify FeedLayout (remove filters slot)**

Replace `src/ui/templates/FeedLayout.svelte`:

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { header, feed, sidebar }: {
    header?: Snippet;
    feed: Snippet;
    sidebar?: Snippet;
  } = $props();
</script>

<div class="flex flex-col h-full">
  {#if header}
    <div class="shrink-0">
      {@render header()}
    </div>
  {/if}
  <div class="flex-1 overflow-y-auto px-3 pb-3">
    {@render feed()}
  </div>
  {#if sidebar}
    <div class="shrink-0 border-t border-white/5 p-3">
      {@render sidebar()}
    </div>
  {/if}
</div>
```

**Step 3: Rewrite FeedPage with auto-scan and no FilterBar**

Replace `src/ui/pages/FeedPage.svelte`:

```svelte
<script lang="ts">
  import { createActor } from 'xstate';
  import { feedMachine } from '../../machines/feed.machine';
  import FeedLayout from '../templates/FeedLayout.svelte';
  import MissionFeed from '../organisms/MissionFeed.svelte';
  import ScanProgress from '../organisms/ScanProgress.svelte';
  import SearchInput from '../molecules/SearchInput.svelte';
  import Icon from '../atoms/Icon.svelte';
  import { sendMessage } from '$lib/shell/messaging/bridge';

  const feedActor = createActor(feedMachine);
  feedActor.start();

  let feedSnapshot = $state(feedActor.getSnapshot());

  $effect(() => {
    const sub = feedActor.subscribe((s) => { feedSnapshot = s; });
    return () => sub.unsubscribe();
  });

  let missions = $derived(feedSnapshot.context.filteredMissions);
  let isLoading = $derived(feedSnapshot.matches('loading'));
  let error = $derived(feedSnapshot.context.error);
  let searchQuery = $derived(feedSnapshot.context.searchQuery);

  let isScanning = $state(false);
  let scanProgress = $state(0);

  function handleSearch(query: string) {
    if (query) {
      feedActor.send({ type: 'SEARCH', query });
    } else {
      feedActor.send({ type: 'CLEAR_SEARCH' });
    }
  }

  async function startScan() {
    isScanning = true;
    scanProgress = 0;
    feedActor.send({ type: 'LOAD' });
    await sendMessage({ type: 'SCAN_START' });
  }

  // Auto-scan on mount
  $effect(() => {
    startScan();
  });

  if (import.meta.env.DEV) {
    $effect(() => {
      function handleMissions(e: Event) {
        const missions = (e as CustomEvent).detail;
        isScanning = false;
        scanProgress = 100;
        feedActor.send({ type: 'MISSIONS_LOADED', missions });
      }
      function handleState(e: Event) {
        const state = (e as CustomEvent).detail as string;
        if (state === 'empty') {
          feedActor.send({ type: 'MISSIONS_LOADED', missions: [] });
        } else if (state === 'loading') {
          feedActor.send({ type: 'LOAD' });
        } else if (state === 'error') {
          feedActor.send({ type: 'LOAD_ERROR', error: '[Dev] Simulated error' });
        }
      }
      window.addEventListener('dev:missions', handleMissions);
      window.addEventListener('dev:feed-state', handleState);
      return () => {
        window.removeEventListener('dev:missions', handleMissions);
        window.removeEventListener('dev:feed-state', handleState);
      };
    });
  }
</script>

<FeedLayout feed={feedContent} header={headerContent}>
  {#snippet headerContent()}
    <ScanProgress {isScanning} progress={scanProgress} />
    <div class="flex items-center justify-between px-3 pt-3 pb-2">
      <h2 class="text-sm font-semibold text-white">Missions</h2>
      <button
        class="p-1.5 rounded-lg text-text-muted hover:text-white hover:bg-white/5 transition-all duration-200"
        onclick={startScan}
        title="Rafraîchir"
      >
        <Icon name="refresh-cw" size={14} />
      </button>
    </div>
    <div class="px-3 pb-2">
      <SearchInput value={searchQuery} onSearch={handleSearch} />
    </div>
  {/snippet}

  {#snippet feedContent()}
    <MissionFeed {missions} {isLoading} {error} />
  {/snippet}
</FeedLayout>
```

**Step 4: Verify build**

```bash
pnpm build 2>&1 | tail -3
```

**Step 5: Commit**

```bash
git add src/ui/pages/FeedPage.svelte src/ui/organisms/ScanProgress.svelte src/ui/templates/FeedLayout.svelte
git commit -m "feat: auto-scan feed with slim progress bar, remove FilterBar"
```

---

## Task 7: Glass MissionFeed empty/error states

**Files:**
- Modify: `src/ui/organisms/MissionFeed.svelte`

**Step 1: Update MissionFeed with glass empty/error states**

Replace `src/ui/organisms/MissionFeed.svelte`:

```svelte
<script lang="ts">
  import type { Mission } from '$lib/core/types/mission';
  import MissionCard from '../molecules/MissionCard.svelte';
  import Skeleton from '../atoms/Skeleton.svelte';
  import Icon from '../atoms/Icon.svelte';

  let { missions = [], isLoading = false, error = null }: {
    missions?: Mission[];
    isLoading?: boolean;
    error?: string | null;
  } = $props();

  let sortedMissions = $derived(
    [...missions].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  );
</script>

<div class="flex flex-col gap-2 overflow-y-auto">
  {#if isLoading}
    {#each Array(3) as _}
      <div class="bg-white/[0.05] backdrop-blur-md border border-white/5 rounded-xl p-3 space-y-2">
        <Skeleton width="70%" height="1rem" />
        <Skeleton width="40%" height="0.75rem" />
        <div class="flex gap-1">
          <Skeleton width="3rem" height="1.25rem" rounded="full" />
          <Skeleton width="4rem" height="1.25rem" rounded="full" />
          <Skeleton width="3.5rem" height="1.25rem" rounded="full" />
        </div>
      </div>
    {/each}
  {:else if error}
    <div class="flex flex-col items-center justify-center py-12 text-center">
      <div class="w-10 h-10 rounded-full bg-accent-red/10 flex items-center justify-center mb-3">
        <Icon name="x" size={20} class="text-accent-red" />
      </div>
      <p class="text-sm text-text-primary font-medium">Erreur</p>
      <p class="text-xs text-text-secondary mt-1 max-w-[250px]">{error}</p>
    </div>
  {:else if sortedMissions.length === 0}
    <div class="flex flex-col items-center justify-center py-12 text-center">
      <div class="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-3">
        <Icon name="briefcase" size={20} class="text-text-muted" />
      </div>
      <p class="text-sm text-text-primary font-medium">Aucune mission</p>
      <p class="text-xs text-text-secondary mt-1">Lancez un scan pour trouver des missions</p>
    </div>
  {:else}
    {#each sortedMissions as mission (mission.id)}
      <MissionCard {mission} />
    {/each}
    <p class="text-[10px] text-text-muted text-center py-2">
      {sortedMissions.length} mission{sortedMissions.length > 1 ? 's' : ''}
    </p>
  {/if}
</div>
```

**Step 2: Verify build**

```bash
pnpm build 2>&1 | tail -3
```

**Step 3: Commit**

```bash
git add src/ui/organisms/MissionFeed.svelte
git commit -m "style: glass MissionFeed with refined empty/error states"
```

---

## Task 8: Update E2E tests for new UI

**Files:**
- Modify: `tests/e2e/onboarding.test.ts`
- Modify: `tests/e2e/feed.test.ts`

**Step 1: Update onboarding E2E tests**

The onboarding is now a single screen. The `withNoProfile` helper stays the same, but the flow changes. Update `tests/e2e/onboarding.test.ts`:

```typescript
import { test, expect } from '@playwright/test';

const SIDE_PANEL = '/src/sidepanel/index.html';

async function withNoProfile(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    let _chrome: any = undefined;
    Object.defineProperty(window, 'chrome', {
      configurable: true, enumerable: true,
      get() { return _chrome; },
      set(val) {
        _chrome = val;
        if (val?.runtime?.sendMessage) {
          const origSend = val.runtime.sendMessage;
          val.runtime.sendMessage = async (msg: any) => {
            if (msg?.type === 'GET_PROFILE') return { type: 'PROFILE_RESULT', payload: null };
            return origSend.call(val.runtime, msg);
          };
        }
      },
    });
  });
}

test.describe('Onboarding', () => {
  test('single-screen onboarding completes and shows feed', async ({ page }) => {
    await withNoProfile(page);
    await page.goto(SIDE_PANEL);

    // Single screen: fill title and click "C'est parti"
    await expect(page.getByText('Configurez en 30 secondes')).toBeVisible();
    await page.locator('#ob-title').fill('Dev React Senior');
    await page.getByRole('button', { name: /C.est parti/ }).click();

    // Should now be on feed page
    await expect(page.getByText('Missions')).toBeVisible();
  });

  test('submit button disabled without title', async ({ page }) => {
    await withNoProfile(page);
    await page.goto(SIDE_PANEL);

    await expect(page.getByRole('button', { name: /C.est parti/ })).toBeDisabled();
  });

  test('auto-skips onboarding when profile exists (default stubs)', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();
  });
});
```

**Step 2: Update feed E2E tests for auto-scan (no Scanner button)**

The "Scanner" button is gone — replaced by auto-scan + small refresh icon. Update `tests/e2e/feed.test.ts`:

```typescript
import { test, expect } from '@playwright/test';

const SIDE_PANEL = '/src/sidepanel/index.html';

async function waitForDevPanel(page: import('@playwright/test').Page) {
  await page.locator('button:has-text("Ctrl+Shift+D")').waitFor({ state: 'visible' });
}

test.describe('Feed', () => {
  test('auto-loads missions on mount', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Auto-scan triggers on mount, missions appear after stub delay
    await expect(page.getByText(/\d+ missions?/)).toBeVisible({ timeout: 3000 });
  });

  test('shows empty state via DevPanel', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    await waitForDevPanel(page);
    await page.keyboard.press('Control+Shift+D');
    await expect(page.getByText('DEV PANEL')).toBeVisible();
    await page.getByRole('button', { name: 'empty' }).click();
    await page.keyboard.press('Control+Shift+D');

    await expect(page.getByText('Aucune mission')).toBeVisible({ timeout: 2000 });
  });

  test('search filters missions', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    // Wait for auto-scan to load missions
    await expect(page.getByText(/\d+ missions?/)).toBeVisible({ timeout: 3000 });

    // Search
    await page.getByPlaceholder('Rechercher...').fill('React');
    await page.waitForTimeout(500);
    await expect(page.getByText(/\d+ missions?/)).toBeVisible();
  });

  test('error state shows error message', async ({ page }) => {
    await page.goto(SIDE_PANEL);
    await expect(page.getByText('Missions')).toBeVisible();

    await waitForDevPanel(page);
    await page.keyboard.press('Control+Shift+D');
    await expect(page.getByText('DEV PANEL')).toBeVisible();
    await page.getByRole('button', { name: 'error' }).click();
    await page.keyboard.press('Control+Shift+D');

    await expect(page.getByText('Erreur')).toBeVisible({ timeout: 2000 });
  });
});
```

**Step 3: Run all tests**

```bash
pnpm test 2>&1 | tail -10
pnpm test:e2e 2>&1 | tail -20
```

**Step 4: Commit**

```bash
git add tests/e2e/onboarding.test.ts tests/e2e/feed.test.ts
git commit -m "test: update E2E tests for single-screen onboarding and auto-scan"
```

---

## Task 9: Clean up unused code

**Files:**
- Delete: `src/ui/molecules/FilterBar.svelte`

**Step 1: Verify FilterBar is not imported anywhere**

```bash
grep -r "FilterBar" src/ --include="*.svelte" --include="*.ts"
```

Expected: no results (FeedPage no longer imports it)

**Step 2: Delete FilterBar**

```bash
rm src/ui/molecules/FilterBar.svelte
```

**Step 3: Verify build and tests**

```bash
pnpm build 2>&1 | tail -3
pnpm test 2>&1 | tail -5
```

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove unused FilterBar component"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Glass design tokens | `design-tokens.css` |
| 2 | Glass atoms | `Button.svelte`, `Badge.svelte`, `SearchInput.svelte` |
| 3 | Glass MissionCard | `MissionCard.svelte` |
| 4 | Glass navigation | `App.svelte` |
| 5 | Single-screen onboarding | `OnboardingWizard.svelte`, `OnboardingPage.svelte`, `OnboardingLayout.svelte` |
| 6 | Auto-scan feed + slim progress | `FeedPage.svelte`, `ScanProgress.svelte`, `FeedLayout.svelte` |
| 7 | Glass MissionFeed states | `MissionFeed.svelte` |
| 8 | Update E2E tests | `onboarding.test.ts`, `feed.test.ts` |
| 9 | Clean up FilterBar | Delete `FilterBar.svelte` |
