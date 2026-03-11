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

<div class="w-[400px] h-screen flex flex-col bg-navy-900 text-text-primary font-sans">
  {#if currentPage === 'onboarding' && !hasCompletedOnboarding}
    <OnboardingPage onComplete={completeOnboarding} />
  {:else}
    <nav aria-label="Main navigation" class="relative flex border-b border-white/5 bg-navy-900/80 backdrop-blur-xl">
      {#each navItems as item, i}
        <button
          use:ripple
          class="flex-1 flex flex-col items-center justify-center gap-0.5 px-3 py-2.5 text-xs font-medium transition-all duration-200 active:scale-[0.97]
            {currentPage === item.page
              ? 'text-white'
              : 'text-white/40 hover:text-white/70'}"
          aria-current={currentPage === item.page ? 'page' : undefined}
          onclick={() => navigate(item.page)}
        >
          <Icon name={item.icon} size={16} />
          <span>{item.label}</span>
        </button>
      {/each}
      <div
        class="absolute bottom-1 h-1 w-1 rounded-full bg-accent-blue transition-all duration-200 ease-out"
        style:left="calc({(PAGE_INDEX[currentPage] ?? 0) * 100 / 3 + 100 / 6}%)"
        style:transform="translateX(-50%)"
      ></div>
    </nav>
    <main class="flex-1 overflow-hidden relative">
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
