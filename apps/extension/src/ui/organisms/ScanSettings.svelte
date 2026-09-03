<script lang="ts">
  import { Icon, Toggle } from '@pulse/ui';

  const {
    autoScan,
    scanInterval,
    notifications,
    lastScanLabel,
    scanHistoryLabel,
    nextScanLabel,
    scanHistoryTone = 'neutral',
    onToggleAutoScan,
    onToggleNotifications,
    onScanIntervalChange,
  }: {
    autoScan: boolean;
    scanInterval: number;
    notifications: boolean;
    lastScanLabel: string;
    scanHistoryLabel: string;
    nextScanLabel: string;
    scanHistoryTone?: 'success' | 'attention' | 'neutral';
    onToggleAutoScan: () => void;
    onToggleNotifications: () => void;
    onScanIntervalChange: (event: Event) => void;
  } = $props();
</script>

<!-- Scan automatique -->
<div class="section-card rounded-xl p-5">
  <div class="flex items-center justify-between gap-4">
    <div class="flex items-center gap-3">
      <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blueprint-blue/6">
        <Icon name="radar" size={14} class="text-blueprint-blue" />
      </div>
      <div>
        <p class="text-body-lg font-medium text-text-primary">Scan automatique</p>
        <p class="mt-0.5 text-meta text-text-subtle">Scanner les plateformes en arrière-plan.</p>
      </div>
    </div>
    <Toggle
      checked={autoScan}
      aria-label="Activer le scan automatique"
      onclick={onToggleAutoScan}
    />
  </div>
</div>

<!-- Intervalle -->
<div
  class="section-card rounded-xl p-5 space-y-3 transition-opacity duration-200"
  class:opacity-40={!autoScan}
  class:pointer-events-none={!autoScan}
>
  <div>
    <p class="text-body-lg font-medium text-text-primary">Fréquence</p>
    <p class="mt-0.5 text-meta text-text-subtle">Intervalle entre chaque scan automatique.</p>
  </div>
  {#if !autoScan}
    <p
      class="rounded-lg border border-border-light bg-surface-white px-3 py-2 text-meta text-text-subtle"
    >
      Activez le scan automatique pour modifier la fréquence.
    </p>
  {/if}
  <div class="flex items-center gap-3">
    <span class="text-micro text-text-muted">5 min</span>
    <input
      type="range"
      min="5"
      max="120"
      step="5"
      value={scanInterval}
      onchange={onScanIntervalChange}
      disabled={!autoScan}
      aria-disabled={!autoScan ? 'true' : undefined}
      aria-label="Fréquence de scan"
      class="flex-1 accent-blueprint-blue"
    />
    <span class="text-micro text-text-muted">2h</span>
  </div>
  <p class="text-center text-body-lg font-semibold tabular-nums text-text-primary">
    {scanInterval} min
  </p>
  <div class="grid gap-2 sm:grid-cols-3" aria-label="Historique et cadence des scans">
    <div class="rounded-lg border border-border-light bg-surface-white px-3 py-2">
      <p class="eyebrow eyebrow--strong">Dernier déclenchement</p>
      <p class="mt-1 text-caption leading-4 text-text-secondary">{lastScanLabel}</p>
    </div>
    <div
      class="rounded-lg border px-3 py-2 {scanHistoryTone === 'attention'
        ? 'border-status-orange/25 bg-status-orange/8'
        : scanHistoryTone === 'success'
          ? 'border-blueprint-blue/20 bg-blueprint-blue/6'
          : 'border-border-light bg-surface-white'}"
    >
      <p class="eyebrow eyebrow--strong">Historique récent</p>
      <p class="mt-1 text-caption leading-4 text-text-secondary">{scanHistoryLabel}</p>
    </div>
    <div class="rounded-lg border border-border-light bg-surface-white px-3 py-2">
      <p class="eyebrow eyebrow--strong">Prochain déclenchement</p>
      <p class="mt-1 text-caption leading-4 text-text-secondary">{nextScanLabel}</p>
    </div>
  </div>
</div>

<!-- Notifications -->
<div class="section-card rounded-xl p-5">
  <div class="flex items-center justify-between gap-4">
    <div class="flex items-center gap-3">
      <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blueprint-blue/6">
        <Icon name="bell" size={14} class="text-blueprint-blue" />
      </div>
      <div>
        <p class="text-body-lg font-medium text-text-primary">Notifications</p>
        <p class="mt-0.5 text-meta text-text-subtle">
          Alerte quand de nouvelles missions arrivent.
        </p>
      </div>
    </div>
    <Toggle
      checked={notifications}
      aria-label="Activer les notifications"
      onclick={onToggleNotifications}
    />
  </div>
</div>
