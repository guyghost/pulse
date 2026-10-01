<script lang="ts">
  import { untrack } from 'svelte';
  import { Icon } from '@pulse/ui';
  import PageHeader from '../molecules/PageHeader.svelte';
  import PageShell from '../templates/PageShell.svelte';
  import OfflineNotice from '../molecules/OfflineNotice.svelte';
  import TJMSampleDashboard from '../organisms/TJMSampleDashboard.svelte';
  import { createTJMPageState } from '$lib/state/tjm-page.svelte';
  import { getConnectionStore } from '$lib/state/connection-singleton.svelte';
  import { REGION_LABELS } from '$lib/core/tjm-history/normalize-region';
  import { MISSION_CATEGORIES } from '$lib/core/types/mission-classification';
  import type { TJMFilters, TJMPeriod } from '$lib/core/types/tjm';
  import { formatAbsoluteDate } from '$lib/core/utils/format';

  const {
    active = true,
    onNavigateToProfile,
    onNavigateToFeed,
  }: {
    active?: boolean;
    onNavigateToProfile?: () => void;
    onNavigateToFeed?: () => void;
  } = $props();
  const state = createTJMPageState();
  const connection = getConnectionStore();
  const periods: { value: TJMPeriod; label: string }[] = [
    { value: '7d', label: '7 jours' },
    { value: '30d', label: '30 jours' },
    { value: 'all', label: 'Tout' },
  ];
  const categoryLabels = {
    frontend: 'Frontend',
    backend: 'Backend',
    fullstack: 'Fullstack',
    mobile: 'Mobile',
    data: 'Data',
    devops: 'DevOps',
    product: 'Produit',
    design: 'Design',
    other: 'Autre métier',
    unknown: 'Métier non renseigné',
  };
  const seniorityLabels = {
    junior: 'Junior',
    confirmed: 'Confirmé',
    senior: 'Senior',
    unknown: 'Expérience non renseignée',
  };
  const remoteLabels = {
    full: 'Télétravail complet',
    hybrid: 'Hybride',
    onsite: 'Sur site',
    unknown: 'Mode non renseigné',
  };
  let wasActive = false;
  const stale = $derived(state.freshness.level === 'stale' || state.freshness.level === 'obsolete');
  const context = $derived(
    [
      periods.find((period) => period.value === state.filters.period)?.label,
      state.filters.region === 'unknown'
        ? 'Région non renseignée'
        : state.filters.region
          ? REGION_LABELS[state.filters.region]
          : 'Toutes les régions',
      state.filters.category ? categoryLabels[state.filters.category] : 'Tous les métiers',
      state.filters.seniority ? seniorityLabels[state.filters.seniority] : 'Toutes les expériences',
      state.filters.remote ? remoteLabels[state.filters.remote] : 'Tous les modes de travail',
    ].join(' · ')
  );
  function changeFilter(key: 'category' | 'seniority' | 'remote' | 'region', event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    state.setFilter(key, (value || undefined) as TJMFilters[typeof key]);
  }
  function periodKeydown(event: KeyboardEvent) {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const delta = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
    const index = periods.findIndex((period) => period.value === state.filters.period);
    const next = periods[(index + delta + periods.length) % periods.length];
    state.selectPeriod(next.value);
    (event.currentTarget as HTMLElement)
      .querySelector<HTMLButtonElement>(`[data-period-option="${next.value}"]`)
      ?.focus();
  }
  $effect(() => state.init());
  $effect(() => {
    if (!active) {
      wasActive = false;
      return;
    }
    if (!wasActive) {
      wasActive = true;
      untrack(() => state.activate());
    }
  });
</script>

<PageShell>
  <PageHeader
    eyebrow="Annonces collectées"
    title="Analyse TJM"
    icon="chart-column"
    badge="Local uniquement"
  >
    {#snippet actions()}
      <button
        type="button"
        class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-light bg-surface-white"
        aria-label="Rafraîchir l'analyse TJM"
        disabled={state.isLoading}
        onclick={() => state.refresh()}><Icon name="refresh-cw" size={13} /></button
      >
    {/snippet}
    <p class="mt-2 text-caption leading-5 text-text-muted">
      Médianes des TJM renseignés dans les annonces collectées localement.
    </p>
    <p class="mt-2 text-caption">
      Profil {state.profileCalibrated ? 'calibré' : 'à définir'}{#if state.userTjmMin > 0}
        · Votre plancher : {state.userTjmMin} €/j{/if}
    </p>
    <div class="mt-3 flex flex-wrap gap-2 text-caption">
      {#if onNavigateToProfile}<button
          type="button"
          class="rounded-lg border border-border-light px-3 py-2"
          onclick={onNavigateToProfile}>Ajuster mon TJM minimum</button
        >{/if}
      {#if onNavigateToFeed}<button
          type="button"
          class="rounded-lg border border-border-light px-3 py-2"
          onclick={onNavigateToFeed}>Scanner le feed</button
        >{/if}
    </div>
    <div
      class="mt-4 flex flex-wrap gap-2"
      role="radiogroup"
      aria-label="Période d'analyse"
      tabindex={-1}
      onkeydown={periodKeydown}
    >
      {#each periods as period (period.value)}
        <button
          type="button"
          role="radio"
          aria-checked={state.filters.period === period.value}
          tabindex={state.filters.period === period.value ? 0 : -1}
          data-period-option={period.value}
          onclick={() => state.selectPeriod(period.value)}
          class="rounded-md border px-3 py-2 text-caption {state.filters.period === period.value
            ? 'border-blueprint-blue bg-blueprint-blue/5 text-blueprint-blue'
            : 'border-border-light'}">{period.label}</button
        >
      {/each}
    </div>
    <div class="mt-3 grid grid-cols-1 gap-3 text-caption">
      <label for="tjm-region-filter"
        >Région
        <select
          id="tjm-region-filter"
          aria-label="Région"
          class="mt-1 block w-full min-w-0 rounded-lg border border-border-light bg-surface-white p-2"
          value={state.filters.region ?? ''}
          onchange={(event) => changeFilter('region', event)}
        >
          <option value="">Toutes les régions</option>
          {#each Object.entries(REGION_LABELS) as [value, label] (value)}<option {value}
              >{label}</option
            >{/each}
          <option value="unknown">Région non renseignée</option>
        </select>
      </label>
      <label for="tjm-category-filter"
        >Métier
        <select
          id="tjm-category-filter"
          aria-label="Métier"
          class="mt-1 block w-full min-w-0 rounded-lg border border-border-light bg-surface-white p-2"
          value={state.filters.category ?? ''}
          onchange={(event) => changeFilter('category', event)}
        >
          <option value="">Tous les métiers</option>
          {#each MISSION_CATEGORIES as category (category)}<option value={category}
              >{categoryLabels[category]}</option
            >{/each}
          <option value="unknown">Métier non renseigné</option>
        </select>
      </label>
      <label for="tjm-seniority-filter"
        >Expérience
        <select
          id="tjm-seniority-filter"
          aria-label="Expérience"
          class="mt-1 block w-full min-w-0 rounded-lg border border-border-light bg-surface-white p-2"
          value={state.filters.seniority ?? ''}
          onchange={(event) => changeFilter('seniority', event)}
        >
          <option value="">Toutes les expériences</option>
          {#each Object.entries(seniorityLabels) as [value, label] (value)}<option {value}
              >{label}</option
            >{/each}
        </select>
      </label>
      <label for="tjm-remote-filter"
        >Mode de travail
        <select
          id="tjm-remote-filter"
          aria-label="Mode de travail"
          class="mt-1 block w-full min-w-0 rounded-lg border border-border-light bg-surface-white p-2"
          value={state.filters.remote ?? ''}
          onchange={(event) => changeFilter('remote', event)}
        >
          <option value="">Tous les modes de travail</option>
          {#each Object.entries(remoteLabels) as [value, label] (value)}<option {value}
              >{label}</option
            >{/each}
        </select>
      </label>
    </div>
    {#snippet footer()}{#if connection.status === 'offline'}<OfflineNotice
          description="Analyse calculée sur les annonces locales."
        />{/if}{/snippet}
  </PageHeader>

  <section
    class="mb-4 rounded-xl border border-border-light bg-surface-white p-4 text-caption"
    aria-label="Contexte de l’analyse"
  >
    <p>{context}</p>
    <p class="mt-2 text-text-muted">
      Technologies du profil : {state.profileStacks.length
        ? state.profileStacks.join(', ')
        : 'toutes'}.
    </p>
    {#if state.analysis?.lastUpdated && !state.isLoading && !state.error}
      <p class="mt-2" class:text-status-orange-text={stale}>
        Dernière observation : {formatAbsoluteDate(Date.parse(state.analysis.lastUpdated), {
          style: 'medium',
        })} · {state.freshness.ageDays ?? '—'} jours{stale ? ' · Données anciennes' : ''}.
      </p>
    {/if}
  </section>
  {#if state.isLoading}
    <p role="status" class="p-4 text-caption">Chargement de l’échantillon…</p>
  {:else if state.error}
    <div role="alert" class="section-card rounded-xl p-4">
      <p>{state.error}</p>
      <button type="button" class="mt-3 rounded-lg border p-2" onclick={() => state.refresh()}
        >Réessayer</button
      >
    </div>
  {:else if state.analysis}
    <TJMSampleDashboard analysis={state.analysis} />
  {/if}
</PageShell>
