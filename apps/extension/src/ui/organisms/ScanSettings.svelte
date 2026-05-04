<script lang="ts">
  import { Icon } from '@pulse/ui';

  const {
    autoScan,
    scanInterval,
    notifications,
    onToggleAutoScan,
    onToggleNotifications,
    onScanIntervalChange,
  }: {
    autoScan: boolean;
    scanInterval: number;
    notifications: boolean;
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
        <p class="text-sm font-medium text-text-primary">Scan automatique</p>
        <p class="mt-0.5 text-xs text-text-subtle">Scanner les plateformes en arrière-plan.</p>
      </div>
    </div>
    <button
      class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200
        {autoScan
        ? 'border-accent-green/30 bg-accent-green/15'
        : 'border-border-light bg-surface-white'}"
      onclick={onToggleAutoScan}
      role="switch"
      aria-checked={autoScan}
    >
      <span
        class="inline-block h-4 w-4 rounded-full transition-transform duration-200
          {autoScan ? 'translate-x-5.5 bg-accent-green' : 'translate-x-0.5 bg-text-muted'}"
      ></span>
    </button>
  </div>
</div>

<!-- Intervalle -->
<div
  class="section-card rounded-xl p-5 space-y-3 transition-opacity duration-200"
  class:opacity-40={!autoScan}
  class:pointer-events-none={!autoScan}
>
  <div>
    <p class="text-sm font-medium text-text-primary">Fréquence</p>
    <p class="mt-0.5 text-xs text-text-subtle">Intervalle entre chaque scan automatique.</p>
  </div>
  <div class="flex items-center gap-3">
    <span class="text-[10px] text-text-muted">5 min</span>
    <input
      type="range"
      min="5"
      max="120"
      step="5"
      value={scanInterval}
      onchange={onScanIntervalChange}
      class="flex-1 accent-blueprint-blue"
    />
    <span class="text-[10px] text-text-muted">2h</span>
  </div>
  <p class="text-center text-sm font-semibold tabular-nums text-text-primary">{scanInterval} min</p>
</div>

<!-- Notifications -->
<div class="section-card rounded-xl p-5">
  <div class="flex items-center justify-between gap-4">
    <div class="flex items-center gap-3">
      <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blueprint-blue/6">
        <Icon name="bell" size={14} class="text-blueprint-blue" />
      </div>
      <div>
        <p class="text-sm font-medium text-text-primary">Notifications</p>
        <p class="mt-0.5 text-xs text-text-subtle">Alerte quand de nouvelles missions arrivent.</p>
      </div>
    </div>
    <button
      class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200
        {notifications
        ? 'border-accent-green/30 bg-accent-green/15'
        : 'border-border-light bg-surface-white'}"
      onclick={onToggleNotifications}
      role="switch"
      aria-checked={notifications}
    >
      <span
        class="inline-block h-4 w-4 rounded-full transition-transform duration-200
          {notifications ? 'translate-x-5.5 bg-accent-green' : 'translate-x-0.5 bg-text-muted'}"
      ></span>
    </button>
  </div>
</div>
