<script lang="ts">
  import FeedPage from '../ui/pages/FeedPage.svelte';
  import TJMPage from '../ui/pages/TJMPage.svelte';
  import SettingsPage from '../ui/pages/SettingsPage.svelte';
  import OnboardingPage from '../ui/pages/OnboardingPage.svelte';
  import Icon from '../ui/atoms/Icon.svelte';
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { ripple } from '../ui/actions/ripple';
  import { generateMockMissions } from '../dev/mocks';
  import type { LogEntry } from '../dev/bridge-logger';

  type Page = 'feed' | 'tjm' | 'settings' | 'onboarding';

  let currentPage: Page = $state('onboarding');
  let hasCompletedOnboarding = $state(false);

  const PAGE_INDEX: Record<Page, number> = { onboarding: -1, feed: 0, tjm: 1, settings: 2 };
  let previousPageIndex = $state(PAGE_INDEX['onboarding']);
  let transitionDirection = $state(1);

  let DevPanel: typeof import('../dev/DevPanel.svelte').default | null = $state(null);
  let bridgeLogs: LogEntry[] = $state([]);

  if (import.meta.env.DEV) {
    import('../dev/DevPanel.svelte').then(m => { DevPanel = m.default; });
  }

  function devInjectMissions(count: number) {
    const missions = generateMockMissions(count);
    window.dispatchEvent(new CustomEvent('dev:missions', { detail: missions }));
  }

  function devSetState(state: 'empty' | 'loading' | 'loaded' | 'error') {
    window.dispatchEvent(new CustomEvent('dev:feed-state', { detail: state }));
  }

  function devToggleOnboarding() {
    hasCompletedOnboarding = !hasCompletedOnboarding;
    currentPage = hasCompletedOnboarding ? 'feed' : 'onboarding';
  }

  function navigate(page: Page) {
    const newIndex = PAGE_INDEX[page];
    transitionDirection = newIndex > previousPageIndex ? 1 : -1;
    previousPageIndex = newIndex;
    currentPage = page;
  }

  function completeOnboarding() {
    hasCompletedOnboarding = true;
    transitionDirection = 1;
    previousPageIndex = PAGE_INDEX['feed'];
    currentPage = 'feed';
  }

  // Check if profile exists on mount
  $effect(() => {
    (async () => {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_PROFILE' });
        if (response?.payload) {
          hasCompletedOnboarding = true;
          previousPageIndex = PAGE_INDEX['feed'];
          currentPage = 'feed';
        }
      } catch {
        // Outside extension context — show onboarding
      }
    })();
  });

  const navItems: { page: Page; label: string; icon: string }[] = [
    { page: 'feed', label: 'Feed', icon: 'briefcase' },
    { page: 'tjm', label: 'TJM', icon: 'trending-up' },
    { page: 'settings', label: 'Settings', icon: 'settings' },
  ];

  if (import.meta.env.DEV) {
    $effect(() => {
      function handleBridgeLog(e: Event) {
        const log = (e as CustomEvent).detail;
        bridgeLogs = [...bridgeLogs.slice(-99), log];
      }
      window.addEventListener('dev:bridge-log', handleBridgeLog);
      return () => window.removeEventListener('dev:bridge-log', handleBridgeLog);
    });
  }
</script>

<div class="panel-shell relative flex h-screen w-[400px] flex-col overflow-hidden text-text-primary font-sans">
  <div class="panel-grid pointer-events-none absolute inset-0 opacity-45"></div>
  <div class="pointer-events-none absolute -left-16 top-10 h-40 w-40 rounded-full bg-accent-blue/12 blur-3xl"></div>
  <div class="pointer-events-none absolute right-[-2.5rem] top-48 h-36 w-36 rounded-full bg-accent-emerald/10 blur-3xl"></div>
  <div class="pointer-events-none absolute bottom-0 left-14 h-32 w-32 rounded-full bg-accent-amber/10 blur-3xl"></div>
  {#if currentPage === 'onboarding' && !hasCompletedOnboarding}
    <OnboardingPage onComplete={completeOnboarding} />
  {:else}
    <div class="relative z-10 flex h-full flex-col">
      <div class="px-3 pt-3">
        <nav
          aria-label="Main navigation"
          class="section-card flex items-center gap-1 rounded-[1.5rem] p-1.5"
        >
      {#each navItems as item}
        <button
          use:ripple
          class="flex flex-1 items-center justify-center gap-2 rounded-[1rem] px-3 py-2.5 text-[0.72rem] font-medium tracking-[0.08em] transition-all duration-250 active:scale-[0.985]
            {currentPage === item.page
              ? 'bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_18px_rgba(1,7,12,0.22)]'
              : 'text-text-secondary hover:bg-white/[0.04] hover:text-white'}"
          aria-current={currentPage === item.page ? 'page' : undefined}
          onclick={() => navigate(item.page)}
        >
          <Icon name={item.icon} size={16} />
          <span>{item.label}</span>
        </button>
      {/each}
        </nav>
      </div>
      <main class="relative flex-1 overflow-hidden">
        {#key currentPage}
          <div
            class="absolute inset-0"
            in:fly={{ x: transitionDirection * 30, duration: 200, easing: cubicOut }}
            out:fade={{ duration: 100 }}
          >
            {#if currentPage === 'feed'}
              <FeedPage />
            {:else if currentPage === 'tjm'}
              <TJMPage />
            {:else if currentPage === 'settings'}
              <SettingsPage onBack={() => navigate('feed')} />
            {/if}
          </div>
        {/key}
      </main>
    </div>
  {/if}

  {#if import.meta.env.DEV && DevPanel}
    <DevPanel
      onInjectMissions={devInjectMissions}
      onSetState={devSetState}
      onToggleOnboarding={devToggleOnboarding}
      logs={bridgeLogs}
    />
  {/if}
</div>
