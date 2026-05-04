<script lang="ts">
  import FeedPage from '../ui/pages/FeedPage.svelte';
  import TJMPage from '../ui/pages/TJMPage.svelte';
  import SettingsPage from '../ui/pages/SettingsPage.svelte';
  import OnboardingPage from '../ui/pages/OnboardingPage.svelte';
  import { Icon } from '@pulse/ui';
  import ConnectionIndicator from '../ui/atoms/ConnectionIndicator.svelte';
  import ToastContainer from '../ui/organisms/ToastContainer.svelte';
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { ripple } from '../ui/actions/ripple';
  import { generateMockMissions } from '../dev/mocks';
  import type { LogEntry } from '../dev/bridge-logger';
  import type { ToastType } from '$lib/state/toast.svelte.ts';
  import { initToastService, showToast } from '../lib/shell/notifications/toast-service';
  import { getConnectionStore } from '$lib/state/connection-singleton.svelte';
  import { createAppNavigation, NAV_ITEMS } from '$lib/state/app-navigation.svelte';

  const nav = createAppNavigation();
  const connection = getConnectionStore();
  let showOfflineBanner = $state(false);
  let feedNavCompact = $state(false);

  // Initialize toast service
  const toastActor = initToastService();

  // Expose showToast globally for child components
  export function showToastMessage(message: string, type: ToastType = 'info'): void {
    showToast(message, type);
  }

  let DevPanel: typeof import('../dev/DevPanel.svelte').default | null = $state(null);
  let bridgeLogs: LogEntry[] = $state([]);

  if (import.meta.env.DEV) {
    import('../dev/DevPanel.svelte').then((m) => {
      DevPanel = m.default;
    });
  }

  function devInjectMissions(count: number) {
    const missions = generateMockMissions(count);
    window.dispatchEvent(new CustomEvent('dev:missions', { detail: missions }));
  }

  function devSetState(state: 'empty' | 'loading' | 'loaded' | 'error') {
    window.dispatchEvent(new CustomEvent('dev:feed-state', { detail: state }));
  }

  function devToggleOnboarding() {
    if (nav.hasCompletedOnboarding) {
      nav.resetToOnboarding();
    } else {
      nav.completeOnboarding();
    }
  }

  function devClearCache() {
    window.dispatchEvent(new CustomEvent('dev:clear-cache'));
  }

  // Réagir aux changements de connexion via le singleton store
  let prevConnectionStatus = $state(connection.status);
  $effect(() => {
    const current = connection.status;
    const wasOffline = prevConnectionStatus === 'offline';
    prevConnectionStatus = current;

    if (current === 'offline') {
      showOfflineBanner = true;
    }

    if (wasOffline && current !== 'offline') {
      showToast('Connexion restaur\u00e9e', 'success');
      setTimeout(() => {
        showOfflineBanner = false;
      }, 3000);
    }
  });

  $effect(() => {
    function handleFeedScrollState(event: Event) {
      const detail = (event as CustomEvent<{ isScrolling: boolean; scrollTop: number }>).detail;
      feedNavCompact = nav.currentPage === 'feed' && detail.isScrolling && detail.scrollTop > 12;
    }

    window.addEventListener('feed:scroll-state', handleFeedScrollState);
    return () => window.removeEventListener('feed:scroll-state', handleFeedScrollState);
  });

  $effect(() => {
    if (nav.currentPage !== 'feed') {
      feedNavCompact = false;
    }
  });

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

<div
  class="panel-shell relative flex h-screen w-full flex-col overflow-hidden bg-page-canvas text-text-primary font-sans"
>
  <div class="relative z-10 flex h-full flex-col">
    {#if showOfflineBanner}
      <div
        class="flex items-center justify-center gap-2 border-b border-border-light bg-status-red/8 px-4 py-2 text-xs text-status-red"
        transition:fade={{ duration: 200 }}
      >
        <Icon name="wifi-off" size={12} />
        <span>Mode hors ligne — Données en cache uniquement</span>
      </div>
    {/if}

    <div class="px-4 pt-4 transition-all duration-300 ease-out {feedNavCompact ? 'pb-0' : ''}">
      <nav
        aria-label="Main navigation"
        class="flex items-center rounded-full border border-border-light bg-subtle-gray transition-all duration-300 ease-out {feedNavCompact
          ? 'gap-0.5 p-0.5 scale-[0.94] origin-top'
          : 'gap-1 p-1'}"
      >
        {#each NAV_ITEMS as item}
          <button
            use:ripple
            class="flex items-center justify-center rounded-full text-[0.72rem] font-medium tracking-[0.08em] transition-all duration-300 ease-out active:scale-[0.985]
          {feedNavCompact
              ? nav.currentPage === item.page
                ? 'flex-[1.8] gap-1.5 px-3 py-1.5'
                : 'flex-[0.45] gap-0 px-2 py-1.5'
              : 'flex-1 gap-2 px-3 py-3'}
          {nav.currentPage === item.page
              ? 'bg-surface-white text-text-primary shadow-subtle-2'
              : 'text-text-subtle hover:bg-surface-white hover:text-text-primary'}"
            aria-current={nav.currentPage === item.page ? 'page' : undefined}
            onclick={() => nav.navigate(item.page)}
          >
            <Icon name={item.icon} size={feedNavCompact ? 13 : 16} />
            <span
              class="overflow-hidden whitespace-nowrap transition-all duration-300 ease-out {feedNavCompact &&
              nav.currentPage !== item.page
                ? 'max-w-0 opacity-0'
                : 'max-w-20 opacity-100'}">{item.label}</span
            >
          </button>
        {/each}
      </nav>

      <div class="mt-3 flex justify-end">
        <ConnectionIndicator />
      </div>
    </div>
    <main class="relative flex-1 overflow-hidden">
      <div class="absolute inset-0 overflow-y-auto" class:hidden={nav.currentPage !== 'feed'}>
        <svelte:boundary
          onerror={(e) => {
            if (import.meta.env.DEV) console.error('[FeedPage crash]', e);
          }}
        >
          <FeedPage onNavigateToOnboarding={nav.resetToOnboarding} />
          {#snippet failed(error, reset)}
            <div class="flex flex-col items-center justify-center gap-4 p-8 text-center">
              <div class="text-4xl">⚠️</div>
              <p class="text-sm text-text-secondary">Le feed a rencontré une erreur.</p>
              <button
                onclick={reset}
                class="rounded-lg bg-blueprint-blue/10 px-4 py-2 text-xs text-blueprint-blue hover:bg-blueprint-blue/15 transition-colors"
              >
                Réessayer
              </button>
            </div>
          {/snippet}
        </svelte:boundary>
      </div>

      {#if nav.currentPage === 'onboarding'}
        <div
          class="absolute inset-0 overflow-y-auto"
          in:fly={{ x: 30, duration: 200, easing: cubicOut }}
          out:fade={{ duration: 100 }}
        >
          <svelte:boundary
            onerror={(e) => {
              if (import.meta.env.DEV) console.error('[OnboardingPage crash]', e);
            }}
          >
            <OnboardingPage onComplete={nav.completeOnboarding} onSkip={nav.completeOnboarding} />
            {#snippet failed(error, reset)}
              <div class="flex flex-col items-center justify-center gap-4 p-8 text-center">
                <div class="text-4xl">🚀</div>
                <p class="text-sm text-text-secondary">L'onboarding a rencontré une erreur.</p>
                <button
                  onclick={reset}
                  class="rounded-lg bg-blueprint-blue/10 px-4 py-2 text-xs text-blueprint-blue hover:bg-blueprint-blue/15 transition-colors"
                >
                  Réessayer
                </button>
              </div>
            {/snippet}
          </svelte:boundary>
        </div>
      {/if}
      {#if nav.currentPage === 'tjm'}
        <div
          class="absolute inset-0 overflow-y-auto"
          in:fly={{ x: 30, duration: 200, easing: cubicOut }}
          out:fade={{ duration: 100 }}
        >
          <svelte:boundary
            onerror={(e) => {
              if (import.meta.env.DEV) console.error('[TJMPage crash]', e);
            }}
          >
            <TJMPage />
            {#snippet failed(error, reset)}
              <div class="flex flex-col items-center justify-center gap-4 p-8 text-center">
                <div class="text-4xl">📈</div>
                <p class="text-sm text-text-secondary">La vue TJM a rencontré une erreur.</p>
                <button
                  onclick={reset}
                  class="rounded-lg bg-blueprint-blue/10 px-4 py-2 text-xs text-blueprint-blue hover:bg-blueprint-blue/15 transition-colors"
                >
                  Réessayer
                </button>
              </div>
            {/snippet}
          </svelte:boundary>
        </div>
      {/if}
      {#if nav.currentPage === 'settings'}
        <div
          class="absolute inset-0 overflow-y-auto"
          in:fly={{ x: 30, duration: 200, easing: cubicOut }}
          out:fade={{ duration: 100 }}
        >
          <svelte:boundary
            onerror={(e) => {
              if (import.meta.env.DEV) console.error('[SettingsPage crash]', e);
            }}
          >
            <SettingsPage
              onBack={() => nav.navigate('feed')}
              onNavigateToOnboarding={nav.resetToOnboarding}
            />
            {#snippet failed(error, reset)}
              <div class="flex flex-col items-center justify-center gap-4 p-8 text-center">
                <div class="text-4xl">⚙️</div>
                <p class="text-sm text-text-secondary">Les paramètres ont rencontré une erreur.</p>
                <button
                  onclick={reset}
                  class="rounded-lg bg-blueprint-blue/10 px-4 py-2 text-xs text-blueprint-blue hover:bg-blueprint-blue/15 transition-colors"
                >
                  Réessayer
                </button>
              </div>
            {/snippet}
          </svelte:boundary>
        </div>
      {/if}
    </main>
  </div>

  <ToastContainer store={toastActor} />

  {#if import.meta.env.DEV && DevPanel}
    <DevPanel
      onInjectMissions={devInjectMissions}
      onSetState={devSetState}
      onToggleOnboarding={devToggleOnboarding}
      onClearCache={devClearCache}
      logs={bridgeLogs}
    />
  {/if}
</div>
