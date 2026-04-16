<script lang="ts">
  import Icon from '../atoms/Icon.svelte';
  import { setProfileBannerDismissed } from '$lib/shell/storage/first-scan';

  const { onSetupProfile }: { onSetupProfile: () => void } = $props();

  let dismissed = $state(false);

  async function handleDismiss() {
    dismissed = true;
    await setProfileBannerDismissed();
  }

  function handleSetupProfile() {
    onSetupProfile();
  }
</script>

{#if !dismissed}
  <div
    class="mx-4 mb-3 flex items-center gap-3 rounded-2xl border border-accent-blue/20
           bg-accent-blue/8 px-4 py-3"
    role="status"
  >
    <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-blue/15">
      <Icon name="sparkles" size={16} class="text-accent-blue" />
    </div>

    <div class="min-w-0 flex-1">
      <p class="text-[12px] font-semibold text-text-primary">Affinez vos résultats</p>
      <p class="text-[11px] text-text-secondary">Complétez votre profil pour un scoring personnalisé</p>
    </div>

    <div class="flex shrink-0 items-center gap-1">
      <button
        class="rounded-lg border border-accent-blue/30 bg-accent-blue/15 px-3 py-1.5
               text-[11px] font-medium text-accent-blue transition-colors hover:bg-accent-blue/25"
        onclick={handleSetupProfile}
      >
        Configurer
      </button>
      <button
        class="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted
               transition-colors hover:bg-white/6 hover:text-text-secondary"
        onclick={handleDismiss}
        aria-label="Ignorer"
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  </div>
{/if}
