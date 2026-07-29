<script lang="ts">
  /**
   * Profile checklist pill — compact, never blocking.
   * Shows profile completion % and lets the user jump to profile settings.
   * Purely presentational: receives completion + callbacks; any "dismissed"
   * persistence is the parent's responsibility (the host owns the flag).
   */
  import { Icon, type IconName } from '@pulse/ui';
  import { slide } from 'svelte/transition';

  const {
    completion,
    onOpenProfile,
    onDismiss,
  }: {
    /** 0–100 profile completion ratio. */
    completion: number;
    onOpenProfile: () => void;
    onDismiss: () => void;
  } = $props();

  const pct = $derived(Math.max(0, Math.min(100, Math.round(completion))));
  const label = $derived(pct >= 100 ? 'Profil complet' : `Profil à ${pct}%`);
  const steps = $derived<{ icon: IconName; filled: boolean; label: string }[]>([
    { icon: 'check', filled: pct > 0, label: 'Identité' },
    { icon: 'star', filled: pct >= 40, label: 'Compétences' },
    { icon: 'briefcase', filled: pct >= 70, label: 'Expériences' },
  ]);
</script>

<div
  class="flex items-center gap-3 rounded-full border border-border-light bg-surface-white/95 px-3 py-2 shadow-sm backdrop-blur"
  transition:slide={{ duration: 150 }}
>
  <button
    type="button"
    onclick={onOpenProfile}
    class="flex items-center gap-2 rounded-full py-0.5 pl-1 pr-2 transition-colors hover:bg-subtle-gray focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blueprint-blue"
    aria-label="Compléter mon profil"
  >
    <span
      class="relative flex h-7 w-7 items-center justify-center rounded-full {pct >= 100
        ? 'bg-accent-green/15 text-accent-green'
        : 'bg-blueprint-blue/10 text-blueprint-blue'}"
    >
      {#if pct >= 100}
        <Icon name="check" class="h-4 w-4" />
      {:else}
        <span class="text-[10px] font-bold">{pct}</span>
      {/if}
    </span>
    <span class="text-xs font-medium text-text-primary">{label}</span>
  </button>

  <div class="hidden items-center gap-1.5 sm:flex">
    {#each steps as s (s.label)}
      <span
        class="flex h-5 w-5 items-center justify-center rounded-full transition-colors {s.filled
          ? 'bg-blueprint-blue/12 text-blueprint-blue'
          : 'bg-subtle-gray text-text-muted'}"
        title={s.label}
      >
        <Icon name={s.icon} class="h-3 w-3" />
      </span>
    {/each}
  </div>

  <button
    type="button"
    onclick={onDismiss}
    class="ml-1 flex h-6 w-6 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-subtle-gray hover:text-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blueprint-blue"
    aria-label="Masquer"
  >
    <Icon name="minus" class="h-3.5 w-3.5" />
  </button>
</div>
