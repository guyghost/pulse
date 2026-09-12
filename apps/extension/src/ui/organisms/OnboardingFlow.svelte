<script lang="ts">
  /**
   * Flow renderer. Consumes a pure {@link OnboardingFlowSnapshot} and reports
   * user intent via {@link onEvent}. It NEVER holds wizard/phase state locally
   * and NEVER decides a transition — the flow machine (via the page controller)
   * is the single source of truth. "The model decides."
   */
  import { SegmentedControl, ChipGroup, Toggle, Icon } from '@pulse/ui';
  import { fade } from 'svelte/transition';
  import OnboardingWelcome from './OnboardingWelcome.svelte';
  import type {
    OnboardingFlowEvent,
    OnboardingFlowSnapshot,
    OnboardingProfileDraft,
  } from '../../models/onboarding-flow.machine';
  import type { RemoteType } from '$lib/core/types/mission';
  import { previewOnboardingMatch, REFERENCE_MISSION } from '$lib/core/scoring/onboarding-preview';
  import { scoreToGrade } from '$lib/core/types/score';

  const {
    snapshot,
    sources,
    onEvent,
    onRetry,
    navFailed = false,
    sourceVerifications = {},
    onVerifySource = null,
    onOpenSource = null,
  }: {
    snapshot: OnboardingFlowSnapshot;
    sources: { id: string; name: string }[];
    onEvent: (event: OnboardingFlowEvent) => void;
    onRetry?: () => void;
    navFailed?: boolean;
    /** P0-B — état de vérification de session par source (absent = idle). */
    sourceVerifications?: Record<string, 'ready' | 'session-missing' | 'unavailable' | 'checking'>;
    onVerifySource?: ((sourceId: string) => void) | null;
    onOpenSource?: ((sourceId: string) => void) | null;
  } = $props();

  // Local mirrors of inputs, synced FROM the snapshot (single source of truth).
  // These exist only so <input bind:> can update the DOM immediately; every
  // change is also pushed to the machine via UPDATE_PROFILE so the guard stays
  // authoritative.
  let firstName = $state('');
  let jobTitle = $state('');
  let location = $state('');
  let tjmMin = $state('');
  let keywordsInput = $state('');

  // Re-sync when the snapshot profile changes externally (e.g. back-nav).
  $effect(() => {
    firstName = snapshot.profile.firstName;
    jobTitle = snapshot.profile.jobTitle;
    location = snapshot.profile.location;
    tjmMin = String(snapshot.profile.tjmMin);
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
  const progressPercent = $derived(
    Math.round((snapshot.progress.current / snapshot.progress.total) * 100)
  );

  // Live preview (models/onboarding-live-preview.model.md): read-only
  // projection of the draft onto the reference mission. No persistence.
  const preview = $derived(
    previewOnboardingMatch({
      tjmMin: snapshot.profile.tjmMin,
      tjmMax: snapshot.profile.tjmMax,
      remote: snapshot.profile.remote,
      keywords: snapshot.profile.keywords,
      location: snapshot.profile.location,
    })
  );
  const previewGradeClass = $derived(
    preview.grade === 'A'
      ? 'bg-accent-green/10 text-accent-green'
      : preview.grade === 'B'
        ? 'bg-blueprint-blue/10 text-blueprint-blue-on-tint'
        : preview.grade === 'C'
          ? 'bg-status-yellow/15 text-status-orange'
          : 'bg-subtle-gray text-text-subtle'
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
      <p class="eyebrow eyebrow--caption">
        Étape {snapshot.progress.current}/{snapshot.progress.total}
      </p>
      <h2 class="mt-2 text-heading-lg font-semibold leading-tight text-text-primary">
        Connectez vos sources
      </h2>
      <p class="mt-2 text-sm text-text-secondary">
        Pulse vérifie qu'une session Chrome active existe pour chaque plateforme. Sans session, la
        source ne peut pas remonter vos missions.
      </p>

      <ul class="mt-5 space-y-2">
        {#each sources as s (s.id)}
          {@const ready = snapshot.connectedSources.includes(s.id)}
          {@const verification = sourceVerifications[s.id]}
          <li>
            <div
              class="flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 {ready
                ? 'border-blueprint-blue/40 bg-blueprint-blue/8'
                : 'border-border-light bg-surface-white'}"
            >
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium text-text-primary">{s.name}</span>
                <span
                  class="mt-0.5 flex items-center gap-1.5 text-caption leading-4 {ready
                    ? 'text-blueprint-blue-on-tint'
                    : verification === 'checking'
                      ? 'text-text-subtle'
                      : verification === 'session-missing'
                        ? 'text-status-orange'
                        : verification === 'unavailable'
                          ? 'text-text-muted'
                          : 'text-text-subtle'}"
                >
                  {#if ready}
                    <Icon name="check" size={12} />
                    Session détectée
                  {:else if verification === 'checking'}
                    <Icon name="loader-2" size={12} class="animate-spin" />
                    Vérification…
                  {:else if verification === 'session-missing'}
                    Pas de session — connectez-vous puis revenez ici
                  {:else if verification === 'unavailable'}
                    Vérification impossible
                  {:else}
                    Session Chrome requise
                  {/if}
                </span>
              </span>
              <span class="flex shrink-0 items-center gap-2">
                {#if !ready && verification === 'session-missing' && onOpenSource}
                  <button
                    type="button"
                    class="inline-flex items-center gap-1.5 rounded-lg border border-blueprint-blue/25 bg-blueprint-blue/10 px-3 py-1.5 text-caption font-medium text-blueprint-blue-on-tint transition-colors hover:bg-blueprint-blue/20"
                    onclick={() => onOpenSource(s.id)}
                  >
                    <Icon name="external-link" size={12} />
                    Ouvrir {s.name}
                  </button>
                {/if}
                {#if !ready && (verification === 'unavailable' || verification === undefined) && onVerifySource}
                  <button
                    type="button"
                    class="inline-flex items-center gap-1.5 rounded-lg border border-border-light px-3 py-1.5 text-caption font-medium text-text-secondary transition-colors hover:bg-page-canvas hover:text-text-primary {verification ===
                    'unavailable'
                      ? ''
                      : 'border-blueprint-blue/25 bg-blueprint-blue/10 text-blueprint-blue-on-tint hover:bg-blueprint-blue/20'}"
                    onclick={() => onVerifySource(s.id)}
                  >
                    {#if verification === 'unavailable'}
                      <Icon name="refresh-cw" size={12} />
                      Réessayer
                    {:else}
                      <Icon name="plug" size={12} />
                      Connecter
                    {/if}
                  </button>
                {/if}
                {#if ready}
                  <span
                    class="flex h-5 w-5 items-center justify-center rounded-full border border-blueprint-blue bg-blueprint-blue text-white"
                    aria-hidden="true"
                  >
                    <Icon name="check" class="h-3 w-3" />
                  </span>
                {/if}
              </span>
            </div>
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
        class="h-12 flex-1 rounded-lg border border-border-light bg-surface-white text-sm font-medium text-text-secondary transition-colors hover:bg-subtle-gray"
      >
        Retour
      </button>
      <button
        type="button"
        disabled={snapshot.connectedSources.length === 0}
        onclick={() => onEvent({ type: 'NEXT' })}
        class="h-12 flex-[2] rounded-lg bg-blueprint-blue text-sm font-semibold text-white transition-transform duration-150 active:scale-[0.99] enabled:hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Continuer
      </button>
    </div>
    {#if snapshot.connectedSources.length === 0}
      <div class="-mx-4 flex flex-col items-center gap-1 px-4 pb-4">
        <button
          type="button"
          onclick={() => onEvent({ type: 'SKIP' })}
          class="cursor-pointer text-caption font-medium text-text-subtle underline decoration-border-light underline-offset-4 transition-colors hover:text-text-primary"
        >
          Continuer sans source
        </button>
        <p class="text-center text-micro leading-4 text-text-muted">
          Vous pourrez connecter une plateforme plus tard. Le premier scan risque de ne rien
          remonter.
        </p>
      </div>
    {:else}
      <!-- B-opt : la valeur d'abord — scanner dès qu'une session est prouve, le wizard après. -->
      <div class="-mx-4 flex flex-col items-center gap-1 px-4 pb-4">
        <button
          type="button"
          onclick={() => onEvent({ type: 'SKIP' })}
          class="cursor-pointer text-caption font-medium text-blueprint-blue-on-tint underline decoration-blueprint-blue/30 underline-offset-4 transition-colors hover:text-blueprint-blue"
        >
          Scanner maintenant
        </button>
        <p class="text-center text-micro leading-4 text-text-muted">
          Scan partiel avec vos sources connectées — affinez le profil ensuite.
        </p>
      </div>
    {/if}
  </section>
{:else if snapshot.phase === 'wizard'}
  <section class="flex h-full flex-col" transition:fade={{ duration: 120 }}>
    <div
      class="h-0.5 w-full overflow-hidden rounded-full bg-subtle-gray"
      role="progressbar"
      aria-label={`Progression de la configuration : étape ${snapshot.progress.current} sur ${snapshot.progress.total}`}
      aria-valuemin="0"
      aria-valuemax={snapshot.progress.total}
      aria-valuenow={snapshot.progress.current}
    >
      <div
        class="h-full rounded-full bg-blueprint-blue transition-all duration-300 ease-out"
        style={`width: ${progressPercent}%`}
      ></div>
    </div>

    <div class="flex-1 pt-5">
      <p class="eyebrow eyebrow--caption">
        Étape {snapshot.progress.current}/{snapshot.progress.total} · {stepLabel}
      </p>
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
          <label class="block">
            <span class="text-xs font-medium text-text-secondary">TJM minimum (€)</span>
            <input
              type="number"
              inputmode="numeric"
              min="0"
              step="50"
              bind:value={tjmMin}
              oninput={() => patch({ tjmMin: Math.max(0, Number.parseInt(tjmMin, 10) || 0) })}
              class="mt-1 h-11 w-full rounded-xl border border-border-light bg-surface-white px-3 text-sm text-text-primary outline-none transition-colors focus:border-blueprint-blue/50 focus:ring-2 focus:ring-blueprint-blue/15"
            />
            <span class="mt-1 block text-xs text-text-muted">
              Votre plancher. Pas de limite haute : toute mission au-dessus est acceptable.
            </span>
          </label>

          <aside
            aria-label="Aperçu de correspondance"
            class="rounded-lg border border-border-light bg-surface-white p-4"
          >
            <p class="eyebrow eyebrow--caption">Aperçu en direct</p>
            <div class="mt-2 flex items-center gap-3">
              <span
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl {previewGradeClass} text-heading font-semibold"
                aria-hidden="true"
              >
                {preview.grade}
              </span>
              <span class="min-w-0">
                <span class="block truncate text-sm font-semibold text-text-primary">
                  {preview.label}
                </span>
                <span class="mt-0.5 block truncate text-xs text-text-muted">
                  {REFERENCE_MISSION.title}
                </span>
              </span>
            </div>
            <p class="mt-2 text-xs text-text-muted">
              Note d’une mission type du marché selon vos critères. Ajustez TJM, mobilité ou
              compétences pour la voir évoluer.
            </p>
          </aside>
        {:else if snapshot.wizardStep === 'skills'}
          <div>
            <label for="onboarding-skill-input" class="text-xs font-medium text-text-secondary"
              >Compétences</label
            >
            <div class="mt-2 flex gap-2">
              <input
                id="onboarding-skill-input"
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
                aria-label="Ajouter la compétence"
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
                    aria-label={`Retirer ${k}`}
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
        class="h-12 flex-1 rounded-lg border border-border-light bg-surface-white text-sm font-medium text-text-secondary hover:bg-subtle-gray"
      >
        Retour
      </button>
      <button
        type="button"
        disabled={!snapshot.canAdvance}
        onclick={() => onEvent({ type: 'NEXT' })}
        class="h-12 flex-[2] rounded-lg bg-blueprint-blue text-sm font-semibold text-white transition-transform active:scale-[0.99] enabled:hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Continuer
      </button>
    </div>
  </section>
{:else if snapshot.phase === 'notifying'}
  <!-- Bottom-sheet style notify step: benefit-first, native Toggle. -->
  <section class="flex h-full flex-col" transition:fade={{ duration: 120 }}>
    <div class="flex-1">
      <p class="eyebrow eyebrow--caption">
        Étape {snapshot.progress.current}/{snapshot.progress.total}
      </p>
      <h2 class="mt-2 text-heading-lg font-semibold leading-tight text-text-primary">
        Soyez alerté·e
      </h2>
      <p class="mt-2 text-sm text-text-secondary">
        Recevez une notification Chrome quand une mission notée A correspond à votre profil.
      </p>

      <div class="mt-5 rounded-lg border border-border-light bg-surface-white p-4">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-sm font-semibold text-text-primary">Notifications de missions</p>
            <p class="mt-1 text-xs text-text-muted">
              Vous pouvez changer cela à tout moment dans les réglages.
            </p>
          </div>
          <Toggle
            checked={snapshot.notifyEnabled}
            aria-label={snapshot.notifyEnabled
              ? 'Désactiver les notifications de missions'
              : 'Activer les notifications de missions'}
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
        class="h-12 flex-1 rounded-lg border border-border-light bg-surface-white text-sm font-medium text-text-secondary hover:bg-subtle-gray"
      >
        Retour
      </button>
      <button
        type="button"
        onclick={() => onEvent({ type: 'NEXT' })}
        class="h-12 flex-[2] rounded-lg bg-blueprint-blue text-sm font-semibold text-white transition-transform active:scale-[0.99] enabled:hover:brightness-105"
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
        ? 'Profil partiel — un scan par défaut est lancé pour découvrir les premières missions.'
        : 'Pulse récupère et note vos missions. Cela prend quelques secondes.'}
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
      {navFailed ? 'Finalisation impossible' : snapshot.error ? 'Presque terminé' : 'C’est prêt'}
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
        class="mt-5 h-11 rounded-lg bg-blueprint-blue px-6 text-sm font-semibold text-white transition-transform active:scale-[0.99] hover:brightness-105"
      >
        Réessayer
      </button>
    {/if}
  </section>
{/if}
