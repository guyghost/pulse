<script lang="ts">
  import { Icon } from '@pulse/ui';

  const {
    showResetConfirm,
    onShowConfirm,
    onCancelConfirm,
    onConfirmReset,
    onCreateBackup,
  }: {
    showResetConfirm: boolean;
    onShowConfirm: () => void;
    onCancelConfirm: () => void;
    onConfirmReset: () => void;
    onCreateBackup?: () => void | Promise<void>;
  } = $props();

  let confirmationText = $state('');
  let confirmActions: HTMLDivElement | null = $state(null);
  const canConfirmReset = $derived(confirmationText === 'SUPPRIMER');

  $effect(() => {
    if (!showResetConfirm) {
      confirmationText = '';
    }
  });

  $effect(() => {
    if (showResetConfirm && confirmActions) {
      requestAnimationFrame(() => {
        confirmActions?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      });
    }
  });

  function handleConfirmReset(): void {
    if (!canConfirmReset) {
      return;
    }
    onConfirmReset();
  }
</script>

<div class="section-card rounded-xl border border-status-red/15 p-5">
  <div class="flex items-center gap-3">
    <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-status-red/8">
      <Icon name="alert-triangle" size={14} class="text-status-red" />
    </div>
    <div>
      <p class="text-sm font-medium text-status-red">Zone dangereuse</p>
      <p class="mt-0.5 text-xs text-text-subtle">
        Supprimer toutes les données locales (profil, missions, cache).
      </p>
    </div>
  </div>
  <div class="mt-4">
    {#if showResetConfirm}
      <div class="rounded-xl border border-status-red/20 bg-status-red/6 px-3 py-2.5">
        <p class="text-[10px] font-semibold uppercase tracking-[0.15em] text-status-red">
          Suppression irréversible
        </p>
        <p class="mt-1.5 text-xs leading-4 text-text-primary">
          Impact : profil, missions, favoris, masquées, vues et caches IA supprimés de cet appareil.
        </p>
        <p class="mt-1 text-xs leading-4 text-text-subtle">
          Après suppression : relancer l’onboarding, reconnecter les sources, puis refaire un scan.
        </p>

        <label
          for="danger-reset-confirm"
          class="mt-1.5 block text-xs font-medium text-text-primary"
        >
          Tapez SUPPRIMER pour confirmer
        </label>
        <input
          id="danger-reset-confirm"
          class="mt-1 w-full rounded-lg border border-status-red/20 bg-surface-white px-3 py-1.5 text-xs font-medium text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-status-red/40"
          placeholder="SUPPRIMER"
          bind:value={confirmationText}
          autocomplete="off"
        />

        {#if onCreateBackup}
          <button
            type="button"
            class="mt-2 inline-flex items-center rounded-lg border border-border-light bg-surface-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-subtle-gray"
            onclick={onCreateBackup}
          >
            <Icon name="download" size={12} class="mr-1" />
            Créer une sauvegarde avant suppression
          </button>
        {/if}

        <div bind:this={confirmActions} class="mt-1.5 flex scroll-mb-4 flex-wrap gap-2">
          <button
            class="rounded-lg border border-border-light bg-surface-white px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-subtle-gray"
            onclick={onCancelConfirm}
          >
            Annuler
          </button>
          <button
            class="rounded-lg border border-status-red/25 bg-status-red/10 px-3 py-1.5 text-xs font-medium text-status-red transition-colors hover:bg-status-red/15 disabled:cursor-not-allowed disabled:opacity-40"
            onclick={handleConfirmReset}
            disabled={!canConfirmReset}
            aria-disabled={!canConfirmReset}
          >
            Supprimer définitivement
          </button>
        </div>
      </div>
    {:else}
      <button
        class="rounded-lg border border-status-red/20 bg-status-red/5 px-3 py-2 text-xs font-medium text-status-red transition-colors hover:bg-status-red/10"
        onclick={onShowConfirm}
      >
        <Icon name="trash-2" size={12} class="mr-1" />
        Réinitialiser tout
      </button>
    {/if}
  </div>
</div>
