<script lang="ts">
  import { Icon } from '@pulse/ui';

  const {
    showResetConfirm,
    onShowConfirm,
    onCancelConfirm,
    onConfirmReset,
  }: {
    showResetConfirm: boolean;
    onShowConfirm: () => void;
    onCancelConfirm: () => void;
    onConfirmReset: () => void;
  } = $props();
</script>

<div class="section-card rounded-xl border border-status-red/15 p-5">
  <div class="flex items-center gap-3">
    <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-status-red/8">
      <Icon name="alert-triangle" size={14} class="text-status-red" />
    </div>
    <div>
      <p class="text-sm font-medium text-status-red">Zone dangereuse</p>
      <p class="mt-0.5 text-xs text-text-subtle">Supprimer toutes les données locales (profil, missions, cache).</p>
    </div>
  </div>
  <div class="mt-4">
    {#if showResetConfirm}
      <div class="flex gap-2">
        <button
          class="rounded-lg border border-border-light bg-surface-white px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-subtle-gray"
          onclick={onCancelConfirm}
        >
          Annuler
        </button>
        <button
          class="rounded-lg border border-status-red/25 bg-status-red/10 px-3 py-2 text-xs font-medium text-status-red transition-colors hover:bg-status-red/15"
          onclick={onConfirmReset}
        >
          Confirmer la suppression
        </button>
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
