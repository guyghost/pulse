<script lang="ts">
  import { Icon } from '@pulse/ui';
  import type { ScanRunItem as ScanRunItemType } from '$lib/core/scan/scan-runs-presentation';

  const { item }: { item: ScanRunItemType } = $props();

  const SEGMENT_COUNT = 6;

  // Projection de présentation uniquement (modèle : scan-runs-week.model.md).
  const filledSegments = $derived(Math.round(item.progress * SEGMENT_COUNT));

  const stateLabel = $derived.by(() => {
    switch (item.state) {
      case 'done':
        return 'Terminé';
      case 'detecting':
        return 'Détection';
      case 'fetching':
        return 'Collecte';
      case 'retrying':
        return 'Nouvel essai';
      case 'pending':
        return 'En attente';
      case 'error':
        return 'À revoir';
    }
  });

  function formatRunTime(runAt: number): string {
    const date = new Date(runAt);
    const day = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' })
      .format(date)
      .replace('.', '');
    const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(
      date
    );
    return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${time}`;
  }

  const timeLabel = $derived(item.state === 'error' ? stateLabel : formatRunTime(item.runAt));
</script>

<div class="flex items-center gap-2.5" title="{item.name} — {stateLabel}">
  <span class="flex h-6 w-6 shrink-0 items-center justify-center">
    {#if item.state === 'done'}
      <span
        class="flex h-6 w-6 items-center justify-center rounded-lg bg-blueprint-blue/10 text-blueprint-blue"
      >
        <Icon name="check" size={12} />
      </span>
    {:else if item.state === 'retrying'}
      <span class="animate-spin text-blueprint-blue">
        <Icon name="loader" size={14} />
      </span>
    {:else if item.state === 'error'}
      <span
        class="flex h-6 w-6 items-center justify-center rounded-lg bg-subtle-gray text-text-muted"
      >
        <Icon name="clock" size={12} />
      </span>
    {:else}
      <span class="h-4 w-4 rounded-full border-2 border-dashed border-disabled-gray"></span>
    {/if}
  </span>

  <span class="min-w-0 flex-1">
    <span class="block truncate text-caption font-medium text-text-primary">{item.name}</span>
    <span class="block text-micro leading-snug text-text-muted">{timeLabel}</span>
  </span>

  <span class="shrink-0 font-mono tabular-nums text-caption text-text-secondary">
    {item.missionsCount}
  </span>
  <span class="sr-only">{stateLabel}</span>
</div>

<div class="mt-1.5 flex gap-1 pl-8.5" aria-hidden="true">
  {#each Array.from({ length: SEGMENT_COUNT }) as _, index (index)}
    <span
      class="h-1 flex-1 rounded-full {index < filledSegments
        ? 'bg-blueprint-blue'
        : 'bg-subtle-gray'}"
    ></span>
  {/each}
</div>
