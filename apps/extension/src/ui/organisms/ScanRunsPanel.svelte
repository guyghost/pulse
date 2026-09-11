<script lang="ts">
  import { Icon } from '@pulse/ui';
  import type { ScanRunItem as ScanRunItemType } from '$lib/core/scan/scan-runs-presentation';
  import ScanRunItem from '../molecules/ScanRunItem.svelte';

  const { items = [] }: { items?: ScanRunItemType[] } = $props();
</script>

{#if items.length > 0}
  <section
    class="mt-4 rounded-xl border border-border-light bg-surface-white px-3.5 py-3"
    aria-label="Scans de la semaine"
  >
    <div class="flex items-center gap-2.5">
      <span
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-subtle-gray text-text-secondary"
      >
        <Icon name="arrow-right" size={16} />
      </span>
      <div class="min-w-0">
        <p class="text-meta font-semibold leading-tight text-text-primary">Scans de la semaine</p>
        <p class="mt-0.5 text-caption leading-snug text-text-secondary">
          Semaine en cours · <span class="font-mono tabular-nums">{items.length}</span>
          run{items.length > 1 ? 's' : ''}
        </p>
      </div>
    </div>

    <ul class="mt-2.5 space-y-2.5">
      {#each items as item (item.connectorId)}
        <li>
          <ScanRunItem {item} />
        </li>
      {/each}
    </ul>
  </section>
{/if}
