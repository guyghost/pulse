<script lang="ts">
  import { Icon } from '@pulse/ui';
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
    class="mx-4 mb-3 flex items-center gap-3 rounded-2xl border border-blueprint-blue/20
           bg-blueprint-blue/8 px-4 py-3"
    role="status"
  >
    <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blueprint-blue/15">
      <Icon name="star" size={16} class="text-blueprint-blue" />
    </div>

    <div class="min-w-0 flex-1">
      <p class="text-[12px] font-semibold text-text-primary">Affinez vos résultats</p>
      <p class="text-[11px] text-text-secondary">
        Complétez votre profil pour un scoring personnalisé
      </p>
    </div>

    <div class="flex shrink-0 items-center gap-1">
      <button
        class="rounded-lg border border-blueprint-blue/30 bg-blueprint-blue/15 px-3 py-1.5
               text-[11px] font-medium text-blueprint-blue transition-colors hover:bg-blueprint-blue/25"
        onclick={handleSetupProfile}
      >
        Configurer
      </button>
      <button
        class="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted
               transition-colors hover:bg-subtle-gray hover:text-text-secondary"
        onclick={handleDismiss}
        aria-label="Ignorer"
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  </div>
{/if}
