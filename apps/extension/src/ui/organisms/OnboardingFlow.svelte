<script lang="ts">
  /**
   * Flow renderer. Consumes a pure {@link OnboardingFlowSnapshot} and reports
   * user intent via {@link onEvent}. It NEVER holds wizard/phase state locally
   * and NEVER decides a transition — the flow machine (via the page controller)
   * is the single source of truth. "The model decides."
   */
  import { SegmentedControl, ChipGroup, Toggle, Icon, type IconName } from '@pulse/ui';
  import { fade } from 'svelte/transition';
  import OnboardingWelcome from './OnboardingWelcome.svelte';
  import type {
    OnboardingFlowEvent,
    OnboardingFlowSnapshot,
    OnboardingProfileDraft,
  } from '../../models/onboarding-flow.machine';
  import type { RemoteType } from '$lib/core/types/mission';

  const {
    snapshot,
    sources,
    onEvent,
    onRetry,
    navFailed = false,
  }: {
    snapshot: OnboardingFlowSnapshot;
    sources: { id: string; name: string }[];
    onEvent: (event: OnboardingFlowEvent) => void;
    onRetry?: () => void;
    navFailed?: boolean;
  } = $props();

  // Local mirrors of inputs, synced FROM the snapshot (single source of truth).
  // These exist only so <input bind:> can update the DOM immediately; every
  // change is also pushed to the machine via UPDATE_PROFILE so the guard stays
  // authoritative.
  let firstName = $state(snapshot.profile.firstName);
  let jobTitle = $state(snapshot.profile.jobTitle);
  let location = $state(snapshot.profile.location);
  let tjmMin = $state(String(snapshot.profile.tjmMin));
  let tjmMax = $state(String(snapshot.profile.tjmMax));
  let keywordsInput = $state('');

  // Re-sync when the snapshot profile changes externally (e.g. back-nav).
  $effect(() => {
    firstName = snapshot.profile.firstName;
    jobTitle = snapshot.profile.jobTitle;
    location = snapshot.profile.location;
    tjmMin = String(snapshot.profile.tjmMin);
    tjmMax = String(snapshot.profile.tjmMax);
  });

  const REMOTE_OPTIONS: { value: RemoteType; label: string }[] = [
    { value: 'remote', label: 'Full-remote' },
    { value: 'hybrid', label: 'Hybride' },
    { value: 'onsite', label: 'Sur site' },
    { value: 'any', label: 'Indifférent' },
  ];

  const SKILL_SUGGESTIONS = [
    'React',
    'TypeScript',
    'Node.js',
    'Python',
    'Go',
    'Rust',
    'AWS',
    'Kubernetes',
    'PostgreSQL',
    'GraphQL',
    'Svelte',
    'Vue',
  ] as const;

  function patch(partial: Partial<OnboardingProfileDraft>) {
    onEvent({ type: 'UPDATE_PROFILE', partial });
  }

  function addKeyword(raw: string) {
    const k = raw.trim();
    if (!k) {
      return;
    }
    const next = [...new Set([...snapshot.profile.keywords, k])];
    patch({ keywords: next });
    keywordsInput = '';
  }

  function removeKeyword(k: string) {
    patch({ keywords: snapshot.profile.keywords.filter((x) => x !== k) });
  }

  const stepLabel = $derived(
    snapshot.wizardStep === 'identity'
      ? 'À propos de vous'
      : snapshot.wizardStep === 'preferences'
        ? 'Vos critères'
        : 'Vos compétences'
  );

  const stepHint = $derived(
    snapshot.wizardStep === 'identity'
      ? 'Pour personnaliser votre feed.'
      : snapshot.wizardStep === 'preferences'
        ? 'TJM, mobilité, type de contrat.'
        : 'Les technos sur lesquelles vous intervenez.'
  );

  const scanningPartial = $derived(
    snapshot.pendingEffect?.kind === 'START_SCAN' && snapshot.pendingEffect.partial
  );
</script>

{#if snapshot.phase === 'welcome'}
  <OnboardingWelcome
    onStart={() => onEvent({ type: 'START' })}
    onSkip={() => onEvent({ type: 'SKIP' })}
  />
{:else if snapshot.phase === 'connecting'}
  <section class="flex h-full flex-col" transition:fade={{ duration: 120 }}>
    <div class="flex-1">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
        Étape {snapshot.progress.current}/{snapshot.progress.total}
      </p>
      <h2 class="mt-2 text-heading-lg font-semibold leading-tight text-text-primary">
        Connectez vos sources
      </h2>
      <p class="mt-2 text-sm text-text-secondary">
        Sélectionnez les plateformes où vous avez déjà une session Chrome active. Pulse se charge du
        reste.
      </p>

      <ul class="mt-5 space-y-2">
        {#each sources as s (s.id)}
          {@const selected = snapshot.connectedSources.includes(s.id)}
          <li>
            <button
              type="button"
              aria-pressed={selected}
              onclick={() =>
                onEvent({
                  type: selected ? 'DISCONNECT_SOURCE' : 'CONNECT_SOURCE',
                  sourceId: s.id,
                })}
              class="flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-all duration-150 active:scale-[0.99] {selected
                ? 'border-blueprint-blue/40 bg-blueprint-blue/8'
                : 'border-border-light bg-surface-white hover:border-blueprint-blue/20'}"
            >
              <span class="text-sm font-medium text-text-primary">{s.name}</span>
              <span
                class="flex h-5 w-5 items-center justify-center rounded-full border transition-colors {selected
                  ? 'border-blueprint-blue bg-blueprint-blue text-white'
                  : 'border-border-light bg-surface-white'}"
              >
                {#if selected}<Icon name="check" class="h-3 w-3" />{/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    </div>

    <div
      class="sticky bottom-0 -mx-4 mt-6 flex gap-2 border-t border-border-light bg-page-canvas/95 px-4 pb-4 pt-3 backdrop-blur"
    >
      <button
        type="button"
        onclick={() => onEvent({ type: 'BACK' })}
        class="h-12 flex-1 rounded-2xl border border-border-light bg-surface-white text-sm font-medium text-text-secondary transition-colors hover:bg-subtle-gray"
      >
        Retour
      </button>
      <button
        type="button"
        disabled={snapshot.connectedSources.length === 0}
        onclick={() => onEvent({ type: 'NEXT' })}
        class="h-12 flex-[2] rounded-2xl bg-blueprint-blue text-sm font-semibold text-white transition-transform duration-150 active:scale-[0.99] enabled:hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Continuer
      </button>
    </div>
  </section>
{:else if snapshot.phase === 'wizard'}
  <section class="flex h-full flex-col" transition:fade={{ duration: 120 }}>
    <!-- 2px progress -->
    <div class="h-0.5 w-full overflow-hidden rounded-full bg-subtle-gray">
      <div
        class="h-full rounded-full bg-blueprint-blue transition-all duration-300 ease-out"
        style="width: {snapshot.wizardStep === 'identity'
          ? '33%'
          : snapshot.wizardStep === 'preferences'
            ? '66%'
            : '100%'}"
      ></div>
    </div>

    <div class="flex-1 pt-5">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">{stepLabel}</p>
      <h2 class="mt-2 text-heading-lg font-semibold leading-tight text-text-primary">
        {snapshot.wizardStep === 'identity'
          ? 'Qui êtes-vous ?'
          : snapshot.wizardStep === 'preferences'
            ? 'Quels sont vos critères ?'
            : 'Vos compétences clés'}
      </h2>
      <p class="mt-1 text-sm text-text-muted">{stepHint}</p>

      <div class="mt-5 space-y-4">
        {#if snapshot.wizardStep === 'identity'}
          <label class="block">
            <span class="text-xs font-medium text-text-secondary">Prénom</span>
            <input
              type="text"
              value={firstName}
              oninput={(e) => {
                firstName = e.currentTarget.value;
                patch({ firstName: e.currentTarget.value });
              }}
              placeholder="Alex"
              class="mt-1 h-11 w-full rounded-xl border border-border-light bg-surface-white px-3 text-sm text-text-primary outline-none transition-colors focus:border-blueprint-blue/50 focus:ring-2 focus:ring-blueprint-blue/15"
            />
          </label>
          <label class="block">
            <span class="text-xs font-medium text-text-secondary">Métier</span>
            <input
              type="text"
              value={jobTitle}
              oninput={(e) => {
                jobTitle = e.currentTarget.value;
                patch({ jobTitle: e.currentTarget.value });
              }}
              placeholder="Développeur·euse"
              class="mt-1 h-11 w-full rounded-xl border border-border-light bg-surface-white px-3 text-sm text-text-primary outline-none transition-colors focus:border-blueprint-blue/50 focus:ring-2 focus:ring-blueprint-blue/15"
            />
          </label>
          <label class="block">
            <span class="text-xs font-medium text-text-secondary">Localisation (optionnel)</span>
            <input
              type="text"
              value={location}
              oninput={(e) => {
                location = e.currentTarget.value;
                patch({ location: e.currentTarget.value });
              }}
              placeholder="Paris, France"
              class="mt-1 h-11 w-full rounded-xl border border-border-light bg-surface-white px-3 text-sm text-text-primary outline-none transition-colors focus:border-blueprint-blue/50 focus:ring-2 focus:ring-blueprint-blue/15"
            />
          </label>
        {:else if snapshot.wizardStep === 'preferences'}
          <div>
            <span class="text-xs font-medium text-text-secondary">Mode de travail</span>
            <div class="mt-2">
              <SegmentedControl
                value={snapshot.profile.remote}
                options={REMOTE_OPTIONS}
                onchange={(v) => patch({ remote: v })}
              />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label class="block">
              <span class="text-xs font-medium text-text-secondary">TJM min (€)</span>
              <input
                type="number"
                inputmode="numeric"
                min="0"
                step="50"
                bind:value={tjmMin}
                onchange={() => patch({ tjmMin: Math.max(0, Number.parseInt(tjmMin, 10) || 0) })}
                class="mt-1 h-11 w-full rounded-xl border border-border-light bg-surface-white px-3 text-sm text-text-primary outline-none transition-colors focus:border-blueprint-blue/50 focus:ring-2 focus:ring-blueprint-blue/15"
              />
            </label>
            <label class="block">
              <span class="text-xs font-medium text-text-secondary">TJM max (€)</span>
              <input
                type="number"
                inputmode="numeric"
                min="0"
                step="50"
                bind:value={tjmMax}
                onchange={() => patch({ tjmMax: Math.max(0, Number.parseInt(tjmMax, 10) || 0) })}
                class="mt-1 h-11 w-full rounded-xl border border-border-light bg-surface-white px-3 text-sm text-text-primary outline-none transition-colors focus:border-blueprint-blue/50 focus:ring-2 focus:ring-blueprint-blue/15"
              />
            </label>
          </div>
        {:else}
          <div>
            <span class="text-xs font-medium text-text-secondary">Compétences</span>
            <div class="mt-2 flex gap-2">
              <input
                type="text"
                bind:value={keywordsInput}
                onkeydown={(e) =>
                  e.key === 'Enter' && (e.preventDefault(), addKeyword(keywordsInput))}
                placeholder="Ajouter puis Entrée"
                class="h-11 flex-1 rounded-xl border border-border-light bg-surface-white px-3 text-sm text-text-primary outline-none transition-colors focus:border-blueprint-blue/50 focus:ring-2 focus:ring-blueprint-blue/15"
              />
              <button
                type="button"
                onclick={() => addKeyword(keywordsInput)}
                class="h-11 rounded-xl border border-border-light bg-surface-white px-4 text-sm font-medium text-text-secondary hover:bg-subtle-gray"
              >
                <Icon name="plus" class="h-4 w-4" />
              </button>
            </div>
            {#if snapshot.profile.keywords.length > 0}
              <div class="mt-3 flex flex-wrap gap-2">
                {#each snapshot.profile.keywords as k (k)}
                  <button
                    type="button"
                    onclick={() => removeKeyword(k)}
                    class="inline-flex h-8 items-center gap-1 rounded-full border border-blueprint-blue/30 bg-blueprint-blue/10 px-3 text-xs font-medium text-blueprint-blue"
                  >
                    {k}<Icon name="minus" class="h-3 w-3" />
                  </button>
                {/each}
              </div>
            {/if}
            <p class="mt-3 text-xs font-medium text-text-muted">Suggestions</p>
            <div class="mt-2">
              <ChipGroup
                values={snapshot.profile.keywords}
                options={SKILL_SUGGESTIONS.map((s) => ({ value: s, label: s }))}
                onchange={(_values) => {
                  const v = _values as string[];
                  patch({ keywords: v });
                }}
              />
            </div>
          </div>
        {/if}
      </div>
    </div>

    <div
      class="sticky bottom-0 -mx-4 mt-6 flex gap-2 border-t border-border-light bg-page-canvas/95 px-4 pb-4 pt-3 backdrop-blur"
    >
      <button
        type="button"
        onclick={() => onEvent({ type: 'BACK' })}
        class="h-12 flex-1 rounded-2xl border border-border-light bg-surface-white text-sm font-medium text-text-secondary hover:bg-subtle-gray"
      >
        Retour
      </button>
      <button
        type="button"
        disabled={!snapshot.canAdvance}
        onclick={() => onEvent({ type: 'NEXT' })}
        class="h-12 flex-[2] rounded-2xl bg-blueprint-blue text-sm font-semibold text-white transition-transform active:scale-[0.99] enabled:hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {snapshot.wizardStep === 'skills' ? 'Terminer' : 'Continuer'}
      </button>
    </div>
  </section>
{:else if snapshot.phase === 'notifying'}
  <!-- Bottom-sheet style notify step: benefit-first, native Toggle. -->
  <section class="flex h-full flex-col" transition:fade={{ duration: 120 }}>
    <div class="flex-1">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
        Étape {snapshot.progress.current}/{snapshot.progress.total}
      </p>
      <h2 class="mt-2 text-heading-lg font-semibold leading-tight text-text-primary">
        Soyez alerté·e
      </h2>
      <p class="mt-2 text-sm text-text-secondary">
        Recevez une notification Chrome quand une mission à haut score correspond à votre profil.
      </p>

      <div class="mt-5 rounded-2xl border border-border-light bg-surface-white p-4">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-sm font-semibold text-text-primary">Notifications de missions</p>
            <p class="mt-1 text-xs text-text-muted">
              Vous pouvez changer cela à tout moment dans les réglages.
            </p>
          </div>
          <Toggle
            checked={snapshot.notifyEnabled}
            onclick={() => onEvent({ type: 'SET_NOTIFY', enabled: !snapshot.notifyEnabled })}
          />
        </div>
      </div>
    </div>

    <div
      class="sticky bottom-0 -mx-4 mt-6 flex gap-2 border-t border-border-light bg-page-canvas/95 px-4 pb-4 pt-3 backdrop-blur"
    >
      <button
        type="button"
        onclick={() => onEvent({ type: 'BACK' })}
        class="h-12 flex-1 rounded-2xl border border-border-light bg-surface-white text-sm font-medium text-text-secondary hover:bg-subtle-gray"
      >
        Retour
      </button>
      <button
        type="button"
        onclick={() => onEvent({ type: 'NEXT' })}
        class="h-12 flex-[2] rounded-2xl bg-blueprint-blue text-sm font-semibold text-white transition-transform active:scale-[0.99] enabled:hover:brightness-105"
      >
        Lancer mon premier scan
      </button>
    </div>
  </section>
{:else if snapshot.phase === 'persisting' || snapshot.phase === 'scanning'}
  <!-- Transient I/O phases: the shell is running persist/scan. Show progress. -->
  <section
    class="flex h-full flex-col items-center justify-center text-center"
    transition:fade={{ duration: 120 }}
  >
    <div
      class="flex h-16 w-16 items-center justify-center rounded-full bg-blueprint-blue/10 text-blueprint-blue"
    >
      <Icon name="loader" class="h-7 w-7 animate-spin" />
    </div>
    <h2 class="mt-5 text-heading-lg font-semibold text-text-primary">
      {snapshot.phase === 'persisting' ? 'Enregistrement…' : 'Premier scan en cours'}
    </h2>
    <p class="mt-2 max-w-xs text-sm text-text-secondary">
      {scanningPartial
        ? 'Profil partiel — on lance quand même un scan par défaut pour vous montrer la valeur.'
        : 'Pulse récupère et score vos missions. Cela prend quelques secondes.'}
    </p>
  </section>
{:else if snapshot.phase === 'completed'}
  <section
    class="flex h-full flex-col items-center justify-center text-center"
    transition:fade={{ duration: 120 }}
  >
    <div
      class="flex h-16 w-16 items-center justify-center rounded-full {navFailed
        ? 'bg-status-orange/15 text-status-orange'
        : 'bg-accent-green/15 text-accent-green'}"
    >
      <Icon name={navFailed ? 'alert-triangle' : 'check'} class="h-8 w-8" />
    </div>
    <h2 class="mt-5 text-heading-lg font-semibold text-text-primary">
      {navFailed ? 'Finalisation impossible' : snapshot.error ? 'Presque terminé' : "C'est prêt"}
    </h2>
    <p class="mt-2 max-w-xs text-sm text-text-secondary">
      {navFailed
        ? 'La sauvegarde de votre progression a échoué. Réessayez.'
        : snapshot.error
          ? 'Une étape a échoué, mais votre feed est prêt. Vous pourrez compléter plus tard.'
          : 'Votre feed est prêt. Redirection…'}
    </p>
    {#if navFailed && onRetry}
      <button
        type="button"
        onclick={onRetry}
        class="mt-5 h-11 rounded-2xl bg-blueprint-blue px-6 text-sm font-semibold text-white transition-transform active:scale-[0.99] hover:brightness-105"
      >
        Réessayer
      </button>
    {/if}
  </section>
{/if}
