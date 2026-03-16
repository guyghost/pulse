<script lang="ts">
  import Icon from '../ui/atoms/Icon.svelte';
  import type { LogEntry } from './bridge-logger';
  import { metricsCollector } from '../lib/shell/metrics';

  let { onInjectMissions, onSetState, onToggleOnboarding, onClearCache, onExportMetrics, onResetMetrics, logs = [] }: {
    onInjectMissions?: (count: number) => void;
    onSetState?: (state: 'empty' | 'loading' | 'loaded' | 'error') => void;
    onToggleOnboarding?: () => void;
    onClearCache?: () => void;
    onExportMetrics?: () => void;
    onResetMetrics?: () => void;
    logs?: LogEntry[];
  } = $props();

  let isOpen = $state(false);
  let activeTab = $state<'main' | 'metrics'>('main');
  let missionCount = $state(10);
  let metricsRefreshKey = $state(0);

  // Métriques pour l'affichage
  let scanMetrics = $derived(() => {
    metricsRefreshKey;
    const allMetrics = metricsCollector.getMetrics();
    const durations = allMetrics.filter(m => m.name === 'scan.duration').map(m => m.value);
    return {
      avgTime: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
      count: allMetrics.filter(m => m.name === 'scan.duration').length,
      total: allMetrics.length
    };
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      isOpen = !isOpen;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div class="fixed bottom-0 left-0 right-0 z-50 max-h-[50vh] overflow-y-auto bg-navy-900 border-t-2 border-accent-blue shadow-lg">
    <div class="flex items-center justify-between px-3 py-2 bg-navy-800 sticky top-0">
      <span class="text-xs font-bold text-accent-blue font-mono">DEV PANEL</span>
      <button class="text-text-secondary hover:text-text-primary" onclick={() => isOpen = false}>
        <Icon name="x" size={14} />
      </button>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 px-3 pt-2 border-b border-navy-700">
      <button
        class="px-3 py-1.5 text-[11px] font-mono rounded-t transition-colors {activeTab === 'main' ? 'bg-surface text-text-primary' : 'text-text-secondary hover:text-text-primary'}"
        onclick={() => activeTab = 'main'}
      >
        Main
      </button>
      <button
        class="px-3 py-1.5 text-[11px] font-mono rounded-t transition-colors {activeTab === 'metrics' ? 'bg-surface text-text-primary' : 'text-text-secondary hover:text-text-primary'}"
        onclick={() => { activeTab = 'metrics'; metricsRefreshKey++; }}
      >
        Métriques
      </button>
    </div>

    <div class="p-3 space-y-4">
      <div>
        <span class="text-[10px] uppercase font-bold text-text-secondary tracking-wider">Feed State</span>
        <div class="flex gap-1 mt-1">
          {#each ['empty', 'loading', 'loaded', 'error'] as state}
            <button
              class="px-2 py-1 text-[11px] font-mono rounded bg-surface hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
              onclick={() => onSetState?.(state as 'empty' | 'loading' | 'loaded' | 'error')}
            >
              {state}
            </button>
          {/each}
        </div>
      </div>

      <div>
        <span class="text-[10px] uppercase font-bold text-text-secondary tracking-wider">Missions</span>
        <div class="flex items-center gap-2 mt-1">
          <input
            type="range"
            min="0"
            max="50"
            bind:value={missionCount}
            class="flex-1 accent-accent-blue"
          />
          <span class="text-xs font-mono text-text-secondary w-6 text-right">{missionCount}</span>
          <button
            class="px-2 py-1 text-[11px] font-mono rounded bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 transition-colors"
            onclick={() => onInjectMissions?.(missionCount)}
          >
            inject
          </button>
        </div>
      </div>

      <div>
        <span class="text-[10px] uppercase font-bold text-text-secondary tracking-wider">Onboarding</span>
        <div class="mt-1">
          <button
            class="px-2 py-1 text-[11px] font-mono rounded bg-surface hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
            onclick={() => onToggleOnboarding?.()}
          >
            toggle onboarding
          </button>
        </div>
      </div>

      <div>
        <span class="text-[10px] uppercase font-bold text-text-secondary tracking-wider">Cache</span>
        <div class="mt-1">
          <button
            class="px-2 py-1 text-[11px] font-mono rounded bg-surface hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
            onclick={() => onClearCache?.()}
          >
            vider le cache
          </button>
        </div>
      </div>

      {#if activeTab === 'main'}
        <!-- Main Tab Content -->
        <div>
          <span class="text-[10px] uppercase font-bold text-text-secondary tracking-wider">Bridge Logs</span>
          <div class="mt-1 max-h-32 overflow-y-auto bg-surface rounded p-2 font-mono text-[10px] space-y-0.5">
            {#if logs.length === 0}
              <p class="text-text-muted">No messages yet</p>
            {:else}
              {#each logs as log}
                <div class="flex gap-2">
                  <span class="text-text-muted">{log.time}</span>
                  <span class={log.direction === '\u2192' ? 'text-accent-blue' : 'text-accent-emerald'}>{log.direction}</span>
                  <span class="text-text-primary">{log.type}</span>
                  <span class="text-text-secondary truncate">{log.summary}</span>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      {:else}
        <!-- Metrics Tab Content -->
        <div class="space-y-3">
          <div class="grid grid-cols-3 gap-2">
            <div class="bg-surface rounded p-2 text-center">
              <div class="text-[9px] uppercase text-text-secondary">Scans</div>
              <div class="text-lg font-mono text-text-primary">{scanMetrics().count}</div>
            </div>
            <div class="bg-surface rounded p-2 text-center">
              <div class="text-[9px] uppercase text-text-secondary">Avg Time</div>
              <div class="text-lg font-mono text-accent-blue">{scanMetrics().avgTime}ms</div>
            </div>
            <div class="bg-surface rounded p-2 text-center">
              <div class="text-[9px] uppercase text-text-secondary">Metrics</div>
              <div class="text-lg font-mono text-accent-emerald">{scanMetrics().total}</div>
            </div>
          </div>

          <div>
            <span class="text-[10px] uppercase font-bold text-text-secondary tracking-wider">Actions</span>
            <div class="flex gap-2 mt-1">
              <button
                class="flex-1 px-2 py-1.5 text-[11px] font-mono rounded bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 transition-colors"
                onclick={() => { onExportMetrics?.(); metricsRefreshKey++; }}
              >
                Exporter
              </button>
              <button
                class="flex-1 px-2 py-1.5 text-[11px] font-mono rounded bg-accent-red/20 text-accent-red hover:bg-accent-red/30 transition-colors"
                onclick={() => { onResetMetrics?.(); metricsRefreshKey++; }}
              >
                Réinitialiser
              </button>
            </div>
          </div>

          <div>
            <span class="text-[10px] uppercase font-bold text-text-secondary tracking-wider">Cache Stats</span>
            <div class="mt-1">
              <button
                class="px-2 py-1 text-[11px] font-mono rounded bg-surface hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
                onclick={() => { onClearCache?.(); metricsRefreshKey++; }}
              >
                Rafraîchir cache
              </button>
            </div>
          </div>

          <p class="text-[9px] text-text-muted">
            Ouvrir le panel complet: <span class="font-mono text-accent-blue">Ctrl+Shift+M</span>
          </p>
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if !isOpen}
  <div class="fixed bottom-2 right-2 z-50">
    <button
      class="px-2 py-1 text-[9px] font-mono rounded bg-navy-800/80 text-text-muted hover:text-accent-blue transition-colors border border-navy-700/50"
      onclick={() => isOpen = true}
    >
      Ctrl+Shift+D
    </button>
  </div>
{/if}
