<script lang="ts">
  import type { ConnectorStatus as ConnectorStatusType } from '$lib/core/types/connector-status';
  import type { PersistedConnectorStatus } from '$lib/core/types/connector-status';
  import { Icon } from '@pulse/ui';

  const {
    name,
    icon = '',
    url = '',
    status = null,
    persisted = null,
  }: {
    name: string;
    icon?: string;
    url?: string;
    status?: ConnectorStatusType | null;
    persisted?: PersistedConnectorStatus | null;
  } = $props();

  let imgFailed = $state(false);

  // Renamed from 'state' to 'connectorState' to avoid conflict with $state rune
  const connectorState = $derived(status?.state ?? persisted?.lastState ?? 'pending');

  const missionsCount = $derived(status?.missionsCount ?? persisted?.missionsCount ?? 0);

  const retryCount = $derived(status?.retryCount ?? 0);

  const errorMessage = $derived.by(() => {
    if (status?.error?.message) {
      return status.error.message;
    }
    if (persisted?.error && typeof persisted.error === 'object' && 'message' in persisted.error) {
      return String(persisted.error.message);
    }
    return undefined;
  });

  const isSessionError = $derived(errorMessage ? /session|expir/i.test(errorMessage) : false);

  const relativeTime = $derived.by(() => {
    if (!persisted?.lastSyncAt) {
      return undefined;
    }
    const diff = Date.now() - persisted.lastSyncAt;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) {
      return 'il y a 0min';
    }
    if (minutes < 60) {
      return `il y a ${minutes}min`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `il y a ${hours}h`;
    }
    return `il y a ${Math.floor(hours / 24)}j`;
  });

  const stateConfig = $derived.by(() => {
    switch (connectorState) {
      case 'pending':
        return { icon: 'loader', color: 'text-text-muted', label: 'En attente', spin: false };
      case 'detecting':
        return { icon: 'loader', color: 'text-blueprint-blue', label: 'Detection...', spin: true };
      case 'fetching':
        return { icon: 'loader', color: 'text-blueprint-blue', label: 'Scraping...', spin: true };
      case 'retrying':
        return {
          icon: 'loader',
          color: 'text-blueprint-blue',
          label: `Retry ${retryCount}/3...`,
          spin: true,
        };
      case 'done':
        return {
          icon: 'check',
          color: 'text-blueprint-blue',
          label: `${missionsCount} missions`,
          spin: false,
        };
      case 'error':
        return {
          icon: 'x-circle',
          color: 'text-red-400',
          label: errorMessage ?? 'Erreur',
          spin: false,
        };
      default:
        return { icon: 'loader', color: 'text-text-muted', label: 'En attente', spin: false };
    }
  });

  function handleReconnect() {
    if (!url) {
      return;
    }
    try {
      chrome.tabs.create({ url });
    } catch {
      window.open(url, '_blank');
    }
  }
</script>

<div class="flex items-center gap-2.5 py-1.5">
  <div
    class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-border-light bg-surface-white"
  >
    {#if icon.startsWith('http') && !imgFailed}
      <img
        src={icon}
        alt={name}
        width="14"
        height="14"
        class="rounded-sm"
        onerror={() => {
          imgFailed = true;
        }}
      />
    {:else}
      <span class="text-[9px] font-bold text-text-secondary">{name.slice(0, 2).toUpperCase()}</span>
    {/if}
  </div>
  <span class="min-w-0 flex-1 truncate text-[11px] font-medium text-text-primary">{name}</span>
  <div class="flex items-center gap-1.5">
    {#if connectorState === 'error' && isSessionError && url}
      <button class="text-[10px] text-blueprint-blue hover:underline" onclick={handleReconnect}>
        Reconnecter
      </button>
    {/if}
    {#if relativeTime && connectorState === 'error'}
      <span class="text-[9px] text-text-muted">{relativeTime}</span>
    {/if}
    <span class="flex items-center gap-1 text-[10px] {stateConfig.color}">
      <span class="shrink-0" class:animate-spin={stateConfig.spin}>
        <Icon name={stateConfig.icon} size={12} />
      </span>
      <span class="max-w-40 truncate">{stateConfig.label}</span>
    </span>
  </div>
</div>
