<script lang="ts">
  import { Icon, type IconName } from '@pulse/ui';
  import ToastContainer from '../ui/organisms/ToastContainer.svelte';
  import OperationalEmptyState from '../ui/molecules/OperationalEmptyState.svelte';
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import type { LogEntry } from '../dev/bridge-logger';
  import type { ToastType } from '$lib/state/toast.svelte.ts';
  import {
    initToastService,
    showToast,
    stopToastService,
  } from '../lib/shell/notifications/toast-service';
  import { getConnectionStore } from '$lib/state/connection-singleton.svelte';
  import {
    createAppNavigation,
    NAV_ITEMS,
    type Page,
    type PageLoadSnapshot,
  } from '$lib/state/app-navigation.svelte';
  import { createThemeStore } from '$lib/state/theme.svelte';
  import { launchMarks, type PageId } from '$lib/shell/metrics/launch-marks';
  import { subscribeToNotificationClicked } from '$lib/shell/facades/feed-data.facade';

  type PageModules = {
    feed: typeof import('../ui/pages/FeedPage.svelte');
    profile: typeof import('../ui/pages/ProfilePage.svelte');
    cv: typeof import('../ui/pages/CvPage.svelte');
    applications: typeof import('../ui/pages/ApplicationsPage.svelte');
    tjm: typeof import('../ui/pages/TJMPage.svelte');
    settings: typeof import('../ui/pages/SettingsPage.svelte');
    onboarding: typeof import('../ui/pages/OnboardingPage.svelte');
  };
  type PageImporters = { [CurrentPage in Page]: () => Promise<PageModules[CurrentPage]> };
  type PageComponents = {
    [CurrentPage in Page]: PageModules[CurrentPage]['default'] | null;
  };

  const DEFAULT_PAGE_IMPORTERS: PageImporters = {
    feed: () => import('../ui/pages/FeedPage.svelte'),
    profile: () => import('../ui/pages/ProfilePage.svelte'),
    cv: () => import('../ui/pages/CvPage.svelte'),
    applications: () => import('../ui/pages/ApplicationsPage.svelte'),
    tjm: () => import('../ui/pages/TJMPage.svelte'),
    settings: () => import('../ui/pages/SettingsPage.svelte'),
    onboarding: () => import('../ui/pages/OnboardingPage.svelte'),
  };

  const {
    pageImporters: pageImporterOverrides = {},
  }: {
    pageImporters?: Partial<PageImporters>;
  } = $props();

  const pageImporters: PageImporters = $derived({
    ...DEFAULT_PAGE_IMPORTERS,
    ...pageImporterOverrides,
  });
  const nav = createAppNavigation();
  const theme = createThemeStore();

  let pageComponents = $state<PageComponents>({
    feed: null,
    profile: null,
    cv: null,
    applications: null,
    tjm: null,
    settings: null,
    onboarding: null,
  });
  const FeedPage = $derived(pageComponents.feed);
  const ProfilePage = $derived(pageComponents.profile);
  const CvPage = $derived(pageComponents.cv);
  const ApplicationsPage = $derived(pageComponents.applications);
  const TJMPage = $derived(pageComponents.tjm);
  const SettingsPage = $derived(pageComponents.settings);
  const OnboardingPage = $derived(pageComponents.onboarding);
  let pageLoads = $state<Partial<Record<Page, PageLoadSnapshot>>>({});
  let pageRequestSequence = 0;
  let shellMounted = true;
  const inFlightPageLoads = new Map<Page, { requestId: string; promise: Promise<void> }>();

  function hasPageComponent(page: Page): boolean {
    return pageComponents[page] !== null;
  }

  function assignPageComponent<CurrentPage extends Page>(
    page: CurrentPage,
    module: PageModules[CurrentPage]
  ): void {
    pageComponents[page] = module.default;
  }

  function setPageLoad(page: Page, snapshot: PageLoadSnapshot): void {
    pageLoads = { ...pageLoads, [page]: snapshot };
  }

  function isCurrentPageRequest(page: Page, requestId: string): boolean {
    return shellMounted && pageLoads[page]?.requestId === requestId;
  }

  function loadPage<CurrentPage extends Page>(page: CurrentPage, retry = false): void {
    if (!shellMounted || nav.bootStatus !== 'ready' || hasPageComponent(page)) {
      return;
    }

    const current = pageLoads[page];
    if (current?.status === 'loading' || (current?.status === 'error' && !retry)) {
      return;
    }
    if (retry && current?.status !== 'error') {
      return;
    }

    const requestId = `${page}:${(pageRequestSequence += 1)}`;
    const attempt = (current?.attempt ?? 0) + 1;
    setPageLoad(page, { status: 'loading', requestId, attempt, error: null });
    launchMarks.markImportStart(page as PageId);

    const promise = Promise.resolve()
      .then(() => pageImporters[page]())
      .then((module) => {
        if (!isCurrentPageRequest(page, requestId)) {
          return;
        }
        assignPageComponent(page, module);
        setPageLoad(page, { status: 'ready', requestId, attempt, error: null });
        launchMarks.markPageLoaded(page as PageId);
      })
      .catch((error: unknown) => {
        if (!isCurrentPageRequest(page, requestId)) {
          return;
        }
        setPageLoad(page, {
          status: 'error',
          requestId,
          attempt,
          error: error instanceof Error ? error.message : 'Page import failed.',
        });
      })
      .finally(() => {
        if (inFlightPageLoads.get(page)?.requestId === requestId) {
          inFlightPageLoads.delete(page);
        }
      });

    inFlightPageLoads.set(page, { requestId, promise });
  }

  function retryPage(page: Page): void {
    loadPage(page, true);
  }

  $effect(() => {
    return () => {
      shellMounted = false;
      pageRequestSequence += 1;
      inFlightPageLoads.clear();
      nav.dispose();
      stopToastService();
    };
  });

  const visibleNavItems = NAV_ITEMS;
  const currentPageLoad = $derived(pageLoads[nav.currentPage]);
  const currentPageLabel = $derived(
    NAV_ITEMS.find((item) => item.page === nav.currentPage)?.label ?? 'Onboarding'
  );

  function pageSurfaceClass(page: Page): string {
    const position = nav.pagePosition(page);

    if (position === 'current') {
      return 'translate-x-0 opacity-100 z-10';
    }

    return position === 'before'
      ? '-translate-x-full opacity-0 z-0'
      : 'translate-x-full opacity-0 z-0';
  }
  let initialPageLoadScheduled = false;

  $effect(() => {
    if (nav.bootStatus !== 'ready') {
      return;
    }

    const page = nav.currentPage;
    if (!initialPageLoadScheduled) {
      initialPageLoadScheduled = true;
      const frameId = requestAnimationFrame(() => {
        if (!shellMounted || nav.bootStatus !== 'ready' || nav.currentPage !== page) {
          return;
        }
        loadPage(page);
      });
      return () => cancelAnimationFrame(frameId);
    }

    loadPage(page);
  });

  $effect(() => {
    if (nav.bootStatus !== 'ready') {
      return;
    }

    const preloadTimer = window.setTimeout(() => {
      loadPage('profile');
      loadPage('settings');
    }, 80);
    return () => window.clearTimeout(preloadTimer);
  });

  $effect(() => {
    if (nav.bootStatus !== 'ready') {
      return;
    }

    const preloadTimer = window.setTimeout(() => {
      loadPage('cv');
      loadPage('applications');
      loadPage('tjm');
    }, 80);
    return () => window.clearTimeout(preloadTimer);
  });

  // Initialize theme on mount
  theme.init();
  const connection = getConnectionStore();
  let showOfflineBanner = $state(false);

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
    // Load DevPanel eagerly and signal readiness for E2E tests
    Promise.all([
      import('../dev/DevPanel.svelte').then((m) => {
        DevPanel = m.default;
      }),
      import('../ui/organisms/MetricsPanel.svelte').then((m) => {
        MetricsPanel = m.default;
      }),
    ]).then(() => {
      // Signal to E2E tests that DevPanel is ready
      (window as unknown as { __devPanelReady?: boolean }).__devPanelReady = true;
    });
  }

  function devInjectMissions(count: number) {
    if (!import.meta.env.DEV) {
      return;
    }
    import('../dev/mocks').then(({ generateMockMissions }) => {
      const missions = generateMockMissions(count);
      window.localStorage.setItem('__missionpulse_dev_missions', JSON.stringify(missions));
      window.dispatchEvent(new CustomEvent('dev:missions', { detail: missions }));
    });
  }

  function devSetState(state: 'empty' | 'loading' | 'loaded' | 'error') {
    const devStateStorageKey = '__missionpulse_dev_feed_state';
    if (state === 'empty') {
      window.localStorage.setItem('__missionpulse_dev_missions', JSON.stringify([]));
    }
    if (state === 'loaded') {
      window.localStorage.removeItem('__missionpulse_dev_missions');
      window.sessionStorage.removeItem(devStateStorageKey);
    } else {
      window.sessionStorage.setItem(devStateStorageKey, state);
    }
    const dispatchState = () => {
      window.dispatchEvent(new CustomEvent('dev:feed-state', { detail: state }));
    };
    dispatchState();
    window.requestAnimationFrame(dispatchState);
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
    const unsubscribe = subscribeToNotificationClicked(() => {
      nav.navigate('feed');
    });
    return unsubscribe;
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
        class="flex items-center justify-center gap-2 border-b border-border-light bg-status-red/8 px-4 py-2 text-meta text-status-red"
        transition:fade={{ duration: 200 }}
      >
        <Icon name="wifi-off" size={12} />
        <span>Mode hors ligne — Données en cache uniquement</span>
      </div>
    {/if}

    {#if nav.currentPage !== 'onboarding'}
      <div class="px-4 pb-4 pt-4">
        <nav
          aria-label="Main navigation"
          data-testid="expandable-navigation"
          class="flex min-h-10 w-full items-center gap-[clamp(0.25rem,1.5vw,0.5rem)]"
        >
          {#each visibleNavItems as item}
            <button
              class="relative flex h-10 min-w-0 items-center justify-center overflow-hidden rounded-full text-caption font-medium transition-[flex-basis,flex-grow,padding,gap,background-color,color,transform] duration-[180ms] ease-out active:scale-[0.985] motion-reduce:duration-0
              {nav.currentPage === item.page
                ? 'flex-1 basis-0 gap-2 bg-disabled-gray/45 px-3 text-text-primary'
                : 'w-[clamp(2.25rem,10vw,2.75rem)] basis-auto flex-none gap-0 bg-subtle-gray px-0 text-text-subtle hover:bg-disabled-gray/35 hover:text-text-primary'}"
              aria-current={nav.currentPage === item.page ? 'page' : undefined}
              aria-label={item.ariaLabel ?? item.label}
              title={item.label}
              onclick={() => nav.navigate(item.page)}
            >
              <span class="shrink-0 transition-transform duration-200 ease-out">
                <Icon name={item.icon as IconName} size={16} />
              </span>
              <span
                aria-hidden="true"
                class="min-w-0 overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-[180ms] ease-out motion-reduce:duration-0 {nav.currentPage ===
                item.page
                  ? 'max-w-36 translate-x-0 opacity-100'
                  : 'max-w-0 -translate-x-1 opacity-0'}">{item.label}</span
              >
            </button>
          {/each}
        </nav>
      </div>
    {/if}
    <main class="relative flex-1 overflow-hidden">
      {#if nav.bootStatus === 'error'}
        <div
          data-testid="bootstrap-error"
          class="absolute inset-0 z-20 overflow-y-auto bg-page-canvas p-4"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          <OperationalEmptyState
            title="L’application n’a pas pu démarrer"
            description="Les données locales nécessaires au démarrage sont momentanément indisponibles. Réessayez sans fermer l’extension."
            severity="incident"
            statusLabel="Démarrage interrompu"
            icon="triangle-alert"
            proofLabel="Etape"
            proofValue="Initialisation"
            primaryActionLabel="Réessayer"
            primaryActionIcon="refresh-cw"
            onPrimaryAction={() => void nav.retryBootstrap()}
          />
        </div>
      {/if}
      {#if nav.bootStatus === 'ready' && currentPageLoad?.status === 'error'}
        <div
          data-testid={`page-load-error-${nav.currentPage}`}
          class="absolute inset-0 z-20 overflow-y-auto bg-page-canvas p-4"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          <OperationalEmptyState
            title="Cette vue ne peut pas être chargée"
            description="Le module local de cette vue est indisponible. Le reste de l’extension demeure utilisable."
            severity="incident"
            statusLabel="Chargement interrompu"
            icon="triangle-alert"
            proofLabel="Ecran"
            proofValue={currentPageLabel}
            primaryActionLabel="Réessayer"
            primaryActionIcon="refresh-cw"
            onPrimaryAction={() => retryPage(nav.currentPage)}
          />
        </div>
      {/if}
      <div
        data-testid="page-feed"
        class="absolute inset-0 overflow-hidden transition-[transform,opacity] duration-[220ms] ease-out motion-reduce:duration-0 {pageSurfaceClass(
          'feed'
        )}"
        aria-hidden={nav.currentPage !== 'feed'}
        inert={nav.currentPage !== 'feed'}
      >
        <svelte:boundary
          onerror={(e) => {
            if (import.meta.env.DEV) console.error('[FeedPage crash]', e);
          }}
        >
          {#if FeedPage}
            <FeedPage
              onNavigateToOnboarding={nav.resetToOnboarding}
              onNavigateToProfile={() => nav.navigate('profile')}
              active={nav.currentPage === 'feed'}
            />
          {:else}
            <div
              data-testid="feed-scroll-container"
              class="relative h-full overflow-y-auto px-4 pt-4"
            >
              <section class="section-card-strong rounded-2xl p-5">
                <p class="eyebrow text-blueprint-blue">MissionPulse</p>
                <div class="mt-4 h-12 w-3/4 rounded-xl bg-subtle-gray"></div>
                <div class="mt-6 h-10 rounded-xl border border-border-light bg-surface-white"></div>
                <div class="mt-4 grid grid-cols-3 gap-3">
                  <div class="h-16 rounded-xl bg-page-canvas"></div>
                  <div class="h-16 rounded-xl bg-page-canvas"></div>
                  <div class="h-16 rounded-xl bg-page-canvas"></div>
                </div>
              </section>
            </div>
          {/if}
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
          data-testid="page-onboarding"
          class="absolute inset-0 overflow-y-auto"
          in:fly={{ x: 30, duration: 200, easing: cubicOut }}
          out:fade={{ duration: 100 }}
        >
          <svelte:boundary
            onerror={(e) => {
              if (import.meta.env.DEV) console.error('[OnboardingPage crash]', e);
            }}
          >
            {#if OnboardingPage}
              <OnboardingPage onComplete={nav.completeOnboarding} onSkip={nav.completeOnboarding} />
            {:else}
              <div class="relative flex h-full flex-col px-4 py-6">
                <div class="section-card-strong relative my-auto w-full rounded-2xl p-5">
                  <p class="eyebrow text-blueprint-blue/80">MissionPulse</p>
                  <h1 class="mt-3 text-heading-lg font-semibold leading-tight text-text-primary">
                    Configurez votre premier scan
                  </h1>
                  <div class="mt-6 grid grid-cols-3 gap-2">
                    <div class="h-16 rounded-lg border border-border-light bg-surface-white"></div>
                    <div class="h-16 rounded-lg border border-border-light bg-surface-white"></div>
                    <div class="h-16 rounded-lg border border-border-light bg-surface-white"></div>
                  </div>
                  <div
                    class="mt-5 h-28 rounded-xl border border-border-light bg-surface-white"
                  ></div>
                </div>
              </div>
            {/if}
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
      {#if TJMPage}
        <div
          data-testid="page-tjm"
          class="absolute inset-0 overflow-y-auto transition-[transform,opacity] duration-[220ms] ease-out motion-reduce:duration-0 {pageSurfaceClass(
            'tjm'
          )}"
          aria-hidden={nav.currentPage !== 'tjm'}
          inert={nav.currentPage !== 'tjm'}
        >
          <svelte:boundary
            onerror={(e) => {
              if (import.meta.env.DEV) console.error('[TJMPage crash]', e);
            }}
          >
            <TJMPage
              active={nav.currentPage === 'tjm'}
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
      {#if ProfilePage}
        <div
          data-testid="page-profile"
          class="absolute inset-0 overflow-y-auto transition-[transform,opacity] duration-[220ms] ease-out motion-reduce:duration-0 {pageSurfaceClass(
            'profile'
          )}"
          aria-hidden={nav.currentPage !== 'profile'}
          inert={nav.currentPage !== 'profile'}
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
      {#if CvPage}
        <div
          data-testid="page-cv"
          class="absolute inset-0 overflow-y-auto transition-[transform,opacity] duration-[220ms] ease-out motion-reduce:duration-0 {pageSurfaceClass(
            'cv'
          )}"
          aria-hidden={nav.currentPage !== 'cv'}
          inert={nav.currentPage !== 'cv'}
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
      {#if ApplicationsPage}
        <div
          data-testid="page-applications"
          class="absolute inset-0 overflow-y-auto transition-[transform,opacity] duration-[220ms] ease-out motion-reduce:duration-0 {pageSurfaceClass(
            'applications'
          )}"
          aria-hidden={nav.currentPage !== 'applications'}
          inert={nav.currentPage !== 'applications'}
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
      {#if SettingsPage}
        <div
          data-testid="page-settings"
          class="absolute inset-0 overflow-y-auto transition-[transform,opacity] duration-[220ms] ease-out motion-reduce:duration-0 {pageSurfaceClass(
            'settings'
          )}"
          aria-hidden={nav.currentPage !== 'settings'}
          inert={nav.currentPage !== 'settings'}
        >
          <svelte:boundary
            onerror={(e) => {
              if (import.meta.env.DEV) console.error('[SettingsPage crash]', e);
            }}
          >
            <SettingsPage
              onBack={() => nav.navigate('feed')}
              onNavigateToOnboarding={nav.resetToOnboarding}
              active={nav.currentPage === 'settings'}
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
