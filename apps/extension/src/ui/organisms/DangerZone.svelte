<script lang="ts">
  import Icon from '../atoms/Icon.svelte';
  import Button from '../atoms/Button.svelte';

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

<div class="section-card rounded-[1.5rem] border border-red-500/20 p-4 space-y-3">
  <div>
    <h3 class="text-sm font-semibold text-red-400">Zone dangereuse</h3>
    <p class="mt-1 text-xs leading-relaxed text-text-secondary">
      Supprimer toutes les données locales (profil, missions, cache).
    </p>
  </div>
  {#if showResetConfirm}
    <div class="flex gap-2">
      <Button variant="ghost" onclick={onCancelConfirm}>
        {#snippet children()}Annuler{/snippet}
      </Button>
      <button
        class="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/20 px-4 py-2.5 text-sm font-semibold text-red-400 transition-all duration-200 hover:bg-red-500/30"
        onclick={onConfirmReset}
      >
        Confirmer la suppression
      </button>
    </div>
  {:else}
    <button
      class="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-400 transition-all duration-200 hover:bg-red-500/20"
      onclick={onShowConfirm}
    >
      <Icon name="trash-2" size={14} />
      Reinitialiser tout
    </button>
  {/if}
</div>
