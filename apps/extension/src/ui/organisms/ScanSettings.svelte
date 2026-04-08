<script lang="ts">
  import Icon from '../atoms/Icon.svelte';

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
<div class="section-card rounded-[1.5rem] p-4">
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-sm font-semibold text-text-primary">Scan automatique</h3>
      <p class="mt-1 text-xs leading-relaxed text-text-secondary">
        Scanner les plateformes en arriere-plan automatiquement.
      </p>
    </div>
    <button
      class="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200 {autoScan
        ? 'border-accent-emerald/30 bg-accent-emerald/20'
        : 'border-white/10 bg-white/5'}"
      onclick={onToggleAutoScan}
      role="switch"
      aria-checked={autoScan}
      aria-label="Activer le scan automatique"
    >
      <span
        class="inline-block h-5 w-5 rounded-full transition-transform duration-200 {autoScan
          ? 'translate-x-6 bg-accent-emerald'
          : 'translate-x-0.5 bg-text-muted'}"
      ></span>
    </button>
  </div>
</div>

<!-- Intervalle de scan -->
<div
  class="section-card rounded-[1.5rem] p-4 space-y-3 transition-opacity duration-200"
  class:opacity-40={!autoScan}
  class:pointer-events-none={!autoScan}
>
  <div>
    <h3 class="text-sm font-semibold text-text-primary">Fréquence de scan</h3>
    <p class="mt-1 text-xs leading-relaxed text-text-secondary">
      Scanner les plateformes toutes les {scanInterval} minutes.
    </p>
  </div>
  <div class="flex items-center gap-3">
    <span class="text-xs text-text-muted">5 min</span>
    <input
      type="range"
      min="5"
      max="120"
      step="5"
      value={scanInterval}
      onchange={onScanIntervalChange}
      class="flex-1 accent-accent-blue"
    />
    <span class="text-xs text-text-muted">120 min</span>
  </div>
  <p class="text-center text-sm font-semibold text-accent-blue">{scanInterval} min</p>
  {#if !autoScan}
    <p class="text-center text-[11px] text-text-muted">
      Activez le scan automatique pour configurer la fréquence.
    </p>
  {/if}
</div>

<!-- Notifications -->
<div class="section-card rounded-[1.5rem] p-4">
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-sm font-semibold text-text-primary">Notifications</h3>
      <p class="mt-1 text-xs leading-relaxed text-text-secondary">
        Recevoir une alerte quand de nouvelles missions arrivent.
      </p>
    </div>
    <button
      class="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200 {notifications
        ? 'border-accent-emerald/30 bg-accent-emerald/20'
        : 'border-white/10 bg-white/5'}"
      onclick={onToggleNotifications}
      role="switch"
      aria-checked={notifications}
      aria-label="Activer les notifications"
    >
      <span
        class="inline-block h-5 w-5 rounded-full transition-transform duration-200 {notifications
          ? 'translate-x-6 bg-accent-emerald'
          : 'translate-x-0.5 bg-text-muted'}"
      ></span>
    </button>
  </div>
</div>
