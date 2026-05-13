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

<main class="min-h-screen">
  <aside
    class="fixed inset-y-0 left-0 hidden w-64 border-r border-border-light bg-surface-white/92 px-5 py-5 lg:block"
  >
    <a href="/" class="flex items-center gap-3" aria-label="MissionPulse Dashboard">
      <span
        class="flex h-9 w-9 items-center justify-center rounded-lg border border-border-light bg-page-canvas"
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
      <span class="text-sm font-semibold">MissionPulse</span>
    </a>

    <nav class="mt-10 space-y-1" aria-label="Navigation dashboard">
      <a
        class="flex h-9 items-center rounded-lg bg-blueprint-blue px-3 text-sm font-medium text-surface-white"
        href="/"
      >
        Vue d'ensemble
      </a>
      <a
        class="flex h-9 items-center rounded-lg px-3 text-sm text-text-subtle hover:bg-page-canvas"
        href="#applications"
      >
        Candidatures
      </a>
      <a
        class="flex h-9 items-center rounded-lg px-3 text-sm text-text-subtle hover:bg-page-canvas"
        href="#cv"
      >
        CV
      </a>
      <a
        class="flex h-9 items-center rounded-lg px-3 text-sm text-text-subtle hover:bg-page-canvas"
        href="#sync"
      >
        Synchronisation
      </a>
    </nav>
  </aside>

  <section class="lg:pl-64">
    <header
      class="sticky top-0 z-10 border-b border-border-light bg-page-canvas/92 px-4 py-4 backdrop-blur md:px-8"
    >
      <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p class="eyebrow text-text-subtle">Espace connecté</p>
          <h1 class="mt-1 text-2xl font-semibold tracking-normal text-text-primary">
            Pilotage candidatures
          </h1>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          {#if isConnected}
            <Badge label="Session active" variant="success" size="md" />
          {:else}
            <a href={data.loginUrl || '/login'}>
              <Button variant="secondary" size="sm">Se connecter</Button>
            </a>
          {/if}
          <Button size="sm">Mettre à jour le CV</Button>
        </div>
      </div>
    </header>

    <div class="mx-auto max-w-7xl px-4 py-6 md:px-8">
      {#if !isConnected}
        <section class="mb-6 rounded-lg border border-blueprint-blue/20 bg-blueprint-blue/8 p-4">
          <p class="text-sm font-medium text-text-primary">Mode aperçu</p>
          <p class="mt-1 max-w-3xl text-sm leading-6 text-text-subtle">
            Les données ci-dessous illustrent le futur dashboard connecté. La session Supabase sera
            utilisée comme source d'identité dès que le déploiement microfrontend sera branché au
            domaine final.
          </p>
        </section>
      {/if}

      <section
        class="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
        aria-label="Indicateurs candidatures"
      >
        <div class="rounded-lg border border-border-light bg-surface-white p-4">
          <p class="text-xs font-medium uppercase text-text-subtle">Total</p>
          <p class="mt-3 text-3xl font-semibold">{applications.length}</p>
        </div>
        <div class="rounded-lg border border-border-light bg-surface-white p-4">
          <p class="text-xs font-medium uppercase text-text-subtle">Postulées</p>
          <p class="mt-3 text-3xl font-semibold">
            {counts.applied + counts.interview + counts.offer}
          </p>
        </div>
        <div class="rounded-lg border border-border-light bg-surface-white p-4">
          <p class="text-xs font-medium uppercase text-text-subtle">Entretiens</p>
          <p class="mt-3 text-3xl font-semibold">{counts.interview}</p>
        </div>
        <div class="rounded-lg border border-border-light bg-surface-white p-4">
          <p class="text-xs font-medium uppercase text-text-subtle">CV prêt</p>
          <p class="mt-3 text-3xl font-semibold">{cv.completeness}%</p>
        </div>
      </section>

      <div class="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section id="applications" class="rounded-lg border border-border-light bg-surface-white">
          <div
            class="flex flex-col gap-3 border-b border-border-light p-4 md:flex-row md:items-center md:justify-between"
          >
            <div>
              <h2 class="text-lg font-semibold">Candidatures suivies</h2>
              <p class="mt-1 text-sm text-text-subtle">
                Pipeline des missions où l'utilisateur a postulé ou prépare une candidature.
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <Chip label="Toutes" selected size="sm" />
              <Chip label="À relancer" size="sm" />
              <Chip label="Entretien" size="sm" />
            </div>
          </div>

          <div class="divide-y divide-border-light">
            {#each applications as application}
              <article class="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_160px]">
                <div>
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="text-base font-semibold">{application.title}</h3>
                    <Badge label={sourceLabels[application.source]} variant="source" />
                    <Badge
                      label={`${application.score}%`}
                      variant={application.score >= 85 ? 'success' : 'warning'}
                    />
                  </div>
                  <p class="mt-1 text-sm text-text-subtle">
                    {application.company} · {application.location}
                  </p>
                  <div class="mt-3 flex flex-wrap gap-2 text-xs text-text-subtle">
                    <span class="rounded-md bg-page-canvas px-2 py-1"
                      >TJM {application.dailyRate
                        ? `${application.dailyRate}€`
                        : 'non précisé'}</span
                    >
                    <span class="rounded-md bg-page-canvas px-2 py-1"
                      >Postulé: {formatDate(application.appliedAt)}</span
                    >
                    <span class="rounded-md bg-page-canvas px-2 py-1"
                      >Relance: {formatDate(application.nextActionAt)}</span
                    >
                  </div>
                </div>
                <div class="flex items-start justify-between gap-3 md:flex-col md:items-end">
                  <Badge label={stageLabels[application.stage]} variant="status" size="md" />
                  <Button variant="ghost" size="sm">Ouvrir</Button>
                </div>
              </article>
            {/each}
          </div>
        </section>

        <div class="space-y-6">
          <section id="cv" class="rounded-lg border border-border-light bg-surface-white p-5">
            <div class="flex items-start justify-between gap-4">
              <div>
                <h2 class="text-lg font-semibold">CV principal</h2>
                <p class="mt-1 text-sm text-text-subtle">{cv.title}</p>
              </div>
              <Badge label={`${cv.completeness}%`} variant="success" size="md" />
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

          <section id="sync" class="rounded-lg border border-border-light bg-surface-white p-5">
            <h2 class="text-lg font-semibold">Synchronisation extension</h2>
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
  </section>
</main>
