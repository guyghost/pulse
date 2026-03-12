<script lang="ts">
  import type { ConnectorStatus } from '$lib/core/types/connector';
  import Indicator from '../atoms/Indicator.svelte';
  import Icon from '../atoms/Icon.svelte';

  let { name, status, lastSync, icon = 'briefcase' }: {
    name: string;
    status: ConnectorStatus;
    lastSync: Date | null;
    icon?: string;
  } = $props();

  let indicatorStatus = $derived(
    status === 'done' || status === 'authenticated' ? 'online' as const
    : status === 'error' || status === 'expired' ? 'error' as const
    : 'offline' as const
  );

  let statusLabel = $derived(
    status === 'detecting' ? 'D\u00e9tection...'
    : status === 'authenticated' ? 'Connect\u00e9'
    : status === 'expired' ? 'Session expir\u00e9e'
    : status === 'fetching' ? 'R\u00e9cup\u00e9ration...'
    : status === 'done' ? 'Synchronis\u00e9'
    : 'Erreur'
  );

  let relativeTime = $derived(() => {
    if (!lastSync) return 'Jamais';
    const diff = Date.now() - lastSync.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "\u00c0 l'instant";
    if (minutes < 60) return `Il y a ${minutes}min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Il y a ${hours}h`;
    return `Il y a ${Math.floor(hours / 24)}j`;
  });
</script>

<div class="flex items-center gap-3 rounded-[1.2rem] border border-white/8 bg-white/[0.04] px-3 py-3">
  <div class="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.04]">
    <Icon name={icon} size={16} class="text-text-secondary" />
  </div>
  <div class="flex-1 min-w-0">
    <p class="text-sm font-medium text-text-primary">{name}</p>
    <p class="text-[11px] text-text-secondary">{statusLabel}</p>
  </div>
  <div class="flex items-center gap-2">
    <span class="text-[10px] text-text-muted">{relativeTime()}</span>
    <Indicator status={indicatorStatus} />
  </div>
</div>
