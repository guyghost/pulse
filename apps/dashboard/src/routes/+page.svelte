<script lang="ts">
  import { Badge, Button, Chip } from '@pulse/ui';
  import { countApplicationsByStage, getCvSyncReadiness } from '$lib/core/dashboard';
  import type {
    ApplicationStage,
    MissionApplication,
    PlatformSyncStatus,
  } from '$lib/core/dashboard';

  let { data } = $props();

  const applications = $derived(data.applications as MissionApplication[]);
  const cv = $derived(data.cv);
  const syncStatuses = $derived(data.syncStatuses as PlatformSyncStatus[]);
  const counts = $derived(countApplicationsByStage(applications));
  const readiness = $derived(getCvSyncReadiness(cv, syncStatuses));
  const isConnected = $derived(Boolean(data.session));
  const averageScore = $derived(
    Math.round(
      applications.reduce((total, application) => total + application.score, 0) /
        Math.max(applications.length, 1)
    )
  );
  const nextFollowUp = $derived(
    applications.find((application) => application.nextActionAt)?.nextActionAt ?? null
  );
  const sourceFilters = ['Toutes', 'LinkedIn', 'Free-Work', 'Malt'];

  const stageLabels: Record<ApplicationStage, string> = {
    draft: 'Brouillon',
    applied: 'Postulé',
    interview: 'Entretien',
    offer: 'Offre',
    rejected: 'Refusé',
  };

  const statusLabels: Record<PlatformSyncStatus['status'], string> = {
    ready: 'Prêt',
    'needs-extension': 'Extension requise',
    'needs-session': 'Session requise',
    syncing: 'Synchronisation',
  };

  const sourceLabels: Record<MissionApplication['source'], string> = {
    linkedin: 'LinkedIn',
    freework: 'Free-Work',
    malt: 'Malt',
    other: 'Autre',
  };

  const formatDate = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat('fr-FR', {
          day: '2-digit',
          month: 'short',
        }).format(new Date(value))
      : 'Aucune';
</script>

<svelte:head>
  <title>Dashboard — MissionPulse</title>
  <meta
    name="description"
    content="Suivez vos candidatures, maintenez votre CV et préparez la synchronisation avec l'extension MissionPulse."
  />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="min-h-screen bg-page-canvas">
  <aside
    class="fixed inset-y-0 left-0 hidden w-64 border-r border-border-light bg-surface-white px-4 py-4 lg:block"
  >
    <a href="/" class="flex h-11 items-center gap-3" aria-label="MissionPulse Dashboard">
      <span
        class="flex h-9 w-9 items-center justify-center rounded-lg border border-border-light bg-page-canvas text-text-primary"
      >
        <svg viewBox="0 0 128 128" class="h-6 w-6" aria-hidden="true">
          <polyline
            points="18,64 38,64 46,44 54,84 64,38 74,78 82,52 90,64 110,64"
            fill="none"
            stroke="currentColor"
            stroke-width="8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
      <span class="text-sm font-semibold tracking-normal">MissionPulse</span>
    </a>

    <div class="mt-5 rounded-lg border border-border-light bg-page-canvas px-3 py-2">
      <p class="text-[11px] font-medium uppercase text-text-muted">Workspace</p>
      <p class="mt-1 truncate text-sm font-medium text-text-primary">Freelance cockpit</p>
    </div>

    <nav class="mt-6 space-y-1" aria-label="Navigation dashboard">
      <a
        class="flex h-9 items-center justify-between rounded-lg bg-text-primary px-3 text-sm font-medium text-surface-white"
        href="/"
      >
        <span>Vue d'ensemble</span>
        <span class="h-1.5 w-1.5 rounded-full bg-surface-white"></span>
      </a>
      <a
        class="flex h-9 items-center rounded-lg px-3 text-sm text-text-subtle hover:bg-page-canvas hover:text-text-primary"
        href="#applications"
      >
        Candidatures
      </a>
      <a
        class="flex h-9 items-center rounded-lg px-3 text-sm text-text-subtle hover:bg-page-canvas hover:text-text-primary"
        href="#cv"
      >
        Profil CV
      </a>
      <a
        class="flex h-9 items-center rounded-lg px-3 text-sm text-text-subtle hover:bg-page-canvas hover:text-text-primary"
        href="#sync"
      >
        Synchronisation
      </a>
    </nav>

    <div class="absolute inset-x-4 bottom-4">
      <div class="rounded-lg border border-border-light bg-page-canvas p-3">
        <div class="flex items-center justify-between">
          <p class="text-xs font-medium text-text-primary">Extension Chrome</p>
          <span class="h-2 w-2 rounded-full bg-accent-green"></span>
        </div>
        <p class="mt-2 text-xs leading-5 text-text-subtle">
          Les mises à jour CV seront exécutées depuis les sessions navigateur existantes.
        </p>
      </div>
    </div>
  </aside>

  <section class="lg:pl-64">
    <header
      class="sticky top-0 z-20 border-b border-border-light bg-surface-white/88 px-4 py-3 backdrop-blur md:px-8"
    >
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div class="flex items-center gap-2 text-sm">
          <span class="text-text-subtle">Dashboard</span>
          <span class="text-text-muted">/</span>
          <span class="font-medium text-text-primary">Candidatures</span>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          {#if isConnected}
            <Badge label="Session active" variant="success" size="md" />
          {:else}
            <a
              class="inline-flex h-8 items-center rounded-lg border border-border-light bg-surface-white px-3 text-xs font-medium text-text-primary hover:bg-page-canvas"
              href={data.loginUrl || '/login'}
            >
              Se connecter
            </a>
          {/if}
          <button
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-light bg-surface-white text-text-subtle hover:bg-page-canvas hover:text-text-primary"
            aria-label="Ouvrir les fichiers"
          >
            <svg
              viewBox="0 0 24 24"
              class="h-4 w-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
            </svg>
          </button>
          <button
            class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border-light bg-surface-white text-text-subtle hover:bg-page-canvas hover:text-text-primary"
            aria-label="Compte"
          >
            <svg
              viewBox="0 0 24 24"
              class="h-4 w-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c1.8-4 4.5-6 8-6s6.2 2 8 6" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <div class="mx-auto max-w-[1220px] px-4 pb-28 pt-8 md:px-8">
      <section class="mb-7">
        <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="text-3xl font-semibold tracking-normal text-text-primary md:text-4xl">
                Pilotage missions
              </h1>
              <span
                class="rounded-full bg-subtle-gray px-2 py-1 text-xs font-medium text-text-subtle"
              >
                Beta
              </span>
            </div>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-text-subtle">
              Suivez les candidatures actives, gardez un CV prêt à publier et préparez les
              synchronisations via l'extension.
            </p>
          </div>
          <Button size="sm">Mettre à jour le CV</Button>
        </div>

        <div class="mt-6 flex border-b border-border-light">
          <a
            class="-mb-px border-b-2 border-text-primary px-3 py-2 text-sm font-medium text-text-primary"
            href="#applications"
          >
            Explore
          </a>
          <a class="px-3 py-2 text-sm text-text-subtle hover:text-text-primary" href="#sync"
            >Synchronisations</a
          >
          <a class="px-3 py-2 text-sm text-text-subtle hover:text-text-primary" href="#cv">CV</a>
        </div>
      </section>

      {#if !isConnected}
        <section
          class="mb-6 rounded-lg border border-blueprint-blue/20 bg-blueprint-blue/8 p-4 shadow-subtle-2"
        >
          <p class="text-sm font-medium text-text-primary">Mode aperçu</p>
          <p class="mt-1 max-w-3xl text-sm leading-6 text-text-subtle">
            Les données ci-dessous illustrent le futur dashboard connecté. La session Supabase sera
            utilisée comme source d'identité dès que le déploiement microfrontend sera branché au
            domaine final.
          </p>
        </section>
      {/if}

      <section
        class="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
        aria-label="Indicateurs candidatures"
      >
        <div class="rounded-lg border border-border-light bg-surface-white p-4 shadow-subtle-2">
          <p class="text-xs font-medium uppercase text-text-subtle">Candidatures</p>
          <div class="mt-3 flex items-end justify-between">
            <p class="text-3xl font-semibold">{applications.length}</p>
            <Badge label="+2 cette semaine" variant="success" />
          </div>
        </div>
        <div class="rounded-lg border border-border-light bg-surface-white p-4 shadow-subtle-2">
          <p class="text-xs font-medium uppercase text-text-subtle">Taux moyen</p>
          <div class="mt-3 flex items-end justify-between">
            <p class="text-3xl font-semibold">{averageScore}%</p>
            <Badge label="Score IA" variant="status" />
          </div>
        </div>
        <div class="rounded-lg border border-border-light bg-surface-white p-4 shadow-subtle-2">
          <p class="text-xs font-medium uppercase text-text-subtle">Entretiens</p>
          <div class="mt-3 flex items-end justify-between">
            <p class="text-3xl font-semibold">{counts.interview}</p>
            <Badge label="Prioritaire" variant="warning" />
          </div>
        </div>
        <div class="rounded-lg border border-border-light bg-surface-white p-4 shadow-subtle-2">
          <p class="text-xs font-medium uppercase text-text-subtle">Prochaine relance</p>
          <div class="mt-3 flex items-end justify-between">
            <p class="text-3xl font-semibold">{formatDate(nextFollowUp)}</p>
            <Badge label="À traiter" variant="source" />
          </div>
        </div>
      </section>

      <div class="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section id="applications">
          <div class="rounded-xl border border-border-light bg-surface-white p-3 shadow-sm">
            <label
              class="flex h-11 items-center gap-3 rounded-lg border border-border-light bg-page-canvas px-3 text-sm text-text-subtle"
            >
              <svg
                viewBox="0 0 24 24"
                class="h-4 w-4"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                class="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                placeholder="Rechercher mission, client ou plateforme"
                type="search"
              />
            </label>

            <div class="mt-3 flex flex-wrap gap-2">
              {#each sourceFilters as filter, index}
                <Chip label={filter} selected={index === 0} size="sm" />
              {/each}
            </div>
          </div>

          <div class="mt-4 grid auto-rows-[96px] gap-4 md:grid-cols-2">
            {#each applications as application}
              <article
                class="group flex min-h-0 flex-col justify-between rounded-xl border border-border-light bg-surface-white p-4 shadow-subtle-2 transition duration-200 hover:-translate-y-0.5 hover:shadow-sm {application.stage ===
                'interview'
                  ? 'row-span-3'
                  : 'row-span-2'}"
              >
                <div>
                  <div class="flex items-start justify-between gap-3">
                    <Badge label={sourceLabels[application.source]} variant="source" />
                    <Badge
                      label={`${application.score}%`}
                      variant={application.score >= 85 ? 'success' : 'warning'}
                    />
                  </div>
                  <h2 class="mt-4 text-lg font-semibold leading-tight text-text-primary">
                    {application.title}
                  </h2>
                  <p class="mt-2 text-sm text-text-subtle">
                    {application.company} · {application.location}
                  </p>
                </div>

                <div>
                  <div class="mb-4 grid grid-cols-2 gap-2 text-xs text-text-subtle">
                    <div class="rounded-lg bg-page-canvas px-3 py-2">
                      <p class="text-text-muted">TJM</p>
                      <p class="mt-1 font-medium text-text-primary">
                        {application.dailyRate ? `${application.dailyRate}€` : 'N/A'}
                      </p>
                    </div>
                    <div class="rounded-lg bg-page-canvas px-3 py-2">
                      <p class="text-text-muted">Relance</p>
                      <p class="mt-1 font-medium text-text-primary">
                        {formatDate(application.nextActionAt)}
                      </p>
                    </div>
                  </div>
                  <div class="flex items-center justify-between border-t border-border-light pt-3">
                    <Badge label={stageLabels[application.stage]} variant="status" size="md" />
                    <button class="text-sm font-medium text-text-primary hover:text-blueprint-blue">
                      Ouvrir
                    </button>
                  </div>
                </div>
              </article>
            {/each}

            <article
              class="row-span-2 flex flex-col justify-between rounded-xl border border-dashed border-blueprint-blue/35 bg-blueprint-blue/8 p-4"
            >
              <div>
                <p class="text-sm font-semibold text-text-primary">Nouvelle candidature</p>
                <p class="mt-2 text-sm leading-6 text-text-subtle">
                  Importez une mission repérée par l'extension ou préparez une candidature manuelle.
                </p>
              </div>
              <Button variant="secondary" size="sm">Ajouter</Button>
            </article>
          </div>
        </section>

        <div class="space-y-4">
          <section
            id="cv"
            class="rounded-xl border border-border-light bg-surface-white p-5 shadow-sm"
          >
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="eyebrow text-text-subtle">Profil candidat</p>
                <h2 class="mt-2 text-lg font-semibold">CV principal</h2>
                <p class="mt-1 text-sm text-text-subtle">{cv.title}</p>
              </div>
              <Badge label={`${cv.completeness}%`} variant="success" size="md" />
            </div>
            <div class="mt-5 rounded-xl border border-border-light bg-page-canvas p-4">
              <div class="space-y-2">
                <div class="h-3 w-2/3 rounded-full bg-text-primary"></div>
                <div class="h-2 w-full rounded-full bg-disabled-gray"></div>
                <div class="h-2 w-5/6 rounded-full bg-disabled-gray"></div>
                <div class="h-2 w-3/4 rounded-full bg-disabled-gray"></div>
              </div>
              <div class="mt-5 grid grid-cols-2 gap-2">
                <div class="h-16 rounded-lg bg-surface-white"></div>
                <div class="h-16 rounded-lg bg-surface-white"></div>
              </div>
            </div>
            <div class="mt-5 h-2 overflow-hidden rounded-full bg-subtle-gray">
              <div
                class="h-full rounded-full bg-blueprint-blue"
                style={`width: ${cv.completeness}%`}
              ></div>
            </div>
            <p class="mt-4 text-sm text-text-secondary">{cv.targetRole}</p>
            <div class="mt-4 flex flex-wrap gap-2">
              {#each cv.skills as skill}
                <Badge label={skill} variant="tech" />
              {/each}
            </div>
            <div class="mt-5 flex gap-2">
              <Button size="sm">Éditer</Button>
              <Button variant="secondary" size="sm">Importer PDF</Button>
            </div>
          </section>

          <section
            id="sync"
            class="rounded-xl border border-border-light bg-surface-white p-5 shadow-sm"
          >
            <p class="eyebrow text-text-subtle">Connecteurs</p>
            <h2 class="mt-2 text-lg font-semibold">Synchronisation extension</h2>
            <p class="mt-1 text-sm leading-6 text-text-subtle">
              {readiness.readyPlatforms}/{readiness.totalPlatforms} plateformes prêtes. Le dashboard prépare
              les actions, l'extension exécute la mise à jour dans les sessions navigateur existantes.
            </p>
            <div class="mt-5 space-y-3">
              {#each syncStatuses as platform}
                <div
                  class="flex items-center justify-between gap-4 rounded-lg border border-border-light bg-page-canvas px-3 py-3"
                >
                  <div>
                    <p class="text-sm font-medium">{platform.name}</p>
                    <p class="text-xs text-text-subtle">
                      Dernière synchro: {formatDate(platform.lastSyncAt)}
                    </p>
                  </div>
                  <Badge
                    label={statusLabels[platform.status]}
                    variant={platform.status === 'ready' ? 'success' : 'warning'}
                  />
                </div>
              {/each}
            </div>
            <Button class="mt-5 w-full" disabled={!readiness.canSync}>Synchroniser le CV</Button>
          </section>
        </div>
      </div>
    </div>

    <section
      class="fixed bottom-4 left-4 right-4 z-30 mx-auto max-w-2xl rounded-2xl border border-border-light bg-surface-white/95 p-3 shadow-xl backdrop-blur lg:left-72"
      aria-label="Préparation synchronisation CV"
    >
      <div class="flex flex-col gap-3 md:flex-row md:items-center">
        <div
          class="flex h-14 w-full items-center rounded-xl bg-page-canvas px-4 text-sm text-text-subtle"
        >
          Préparer une mise à jour CV pour LinkedIn, Free-Work et les plateformes prêtes...
        </div>
        <div class="flex items-center gap-2">
          <button
            class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border-light bg-surface-white text-text-subtle hover:bg-page-canvas"
            aria-label="Ajouter une référence CV"
          >
            <svg
              viewBox="0 0 24 24"
              class="h-4 w-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <button
            class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-text-primary text-surface-white disabled:opacity-40"
            aria-label="Lancer la synchronisation"
            disabled={!readiness.canSync}
          >
            <svg
              viewBox="0 0 24 24"
              class="h-4 w-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  </section>
</main>
