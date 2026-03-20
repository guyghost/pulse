<script lang="ts">
  import Icon from '../atoms/Icon.svelte';
  import type { AppError } from '$lib/core/errors';

  export type SourceSessionStatus = 'checking' | 'connected' | 'not-connected' | 'error';

  export interface SourceStatus {
    connectorId: string;
    name: string;
    icon: string;
    url: string;
    sessionStatus: SourceSessionStatus;
    lastSyncAt: number | null;
    error?: AppError;
  }

  let { sources, isChecking = false, onRefresh }: {
    sources: SourceStatus[];
    isChecking?: boolean;
    onRefresh?: () => void;
  } = $props();

  let imgFailed = $state<Record<string, boolean>>({});

  function getRelativeTime(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "à l'instant";
    if (minutes < 60) return `il y a ${minutes}min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `il y a ${hours}h`;
    return `il y a ${Math.floor(hours / 24)}j`;
  }

  let connectedCount = $derived(
    sources.filter((s) => s.sessionStatus === 'connected').length
  );

  let totalSources = $derived(sources.length);

  function handleReconnect(url: string) {
    try {
      chrome.tabs.create({ url });
    } catch {
      window.open(url, '_blank');
    }
  }
</script>

{#if sources.length > 0}
  <div class="mt-3 rounded-[1.25rem] border border-white/8 bg-white/[0.03] px-4 py-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <p class="text-[11px] uppercase tracking-[0.18em] text-text-muted">Sources</p>
        {#if !isChecking}
          <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium
            {connectedCount === totalSources
              ? 'border border-accent-emerald/20 bg-accent-emerald/10 text-accent-emerald'
              : connectedCount > 0
                ? 'border border-accent-amber/20 bg-accent-amber/10 text-accent-amber'
                : 'border border-white/10 bg-white/5 text-text-muted'}"
          >
            {connectedCount}/{totalSources} connectées
          </span>
        {/if}
      </div>
      {#if onRefresh}
        <button
          class="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-all duration-200 hover:bg-white/6 hover:text-text-primary disabled:opacity-40"
          onclick={onRefresh}
          disabled={isChecking}
          title="Vérifier les connexions"
        >
          <span class:animate-spin={isChecking}>
            <Icon name="refresh-cw" size={12} />
          </span>
        </button>
      {/if}
    </div>

    <div class="mt-2 space-y-0.5">
      {#each sources as source (source.connectorId)}
        <div class="flex items-center gap-2.5 py-1.5">
          <!-- Favicon -->
          <div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/[0.04]">
            {#if source.icon.startsWith('http') && !imgFailed[source.connectorId]}
              <img
                src={source.icon}
                alt={source.name}
                width="14"
                height="14"
                class="rounded-sm"
                onerror={() => { imgFailed[source.connectorId] = true; }}
              />
            {:else}
              <span class="text-[9px] font-bold text-text-secondary">
                {source.name.slice(0, 2).toUpperCase()}
              </span>
            {/if}
          </div>

          <!-- Name -->
          <span class="min-w-0 flex-1 truncate text-[11px] font-medium text-text-primary">
            {source.name}
          </span>

          <!-- Status -->
          <div class="flex items-center gap-1.5">
            {#if source.sessionStatus === 'checking'}
              <span class="flex items-center gap-1 text-[10px] text-text-muted">
                <span class="animate-spin">
                  <Icon name="loader" size={12} />
                </span>
                <span>Vérification...</span>
              </span>
            {:else if source.sessionStatus === 'connected'}
              {#if source.lastSyncAt}
                <span class="text-[9px] text-text-muted">{getRelativeTime(source.lastSyncAt)}</span>
              {/if}
              <span class="flex items-center gap-1 text-[10px] text-accent-emerald">
                <span class="inline-block h-1.5 w-1.5 rounded-full bg-accent-emerald"></span>
                <span>Connecté</span>
              </span>
            {:else if source.sessionStatus === 'not-connected'}
              <button
                class="rounded-md border border-accent-blue/20 bg-accent-blue/8 px-2 py-0.5 text-[10px] font-medium text-accent-blue transition-colors hover:bg-accent-blue/15"
                onclick={() => handleReconnect(source.url)}
              >
                Se connecter
              </button>
            {:else if source.sessionStatus === 'error'}
              <span class="flex items-center gap-1 text-[10px] text-red-400">
                <Icon name="x-circle" size={12} />
                <span class="max-w-32 truncate">
                  {source.error?.message ?? 'Erreur'}
                </span>
              </span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}
