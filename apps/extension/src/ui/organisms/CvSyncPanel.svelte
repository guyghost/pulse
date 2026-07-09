<script lang="ts">
  import { slide } from 'svelte/transition';
  import { Button, Icon, type IconName } from '@pulse/ui';
  import type { CvExperienceStore, PlatformSyncStatus } from '$lib/state/cv-experience.svelte';
  import type { PlatformSyncTarget } from '$lib/core/cv/experience-helpers';

  const {
    store,
    platforms,
  }: {
    store: CvExperienceStore;
    platforms: PlatformSyncTarget[];
  } = $props();

  const isRunning = $derived(store.syncStatus === 'preparing' || store.syncStatus === 'syncing');
  const doneCount = $derived(countByStatus(store.platformStatuses, 'done'));

  function countByStatus(map: Map<string, PlatformSyncStatus>, status: PlatformSyncStatus): number {
    let n = 0;
    for (const v of map.values()) {
      if (v === status) {
        n += 1;
      }
    }
    return n;
  }

  function statusMeta(status: PlatformSyncStatus | undefined): {
    icon: IconName | null;
    label: string;
    class: string;
    spin?: boolean;
  } {
    switch (status) {
      case 'done':
        return { icon: 'check-circle', label: 'Synchronisé', class: 'text-accent-green' };
      case 'copying':
        return { icon: 'loader-2', label: 'Copie…', class: 'text-blueprint-blue', spin: true };
      case 'error':
        return { icon: 'x-circle', label: 'Échec', class: 'text-status-red' };
      case 'skipped':
        return { icon: 'circle-alert', label: 'Ignoré', class: 'text-text-muted' };
      default:
        return { icon: null, label: 'En attente', class: 'text-text-muted' };
    }
  }

  const headline = $derived.by(() => {
    switch (store.syncStatus) {
      case 'synced':
        return 'CV synchronisé sur toutes les plateformes.';
      case 'partial':
        return `Synchronisé sur ${doneCount}/${platforms.length} plateformes.`;
      case 'error':
        return store.error ?? 'La synchronisation a échoué.';
      case 'cancelled':
        return 'Synchronisation annulée.';
      default:
        return null;
    }
  });
</script>

<div class="section-card-strong rounded-xl p-4">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="min-w-0">
      <h2 class="text-sm font-semibold text-text-primary">Synchronisation du CV</h2>
      <p class="mt-0.5 text-[11px] leading-relaxed text-text-secondary">
        Copie le bloc CV dans le presse-papiers puis ouvre chaque plateforme pour collage manuel.
      </p>
    </div>
    {#if isRunning}
      <Button variant="secondary" size="sm" onclick={() => store.cancelSync()}>
        <Icon name="x-circle" size={14} />
        Annuler
      </Button>
    {:else}
      <Button
        variant="primary"
        size="sm"
        onclick={() => store.startSync()}
        disabled={!store.canSync}
        loading={store.syncStatus === 'preparing'}
      >
        <Icon name="refresh-cw" size={14} />
        Synchroniser
      </Button>
    {/if}
  </div>

  {#if headline}
    <div
      class="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] leading-relaxed
        {store.syncStatus === 'synced'
        ? 'bg-accent-green/10 text-text-primary'
        : store.syncStatus === 'partial'
          ? 'bg-status-yellow/12 text-text-primary'
          : store.syncStatus === 'error'
            ? 'bg-status-red/10 text-text-primary'
            : 'bg-subtle-gray text-text-secondary'}"
    >
      <Icon
        name={store.syncStatus === 'synced'
          ? 'check-circle'
          : store.syncStatus === 'error'
            ? 'triangle-alert'
            : 'circle-alert'}
        size={13}
      />
      <span>{headline}</span>
    </div>
  {/if}

  {#if isRunning || (store.platformStatuses.size > 0 && store.syncStatus !== 'idle')}
    <ul transition:slide={{ duration: 180 }} class="mt-3 space-y-1.5">
      {#each platforms as platform (platform.id)}
        {@const meta = statusMeta(store.platformStatuses.get(platform.id))}
        <li class="flex items-center justify-between gap-2 rounded-md px-2 py-1.5">
          <span class="truncate text-xs text-text-secondary">{platform.name}</span>
          <span class="inline-flex shrink-0 items-center gap-1 text-[11px] {meta.class}">
            {#if meta.icon}
              <Icon name={meta.icon} size={12} class={meta.spin ? 'animate-spin' : ''} />
            {:else}
              <span class="h-1.5 w-1.5 rounded-full bg-text-muted/60"></span>
            {/if}
            {meta.label}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</div>
