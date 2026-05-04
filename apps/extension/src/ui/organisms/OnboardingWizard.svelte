<script lang="ts">
  import type { UserProfile } from '$lib/core/types/profile';
  import { Chip } from '@pulse/ui';
  import { Icon } from '@pulse/ui';
  import { ripple } from '../actions/ripple';

  const {
    onComplete,
    onSkip,
    onUpdateProfile,
    onRetry,
    isSaving = false,
    hasError = false,
    errorMessage = null,
  }: {
    onComplete?: () => void;
    onSkip?: () => void;
    onUpdateProfile?: (profile: Partial<UserProfile>) => void;
    onRetry?: () => void;
    isSaving?: boolean;
    hasError?: boolean;
    errorMessage?: string | null;
  } = $props();

  let firstName = $state('');
  let jobTitle = $state('');
  let location = $state('');
  let stack = $state<string[]>([]);
  let stackInput = $state('');
  let tjm = $state(600);

  function addStack() {
    const trimmed = stackInput.trim();
    if (trimmed && !stack.includes(trimmed)) {
      stack = [...stack, trimmed];
      stackInput = '';
      onUpdateProfile?.({ stack });
    }
  }

  function removeStack(item: string) {
    stack = stack.filter((s) => s !== item);
    onUpdateProfile?.({ stack });
  }

  function handleComplete() {
    onUpdateProfile?.({
      firstName,
      jobTitle,
      location,
      stack,
      tjmMin: tjm,
      tjmMax: tjm + 150,
      remote: 'any',
      seniority: 'senior',
    });
    onComplete?.();
  }

  const canSubmit = $derived(
    firstName.trim().length > 0 && jobTitle.trim().length > 0 && stack.length > 0
  );

  function handleSubmit() {
    if (isSaving) {
      return;
    }
    handleComplete();
  }
</script>

<div class="space-y-5 pb-2">
  <div class="space-y-2">
    <div>
      <p class="text-sm font-semibold text-text-primary">Personnalisez vos résultats</p>
      <p class="mt-1 text-xs leading-relaxed text-text-secondary">
        Le premier scan peut tourner avec un profil vide. Complétez ces champs pour affiner le
        scoring ensuite.
      </p>
    </div>
  </div>

  <div>
    <label for="ob-firstname" class="mb-2 block text-xs uppercase tracking-[0.18em] text-text-muted"
      >Prenom</label
    >
    <input
      id="ob-firstname"
      type="text"
      class="soft-ring w-full rounded-lg border border-border-light bg-page-canvas px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-blueprint-blue/30 focus:ring-2 focus:ring-blueprint-blue/15 transition-all duration-200"
      placeholder="ex: Guy"
      bind:value={firstName}
    />
  </div>

  <div>
    <label for="ob-jobtitle" class="mb-2 block text-xs uppercase tracking-[0.18em] text-text-muted"
      >Poste recherché</label
    >
    <input
      id="ob-jobtitle"
      type="text"
      class="soft-ring w-full rounded-lg border border-border-light bg-page-canvas px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-blueprint-blue/30 focus:ring-2 focus:ring-blueprint-blue/15 transition-all duration-200"
      placeholder="ex: Developpeur React Senior"
      bind:value={jobTitle}
    />
  </div>

  <div>
    <label for="ob-stack" class="mb-2 block text-xs uppercase tracking-[0.18em] text-text-muted"
      >Stack technique</label
    >
    <div class="flex gap-2">
      <input
        id="ob-stack"
        type="text"
        class="soft-ring flex-1 rounded-lg border border-border-light bg-page-canvas px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-blueprint-blue/30 focus:ring-2 focus:ring-blueprint-blue/15 transition-all duration-200"
        placeholder="ex: React"
        bind:value={stackInput}
        onkeydown={(e) => {
          if (e.key === 'Enter') {
            addStack();
          }
        }}
      />
      <button
        class="inline-flex min-h-12 items-center justify-center rounded-lg border border-border-light bg-subtle-gray px-4 text-text-secondary transition-all duration-200 hover:bg-subtle-gray hover:text-text-primary"
        onclick={addStack}
      >
        <Icon name="plus" size={14} />
      </button>
    </div>
    {#if stack.length > 0}
      <div class="mt-3 flex flex-wrap gap-2">
        {#each stack as tech}
          <Chip label={tech} selected={true} onclick={() => removeStack(tech)} />
        {/each}
      </div>
    {/if}
  </div>

  <div>
    <label for="ob-location" class="mb-2 block text-xs uppercase tracking-[0.18em] text-text-muted"
      >Localisation souhaitée</label
    >
    <input
      id="ob-location"
      type="text"
      class="soft-ring w-full rounded-lg border border-border-light bg-page-canvas px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-blueprint-blue/30 focus:ring-2 focus:ring-blueprint-blue/15 transition-all duration-200"
      placeholder="ex: Paris ou remote"
      bind:value={location}
    />
  </div>

  <div>
    <label for="ob-tjm" class="mb-2 block text-xs uppercase tracking-[0.18em] text-text-muted"
      >TJM cible (EUR/jour)</label
    >
    <div class="section-card rounded-lg px-4 py-3">
      <div class="flex items-end justify-between gap-3">
        <div>
          <p class="text-xs text-text-secondary">Base de calibration</p>
          <p class="mt-1 text-[11px] text-text-muted">
            Nous générons ensuite une fourchette cible.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <input
            id="ob-tjm"
            type="number"
            class="w-28 rounded-2xl border border-border-light bg-page-canvas px-3 py-2.5 text-sm font-semibold text-text-primary font-mono focus:outline-none focus:border-blueprint-blue/30 focus:ring-2 focus:ring-blueprint-blue/15 transition-all duration-200"
            bind:value={tjm}
          />
          <span class="text-sm font-mono text-blueprint-blue">EUR</span>
        </div>
      </div>
    </div>
  </div>

  {#if hasError && errorMessage}
    <div
      class="flex items-start gap-2 rounded-lg border border-status-red/30 bg-status-red/10 px-4 py-3 text-xs text-status-red"
    >
      <Icon name="alert-circle" size={14} />
      <div class="flex-1">
        <p class="font-semibold">Erreur de sauvegarde</p>
        <p class="mt-0.5 text-status-red/80">{errorMessage}</p>
      </div>
      <button
        class="shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-status-red hover:bg-status-red/15 transition-colors"
        onclick={onRetry}
      >
        Réessayer
      </button>
    </div>
  {/if}

  {#if firstName.trim().length > 0 && jobTitle.trim().length > 0 && stack.length === 0}
    <p class="text-xs text-blueprint-blue">
      Ajoutez au moins une technologie pour activer le scoring.
    </p>
  {/if}

  <div class="mt-2 flex flex-col gap-2">
    <button
      use:ripple
      class="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blueprint-blue/25 bg-blueprint-blue/88 py-3 text-sm font-semibold text-surface-white transition-all duration-200 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
      disabled={!canSubmit || isSaving}
      onclick={handleSubmit}
    >
      {#if isSaving}
        <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
          ></circle>
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        Sauvegarde...
      {:else}
        Sauvegarder mon profil <Icon name="arrow-right" size={16} />
      {/if}
    </button>

    <button
      class="inline-flex w-full items-center justify-center rounded-lg border border-border-light bg-subtle-gray py-3 text-sm font-medium text-text-secondary transition-all duration-200 hover:bg-subtle-gray hover:text-text-primary"
      onclick={onSkip}
      type="button"
    >
      Plus tard
    </button>
  </div>
</div>
