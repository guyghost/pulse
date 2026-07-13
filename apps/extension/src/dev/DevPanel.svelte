<script lang="ts">
  import { Icon } from '@pulse/ui';
  import type { LogEntry } from './bridge-logger';
  import { metricsCollector } from '../lib/shell/metrics';
  import { applyQaSeedToLocalStorage } from './qa-seed';
  import {
    DEV_PREMIUM_FEATURE_STORAGE_KEY,
    DEV_PREMIUM_ENABLED_STORAGE_KEY,
  } from '$lib/state/features.svelte';

  const {
    onInjectMissions,
    onSetState,
    onToggleOnboarding,
    onClearCache,
    onExportMetrics,
    onResetMetrics,
    logs = [],
  }: {
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

  type DevScenario = {
    statusLabel: string;
    title: string;
    description: string;
    action: string;
    severity: 'success' | 'attention' | 'incident';
  };

  const scanMetrics = $derived.by(() => {
    metricsRefreshKey;
    const allMetrics = metricsCollector.getMetrics();
    const durations = allMetrics.filter((m) => m.name === 'scan.duration').map((m) => m.value);
    return {
      avgTime:
        durations.length > 0
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : 0,
      count: allMetrics.filter((m) => m.name === 'scan.duration').length,
      total: allMetrics.length,
    };
  });

  const devScenario = $derived.by<DevScenario>(() => {
    if (
      logs.some((log) => log.type.includes('ERROR') || log.summary.toLowerCase().includes('error'))
    ) {
      return {
        statusLabel: 'Incident simulé',
        title: 'Le bridge a produit un signal à investiguer',
        description:
          'Utilisez le journal pour vérifier le message, puis ouvrez le diagnostic complet si la cause est métrique.',
        action: 'Prochaine action : filtrer le log récent et reproduire le scénario.',
        severity: 'incident',
      };
    }

    if (missionCount >= 300) {
      return {
        statusLabel: 'Charge élevée',
        title: `${missionCount} missions vont tester la lisibilité du feed`,
        description:
          'Ce volume sert surtout à valider virtualisation, filtres, comparaison et absence de chevauchement.',
        action: 'Prochaine action : injecter puis vérifier scroll, filtres et temps de rendu.',
        severity: 'attention',
      };
    }

    if (scanMetrics.total > 0) {
      return {
        statusLabel: 'Session instrumentée',
        title: `${scanMetrics.total} signal${scanMetrics.total > 1 ? 'aux' : ''} collecté${scanMetrics.total > 1 ? 's' : ''}`,
        description:
          'La session contient assez de matière pour ouvrir le diagnostic opérationnel complet.',
        action: 'Prochaine action : ouvrir Ctrl+Shift+M pour prioriser les anomalies.',
        severity: 'success',
      };
    }

    return {
      statusLabel: 'Prêt',
      title: 'Choisissez le scénario à simuler',
      description:
        'Le panneau sert à provoquer un état précis du produit, pas à explorer des réglages au hasard.',
      action: 'Prochaine action : choisir un état feed ou injecter un volume de missions.',
      severity: 'attention',
    };
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      isOpen = !isOpen;
    }
  }

  function severityClasses(severity: DevScenario['severity']): string {
    if (severity === 'incident') {
      return 'border-status-red/25 bg-status-red/8 text-status-red';
    }
    if (severity === 'attention') {
      return 'border-status-orange/25 bg-status-orange/8 text-status-orange';
    }
    return 'border-blueprint-blue/20 bg-blueprint-blue/6 text-blueprint-blue';
  }

  function handleInjectQaSeed() {
    applyQaSeedToLocalStorage();
    window.location.reload();
  }

  type PremiumScenario = 'dormant' | 'active-premium' | 'active-free';

  const premiumScenario: PremiumScenario = (() => {
    try {
      const feat = window.localStorage.getItem(DEV_PREMIUM_FEATURE_STORAGE_KEY);
      if (feat !== 'true') {
        return 'dormant';
      }
      const enabled = window.localStorage.getItem(DEV_PREMIUM_ENABLED_STORAGE_KEY);
      return enabled === 'false' ? 'active-free' : 'active-premium';
    } catch {
      return 'dormant';
    }
  })();

  function applyPremiumScenario(scenario: PremiumScenario): void {
    try {
      if (scenario === 'dormant') {
        window.localStorage.setItem(DEV_PREMIUM_FEATURE_STORAGE_KEY, 'false');
      } else {
        window.localStorage.setItem(DEV_PREMIUM_FEATURE_STORAGE_KEY, 'true');
        window.localStorage.setItem(
          DEV_PREMIUM_ENABLED_STORAGE_KEY,
          scenario === 'active-premium' ? 'true' : 'false'
        );
      }
    } catch {
      // localStorage unavailable — ignore, reload still applies in-memory defaults
    }
    window.location.reload();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div
    class="fixed bottom-0 left-0 right-0 z-[60] max-h-[62vh] overflow-y-auto border-t border-blueprint-blue/30 bg-page-canvas shadow-lg"
  >
    <div
      class="sticky top-0 z-10 flex items-center justify-between border-b border-border-light bg-surface-white px-3 py-2"
    >
      <div>
        <span class="text-xs font-bold text-blueprint-blue font-mono">DEV PANEL</span>
        <p class="mt-0.5 text-[10px] text-text-subtle">Centre de contrôle des scénarios locaux</p>
      </div>
      <button
        class="rounded-lg p-1.5 text-text-secondary hover:bg-subtle-gray hover:text-text-primary"
        onclick={() => (isOpen = false)}
        aria-label="Fermer le centre de contrôle dev"
      >
        <Icon name="x" size={14} />
      </button>
    </div>

    <div class="flex gap-1 px-3 pt-2 border-b border-border-light">
      <button
        class="px-3 py-1.5 text-[11px] font-mono rounded-t transition-colors {activeTab === 'main'
          ? 'bg-surface text-text-primary'
          : 'text-text-secondary hover:text-text-primary'}"
        onclick={() => (activeTab = 'main')}
      >
        Main
      </button>
      <button
        class="px-3 py-1.5 text-[11px] font-mono rounded-t transition-colors {activeTab ===
        'metrics'
          ? 'bg-surface text-text-primary'
          : 'text-text-secondary hover:text-text-primary'}"
        onclick={() => {
          activeTab = 'metrics';
          metricsRefreshKey++;
        }}
      >
        Métriques
      </button>
    </div>

    <div class="p-3 space-y-4">
      <section class="rounded-xl border p-3 {severityClasses(devScenario.severity)}">
        <p class="text-[10px] font-semibold uppercase tracking-[0.16em]">
          {devScenario.statusLabel}
        </p>
        <p class="mt-1 text-sm font-semibold text-text-primary">{devScenario.title}</p>
        <p class="mt-1 text-xs leading-5 text-text-secondary">{devScenario.description}</p>
        <p class="mt-1 text-xs font-medium text-text-primary">{devScenario.action}</p>
      </section>

      <div>
        <div class="flex items-center justify-between gap-2">
          <span class="text-[10px] uppercase font-bold text-text-secondary tracking-wider"
            >Feed State</span
          >
          <span class="text-[10px] text-text-muted">Simuler une situation visible</span>
        </div>
        <div class="grid grid-cols-2 gap-1 mt-1 sm:flex">
          {#each [{ id: 'empty', label: 'empty', hint: 'Valider état vide' }, { id: 'loading', label: 'loading', hint: 'Valider skeleton' }, { id: 'loaded', label: 'loaded', hint: 'Valider feed actif' }, { id: 'error', label: 'error', hint: 'Valider incident' }] as state (state.id)}
            <button
              class="rounded-lg border border-border-light bg-surface-white px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-subtle-gray"
              onclick={() => onSetState?.(state.id as 'empty' | 'loading' | 'loaded' | 'error')}
              title={state.hint}
            >
              <span class="block font-mono font-semibold text-text-primary">{state.label}</span>
              <span class="block text-[9px] text-text-muted">{state.hint}</span>
            </button>
          {/each}
        </div>
      </div>

      <div>
        <span class="text-[10px] uppercase font-bold text-text-secondary tracking-wider"
          >Volume de missions</span
        >
        <div class="flex items-center gap-2 mt-1">
          <input
            type="range"
            min="0"
            max="500"
            bind:value={missionCount}
            class="flex-1 accent-blueprint-blue"
          />
          <span class="text-xs font-mono text-text-secondary w-10 text-right">{missionCount}</span>
          <button
            class="rounded-lg border border-blueprint-blue/25 bg-blueprint-blue/8 px-2 py-1.5 text-[11px] font-semibold text-blueprint-blue transition-colors hover:bg-blueprint-blue/12"
            onclick={() => onInjectMissions?.(missionCount)}
            title="Injecter le volume choisi pour tester le feed"
          >
            inject
          </button>
        </div>
        <p class="mt-1 text-[10px] text-text-subtle">
          Impact attendu : vérifier priorisation, virtualisation, filtres et actions de mission.
        </p>
      </div>

      <div>
        <span class="text-[10px] uppercase font-bold text-text-secondary tracking-wider"
          >Onboarding</span
        >
        <div class="mt-1">
          <button
            class="rounded-lg border border-border-light bg-surface-white px-2 py-1.5 text-[11px] font-medium text-text-secondary transition-colors hover:bg-subtle-gray hover:text-text-primary"
            onclick={() => onToggleOnboarding?.()}
            title="Rejouer le parcours de premier lancement"
          >
            toggle onboarding
          </button>
        </div>
      </div>

      <div>
        <span class="text-[10px] uppercase font-bold text-text-secondary tracking-wider">Cache</span
        >
        <div class="mt-1">
          <button
            class="rounded-lg border border-border-light bg-surface-white px-2 py-1.5 text-[11px] font-medium text-text-secondary transition-colors hover:bg-subtle-gray hover:text-text-primary"
            onclick={() => onClearCache?.()}
            title="Forcer un état de cache froid"
          >
            vider le cache
          </button>
        </div>
      </div>

      <div>
        <span class="text-[10px] uppercase font-bold text-text-secondary tracking-wider"
          >QA Seed</span
        >
        <div class="mt-1">
          <button
            class="w-full rounded-lg border border-status-violet/25 bg-status-violet/8 px-2 py-1.5 text-[11px] font-semibold text-status-violet transition-colors hover:bg-status-violet/12"
            onclick={handleInjectQaSeed}
            title="Injecter un dataset QA déterministe (~500 missions, tous connecteurs, edges) puis recharger"
          >
            Inject QA seed (500)
          </button>
        </div>
        <p class="mt-1 text-[10px] text-text-subtle">
          Écrit missions, profil, favoris, vues, alertes, suivi candidatures et santé connecteurs.
        </p>
      </div>

      <div>
        <div class="flex items-center justify-between gap-2">
          <span class="text-[10px] uppercase font-bold text-text-secondary tracking-wider"
            >Premium</span
          >
          <span class="text-[10px] text-text-muted">Scénario : {premiumScenario}</span>
        </div>
        <div class="grid grid-cols-3 gap-1 mt-1">
          <button
            class="rounded-lg border px-2 py-1.5 text-left text-[11px] transition-colors {premiumScenario ===
            'dormant'
              ? 'border-blueprint-blue/40 bg-blueprint-blue/12 text-blueprint-blue'
              : 'border-border-light bg-surface-white text-text-secondary hover:bg-subtle-gray'}"
            onclick={() => applyPremiumScenario('dormant')}
            title="Feature dormant : tout déverrouillé, pas de paywall (défaut prod)"
          >
            <span class="block font-mono font-semibold">Dormant</span>
            <span class="block text-[9px] text-text-muted">Tout ouvert</span>
          </button>
          <button
            class="rounded-lg border px-2 py-1.5 text-left text-[11px] transition-colors {premiumScenario ===
            'active-premium'
              ? 'border-blueprint-blue/40 bg-blueprint-blue/12 text-blueprint-blue'
              : 'border-border-light bg-surface-white text-text-secondary hover:bg-subtle-gray'}"
            onclick={() => applyPremiumScenario('active-premium')}
            title="Feature active + utilisateur premium : gating live, tout déverrouillé"
          >
            <span class="block font-mono font-semibold">Active · Premium</span>
            <span class="block text-[9px] text-text-muted">Gating live</span>
          </button>
          <button
            class="rounded-lg border px-2 py-1.5 text-left text-[11px] transition-colors {premiumScenario ===
            'active-free'
              ? 'border-status-red/40 bg-status-red/12 text-status-red'
              : 'border-border-light bg-surface-white text-text-secondary hover:bg-subtle-gray'}"
            onclick={() => applyPremiumScenario('active-free')}
            title="Feature active + utilisateur gratuit : locks + PREMIUM_REQUIRED"
          >
            <span class="block font-mono font-semibold">Active · Gratuit</span>
            <span class="block text-[9px] text-text-muted">Paywall visible</span>
          </button>
        </div>
        <p class="mt-1 text-[10px] text-text-subtle">
          Bascule le flag premium et recharge. Dormant = défaut production.
        </p>
      </div>

      {#if activeTab === 'main'}
        <!-- Main Tab Content -->
        <div>
          <div class="flex items-center justify-between gap-2">
            <span class="text-[10px] uppercase font-bold text-text-secondary tracking-wider"
              >Bridge Logs</span
            >
            <span class="text-[10px] text-text-muted">Timeline des messages runtime</span>
          </div>
          <div
            class="mt-1 max-h-32 overflow-y-auto rounded-xl border border-border-light bg-surface-white p-2 font-mono text-[10px] space-y-0.5"
          >
            {#if logs.length === 0}
              <p class="text-text-muted">
                Aucun message runtime. Lancez un scan ou changez d’état.
              </p>
            {:else}
              {#each logs as log, i (i)}
                <div class="flex gap-2">
                  <span class="text-text-muted">{log.time}</span>
                  <span
                    class={log.direction === '\u2192'
                      ? 'text-blueprint-blue'
                      : 'text-blueprint-blue'}>{log.direction}</span
                  >
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
            <div class="rounded-xl border border-border-light bg-surface-white p-2 text-center">
              <div class="text-[9px] uppercase text-text-secondary">Scans</div>
              <div class="text-lg font-mono text-text-primary">{scanMetrics.count}</div>
              <div class="text-[9px] text-text-muted">Historique</div>
            </div>
            <div class="rounded-xl border border-border-light bg-surface-white p-2 text-center">
              <div class="text-[9px] uppercase text-text-secondary">Latence</div>
              <div class="text-lg font-mono text-blueprint-blue">{scanMetrics.avgTime}ms</div>
              <div class="text-[9px] text-text-muted">À surveiller</div>
            </div>
            <div class="rounded-xl border border-border-light bg-surface-white p-2 text-center">
              <div class="text-[9px] uppercase text-text-secondary">Signaux</div>
              <div class="text-lg font-mono text-blueprint-blue">{scanMetrics.total}</div>
              <div class="text-[9px] text-text-muted">Session</div>
            </div>
          </div>

          <div>
            <span class="text-[10px] uppercase font-bold text-text-secondary tracking-wider"
              >Actions</span
            >
            <div class="flex gap-2 mt-1">
              <button
                class="flex-1 rounded-lg border border-blueprint-blue/25 bg-blueprint-blue/8 px-2 py-1.5 text-[11px] font-medium text-blueprint-blue transition-colors hover:bg-blueprint-blue/12"
                onclick={() => {
                  onExportMetrics?.();
                  metricsRefreshKey++;
                }}
              >
                Exporter contexte
              </button>
              <button
                class="flex-1 rounded-lg border border-status-red/25 bg-status-red/8 px-2 py-1.5 text-[11px] font-medium text-status-red transition-colors hover:bg-status-red/12"
                onclick={() => {
                  onResetMetrics?.();
                  metricsRefreshKey++;
                }}
              >
                Vider session
              </button>
            </div>
          </div>

          <div>
            <span class="text-[10px] uppercase font-bold text-text-secondary tracking-wider"
              >Cache local</span
            >
            <div class="mt-1">
              <button
                class="rounded-lg border border-border-light bg-surface-white px-2 py-1.5 text-[11px] font-medium text-text-secondary transition-colors hover:bg-subtle-gray hover:text-text-primary"
                onclick={() => {
                  onClearCache?.();
                  metricsRefreshKey++;
                }}
              >
                Provoquer cache froid
              </button>
            </div>
          </div>

          <p
            class="rounded-lg border border-blueprint-blue/15 bg-blueprint-blue/6 p-2 text-[10px] text-text-secondary"
          >
            Diagnostic complet : <span class="font-mono text-blueprint-blue">Ctrl+Shift+M</span>
            pour voir cause probable, impact et action recommandée.
          </p>
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if !isOpen}
  <div class="fixed bottom-2 right-2 z-[60]">
    <button
      class="px-2 py-1 text-[9px] font-mono rounded bg-surface-white/80 text-text-muted hover:text-blueprint-blue transition-colors border border-border-light"
      onclick={() => (isOpen = true)}
    >
      Ctrl+Shift+D
    </button>
  </div>
{/if}
