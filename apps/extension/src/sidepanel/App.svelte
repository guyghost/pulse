<script lang="ts">
  import FeedPage from '../ui/pages/FeedPage.svelte';
  import ProfilePage from '../ui/pages/ProfilePage.svelte';
  import CvPage from '../ui/pages/CvPage.svelte';
  import ApplicationsPage from '../ui/pages/ApplicationsPage.svelte';
  import TJMPage from '../ui/pages/TJMPage.svelte';
  import SettingsPage from '../ui/pages/SettingsPage.svelte';
  import OnboardingPage from '../ui/pages/OnboardingPage.svelte';
  import { Icon } from '@pulse/ui';
  import ConnectionIndicator from '../ui/atoms/ConnectionIndicator.svelte';
  import ToastContainer from '../ui/organisms/ToastContainer.svelte';
  import OperationalEmptyState from '../ui/molecules/OperationalEmptyState.svelte';
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { ripple } from '../ui/actions/ripple';
  import { generateMockMissions } from '../dev/mocks';
  import type { LogEntry } from '../dev/bridge-logger';
  import type { ToastType } from '$lib/state/toast.svelte.ts';
  import { initToastService, showToast } from '../lib/shell/notifications/toast-service';
  import { getConnectionStore } from '$lib/state/connection-singleton.svelte';
  import { createAppNavigation, NAV_ITEMS, type Page } from '$lib/state/app-navigation.svelte';
  import { createThemeStore } from '$lib/state/theme.svelte';
  import { premium } from '$lib/state/premium.svelte';

  const nav = createAppNavigation();
  const theme = createThemeStore();

  // Load premium status from storage on mount
  $effect(() => {
    premium.load();
  });

  type PremiumLockContent = {
    title: string;
    description: string;
    proofLabel: string;
    proofValue: string;
  };

  const PREMIUM_LOCKS: Partial<Record<Page, PremiumLockContent>> = {
    cv: {
      title: 'CV canonique premium verrouillé',
      description:
        'Cette vue prépare un profil candidat cohérent pour LinkedIn, dashboard et plateformes. Vos sessions restent dans Chrome.',
      proofLabel: 'Surface',
      proofValue: 'CV',
    },
    applications: {
      title: 'Suivi candidatures premium verrouillé',
      description:
        'Le pipeline transforme les missions retenues en relances, statuts et prochaines actions. Le feed reste disponible pour qualifier les missions.',
      proofLabel: 'Surface',
      proofValue: 'Suivi',
    },
    tjm: {
      title: 'Radar TJM premium verrouillé',
      description:
        'Le radar tarifaire consolide les missions scannées pour estimer une fourchette de négociation exploitable.',
      proofLabel: 'Surface',
      proofValue: 'TJM',
    },
  };

  const visibleNavItems = NAV_ITEMS;
  const denseNav = $derived(visibleNavItems.length > 4);
  const lockedPremiumPage = $derived(
    premium.isPremium ? null : (PREMIUM_LOCKS[nav.currentPage] ?? null)
  );

  function isPremiumLocked(page: Page): boolean {
    return !premium.isPremium && page in PREMIUM_LOCKS;
  }

  // Initialize theme on mount
  theme.init();
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
  let MetricsPanel: typeof import('../ui/organisms/MetricsPanel.svelte').default | null =
    $state(null);
  let bridgeLogs: LogEntry[] = $state([]);

  if (import.meta.env.DEV) {
    import('../dev/DevPanel.svelte').then((m) => {
      DevPanel = m.default;
    });
    import('../ui/organisms/MetricsPanel.svelte').then((m) => {
      MetricsPanel = m.default;
    });
  }

  function devInjectMissions(count: number) {
    const missions = generateMockMissions(count);
    window.localStorage.setItem('__missionpulse_dev_missions', JSON.stringify(missions));
    window.dispatchEvent(new CustomEvent('dev:missions', { detail: missions }));
  }

  function devSetState(state: 'empty' | 'loading' | 'loaded' | 'error') {
    if (state === 'empty') {
      window.localStorage.setItem('__missionpulse_dev_missions', JSON.stringify([]));
    }
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
      feedNavCompact = nav.currentPage === 'feed' && detail.scrollTop > 12;
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

    {#if nav.currentPage !== 'onboarding'}
      <div class="px-4 pt-4 transition-all duration-200 ease-out">
        <nav
          aria-label="Main navigation"
          class="flex items-center rounded-full border border-border-light bg-subtle-gray transition-[padding,gap,min-height] duration-200 ease-out {feedNavCompact
            ? 'min-h-11 gap-0.5 p-0.5'
            : denseNav
              ? 'min-h-11 gap-0.5 p-0.5'
              : 'min-h-12 gap-1 p-1'}"
        >
          {#each visibleNavItems as item}
            {@const itemLocked = isPremiumLocked(item.page)}
            <button
              use:ripple
              class="relative flex min-w-0 items-center justify-center rounded-full text-[0.72rem] font-medium tracking-[0.08em] transition-[flex-basis,flex-grow,padding,gap,background-color,color,box-shadow] duration-200 ease-out active:scale-[0.985]
          {feedNavCompact
                ? nav.currentPage === item.page
                  ? 'flex-1 gap-1.5 px-3 py-1.5'
                  : 'basis-9 flex-none gap-0 px-0 py-1.5'
                : denseNav
                  ? nav.currentPage === item.page
                    ? 'flex-1 gap-1.5 px-3 py-2'
                    : 'basis-10 flex-none gap-0 px-0 py-2'
                  : 'flex-1 basis-0 gap-2 px-3 py-3'}
          {nav.currentPage === item.page
                ? 'bg-surface-white text-text-primary shadow-subtle-2'
                : itemLocked
                  ? 'text-text-muted hover:bg-surface-white hover:text-text-primary'
                  : 'text-text-subtle hover:bg-surface-white hover:text-text-primary'}"
              aria-current={nav.currentPage === item.page ? 'page' : undefined}
              aria-label={itemLocked
                ? `${item.label} premium verrouillé`
                : (item.ariaLabel ?? item.label)}
              title={itemLocked ? `${item.label} premium verrouillé` : item.label}
              onclick={() => nav.navigate(item.page)}
            >
              <span class="shrink-0 transition-transform duration-200 ease-out">
                <Icon name={item.icon} size={feedNavCompact || denseNav ? 13 : 16} />
              </span>
              <span
                class="min-w-0 overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-200 ease-out {(feedNavCompact &&
                  nav.currentPage !== item.page) ||
                (denseNav && nav.currentPage !== item.page)
                  ? 'max-w-0 opacity-0 -translate-x-1'
                  : 'max-w-24 opacity-100 translate-x-0'}">{item.label}</span
              >
              {#if itemLocked}
                <span
                  class="absolute right-1 top-1 flex h-3 w-3 items-center justify-center rounded-full bg-surface-white text-text-muted ring-1 ring-border-light"
                  aria-hidden="true"
                >
                  <Icon name="lock" size={8} />
                </span>
              {/if}
            </button>
          {/each}
        </nav>

        <div
          class="grid transition-[opacity,margin] duration-200 ease-out {feedNavCompact
            ? 'mt-2 opacity-0 pointer-events-none'
            : 'mt-3 opacity-100'}"
        >
          <div class="min-h-0 overflow-hidden flex justify-end">
            <ConnectionIndicator />
          </div>
        </div>
      </div>
    {/if}
    <main class="relative flex-1 overflow-hidden">
      <div
        class="absolute inset-0 overflow-hidden"
        class:hidden={nav.currentPage !== 'feed'}
        aria-hidden={nav.currentPage !== 'feed'}
        inert={nav.currentPage !== 'feed'}
      >
        <svelte:boundary
          onerror={(e) => {
            if (import.meta.env.DEV) console.error('[FeedPage crash]', e);
          }}
        >
          <FeedPage
            onNavigateToOnboarding={nav.resetToOnboarding}
            onNavigateToProfile={() => nav.navigate('profile')}
          />
          {#snippet failed(error, reset)}
            <div class="p-4">
              <OperationalEmptyState
                title="Le feed a rencontré une erreur"
                description="La vue principale est indisponible, mais l’extension reste ouverte. Réessayez le rendu avant de relancer le scan."
                severity="incident"
                statusLabel="Vue interrompue"
                icon="triangle-alert"
                proofLabel="Ecran"
                proofValue="Feed"
                primaryActionLabel="Réessayer"
                primaryActionIcon="refresh-cw"
                onPrimaryAction={reset}
              />
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
              <div class="p-4">
                <OperationalEmptyState
                  title="L’onboarding a été interrompu"
                  description="La configuration initiale n’a pas pu s’afficher. Réessayez avant de passer en mode manuel."
                  severity="incident"
                  statusLabel="Configuration bloquée"
                  icon="triangle-alert"
                  proofLabel="Ecran"
                  proofValue="Onboarding"
                  primaryActionLabel="Réessayer"
                  primaryActionIcon="refresh-cw"
                  onPrimaryAction={reset}
                />
              </div>
            {/snippet}
          </svelte:boundary>
        </div>
      {/if}
      {#if lockedPremiumPage}
        <div
          class="absolute inset-0 overflow-y-auto"
          in:fly={{ x: 30, duration: 200, easing: cubicOut }}
          out:fade={{ duration: 100 }}
        >
          <div class="p-4">
            <OperationalEmptyState
              title={lockedPremiumPage.title}
              description={lockedPremiumPage.description}
              severity="attention"
              statusLabel="Premium verrouillé"
              icon="lock"
              proofLabel={lockedPremiumPage.proofLabel}
              proofValue={lockedPremiumPage.proofValue}
              primaryActionLabel="Voir les réglages"
              primaryActionIcon="settings"
              onPrimaryAction={() => nav.navigate('settings')}
            />
          </div>
        </div>
      {/if}
      {#if nav.currentPage === 'tjm' && premium.isPremium}
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
            <TJMPage
              onNavigateToProfile={() => nav.navigate('profile')}
              onNavigateToFeed={() => nav.navigate('feed')}
            />
            {#snippet failed(error, reset)}
              <div class="p-4">
                <OperationalEmptyState
                  title="La vue TJM ne peut pas être calculée"
                  description="L’analyse tarifaire est indisponible. Le feed reste utilisable pour qualifier les missions."
                  severity="incident"
                  statusLabel="Analyse interrompue"
                  icon="triangle-alert"
                  proofLabel="Ecran"
                  proofValue="TJM"
                  primaryActionLabel="Réessayer"
                  primaryActionIcon="refresh-cw"
                  onPrimaryAction={reset}
                />
              </div>
            {/snippet}
          </svelte:boundary>
        </div>
      {/if}
      {#if nav.currentPage === 'profile'}
        <div
          class="absolute inset-0 overflow-y-auto"
          in:fly={{ x: 30, duration: 200, easing: cubicOut }}
          out:fade={{ duration: 100 }}
        >
          <svelte:boundary
            onerror={(e) => {
              if (import.meta.env.DEV) console.error('[ProfilePage crash]', e);
            }}
          >
            <ProfilePage onNavigateToOnboarding={nav.resetToOnboarding} />
            {#snippet failed(error, reset)}
              <div class="p-4">
                <OperationalEmptyState
                  title="Le profil ne peut pas être affiché"
                  description="Le scoring peut continuer avec les derniers réglages connus. Réessayez avant de modifier votre calibration."
                  severity="incident"
                  statusLabel="Profil indisponible"
                  icon="triangle-alert"
                  proofLabel="Ecran"
                  proofValue="Profil"
                  primaryActionLabel="Réessayer"
                  primaryActionIcon="refresh-cw"
                  onPrimaryAction={reset}
                />
              </div>
            {/snippet}
          </svelte:boundary>
        </div>
      {/if}
      {#if nav.currentPage === 'cv' && premium.isPremium}
        <div
          class="absolute inset-0 overflow-y-auto"
          in:fly={{ x: 30, duration: 200, easing: cubicOut }}
          out:fade={{ duration: 100 }}
        >
          <svelte:boundary
            onerror={(e) => {
              if (import.meta.env.DEV) console.error('[CvPage crash]', e);
            }}
          >
            <CvPage onNavigateToProfile={() => nav.navigate('profile')} />
            {#snippet failed(error, reset)}
              <div class="p-4">
                <OperationalEmptyState
                  title="Le CV ne peut pas être préparé"
                  description="La génération de contenu est interrompue. Les missions et candidatures restent disponibles."
                  severity="incident"
                  statusLabel="Vue interrompue"
                  icon="triangle-alert"
                  proofLabel="Ecran"
                  proofValue="CV"
                  primaryActionLabel="Réessayer"
                  primaryActionIcon="refresh-cw"
                  onPrimaryAction={reset}
                />
              </div>
            {/snippet}
          </svelte:boundary>
        </div>
      {/if}
      {#if nav.currentPage === 'applications' && premium.isPremium}
        <div
          class="absolute inset-0 overflow-y-auto"
          in:fly={{ x: 30, duration: 200, easing: cubicOut }}
          out:fade={{ duration: 100 }}
        >
          <svelte:boundary
            onerror={(e) => {
              if (import.meta.env.DEV) console.error('[ApplicationsPage crash]', e);
            }}
          >
            <ApplicationsPage onNavigateToFeed={() => nav.navigate('feed')} />
            {#snippet failed(error, reset)}
              <div class="p-4">
                <OperationalEmptyState
                  title="Le pipeline candidatures est indisponible"
                  description="Le suivi ne peut pas être rendu maintenant. Réessayez avant de modifier vos statuts de candidature."
                  severity="incident"
                  statusLabel="Pipeline interrompu"
                  icon="triangle-alert"
                  proofLabel="Ecran"
                  proofValue="Candidatures"
                  primaryActionLabel="Réessayer"
                  primaryActionIcon="refresh-cw"
                  onPrimaryAction={reset}
                />
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
              <div class="p-4">
                <OperationalEmptyState
                  title="Les paramètres ne peuvent pas être affichés"
                  description="La configuration reste conservée. Réessayez avant de restaurer ou modifier les préférences."
                  severity="incident"
                  statusLabel="Réglages indisponibles"
                  icon="triangle-alert"
                  proofLabel="Ecran"
                  proofValue="Paramètres"
                  primaryActionLabel="Réessayer"
                  primaryActionIcon="refresh-cw"
                  onPrimaryAction={reset}
                />
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

  {#if import.meta.env.DEV && MetricsPanel}
    <MetricsPanel />
  {/if}
</div>
