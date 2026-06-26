<script lang="ts">
  import type { UserProfile } from '$lib/core/types/profile';
  import { Chip } from '@pulse/ui';
  import { Icon } from '@pulse/ui';
  import { ripple } from '../actions/ripple';
  import OperationalStatusBadge from '../atoms/OperationalStatusBadge.svelte';
  import { normalizeProfileDraft } from '$lib/core/profile/normalize-profile';
  import {
    DEFAULT_CONNECTED_ALERT_PREFERENCES,
    type ConnectedAlertPreferences,
  } from '$lib/core/types/alert-preferences';

  type OnboardingStepId = 'understand' | 'source' | 'activity' | 'alert' | 'insight';

  type OnboardingStep = {
    id: OnboardingStepId;
    label: string;
    description: string;
  };

  const {
    onComplete,
    onSkip,
    onUpdateProfile,
    onRetry,
    isSaving = false,
    hasError = false,
    errorMessage = null,
    alertPreferences = DEFAULT_CONNECTED_ALERT_PREFERENCES,
    isSavingAlertPreferences = false,
    onSaveAlertPreferences,
  }: {
    onComplete?: (profile: UserProfile) => void;
    onSkip?: () => void;
    onUpdateProfile?: (profile: Partial<UserProfile>) => void;
    onRetry?: () => void;
    isSaving?: boolean;
    hasError?: boolean;
    errorMessage?: string | null;
    alertPreferences?: ConnectedAlertPreferences;
    isSavingAlertPreferences?: boolean;
    onSaveAlertPreferences?: (preferences: ConnectedAlertPreferences) => Promise<void> | void;
  } = $props();

  let firstName = $state('');
  let jobTitle = $state('');
  let location = $state('');
  let stack = $state<string[]>([]);
  let stackInput = $state('');
  let tjm = $state(600);
  let currentStep = $state<OnboardingStepId>('understand');
  let alertThreshold = $state(80);
  let selectedSource = $state('Free-Work');
  let loadedAlertRevision = $state(-1);

  const onboardingSteps: OnboardingStep[] = [
    {
      id: 'understand',
      label: 'Comprendre Pulse',
      description: 'Commencez par la plateforme à scanner en premier.',
    },
    {
      id: 'source',
      label: 'Connecter une source',
      description: 'Pulse utilise vos sessions Chrome, sans stocker d’identifiants.',
    },
    {
      id: 'activity',
      label: 'Observer une activité',
      description: 'Les missions récupérées sont classées par priorité.',
    },
    {
      id: 'alert',
      label: 'Créer une alerte',
      description: 'Les missions fortes remontent avant le reste du feed.',
    },
    {
      id: 'insight',
      label: 'Recevoir un insight',
      description: 'Pulse explique la prochaine action.',
    },
  ];

  const currentStepIndex = $derived(onboardingSteps.findIndex((step) => step.id === currentStep));
  const currentStepDefinition = $derived(onboardingSteps[currentStepIndex] ?? onboardingSteps[0]);

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
    const result = normalizeProfileDraft({
      firstName,
      jobTitle,
      location,
      stack,
      tjmMin: tjm,
      tjmMax: tjm + 150,
      remote: 'any',
      seniority: 'senior',
      searchKeywords: [],
    });

    if (result.ok && result.profile) {
      onUpdateProfile?.(result.profile);
      onComplete?.(result.profile);
    }
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

  function goNext() {
    const next = onboardingSteps[currentStepIndex + 1];
    if (!next) {
      return;
    }
    currentStep = next.id;
  }

  function goTo(stepId: OnboardingStepId) {
    currentStep = stepId;
  }

  $effect(() => {
    if (alertPreferences.revision === loadedAlertRevision) {
      return;
    }
    alertThreshold = alertPreferences.scoreThreshold;
    loadedAlertRevision = alertPreferences.revision;
  });

  async function saveAlertAndContinue() {
    await onSaveAlertPreferences?.({
      ...alertPreferences,
      enabled: true,
      scoreThreshold: alertThreshold,
      minDailyRate: tjm,
      requiredStacks: stack,
      maxResults: 5,
      mutedUntil: null,
    });
    goNext();
  }
</script>

<div class="space-y-5 pb-2">
  <section class="rounded-xl border border-border-light bg-surface-white p-3">
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="text-[10px] font-semibold uppercase tracking-[0.15em] text-blueprint-blue">
          Premier lancement
        </p>
        <h2 class="mt-1 text-sm font-semibold text-text-primary">
          {currentStepDefinition.label}
        </h2>
        <p class="mt-1 text-xs leading-5 text-text-subtle">
          {currentStepDefinition.description}
        </p>
        <div class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
          <span
            class="inline-flex items-center gap-1 rounded-md border border-border-light bg-page-canvas px-2 py-1"
          >
            <Icon name="clock" size={11} />
            2 minutes
          </span>
          <span
            class="inline-flex items-center gap-1 rounded-md border border-border-light bg-page-canvas px-2 py-1"
          >
            <Icon name="pencil" size={11} />
            Modifiable ensuite
          </span>
        </div>
      </div>
      <div class="flex shrink-0 flex-col items-end gap-2">
        <OperationalStatusBadge
          label={`${currentStepIndex + 1}/${onboardingSteps.length}`}
          severity="attention"
        />
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-lg border border-border-light bg-page-canvas px-2 py-1 text-[11px] font-medium text-text-subtle transition-colors hover:bg-surface-white hover:text-text-primary"
          onclick={onSkip}
          aria-label="Passer l’onboarding"
        >
          Voir le feed
          <Icon name="x" size={11} />
        </button>
      </div>
    </div>

    <div class="mt-4 grid grid-cols-5 gap-1" aria-label="Progression onboarding">
      {#each onboardingSteps as step, index}
        <button
          type="button"
          class="h-1.5 rounded-full transition-colors {index <= currentStepIndex
            ? 'bg-blueprint-blue'
            : 'bg-subtle-gray'}"
          aria-label={step.label}
          aria-current={step.id === currentStep ? 'step' : undefined}
          onclick={() => goTo(step.id)}
        ></button>
      {/each}
    </div>
  </section>

  {#if currentStep === 'understand'}
    <section class="rounded-xl border border-blueprint-blue/15 bg-blueprint-blue/6 p-4">
      <div class="flex items-start gap-3">
        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blueprint-blue/10 text-blueprint-blue"
        >
          <Icon name="radar" size={16} />
        </div>
        <div>
          <p class="text-sm font-semibold text-text-primary">
            Choisissez la première plateforme à scanner.
          </p>
          <p class="mt-1 text-xs leading-5 text-text-subtle">
            Pulse récupère les missions depuis vos sessions Chrome, puis affiche celles à traiter en
            premier.
          </p>
          <button
            class="mt-3 inline-flex items-center gap-2 rounded-lg bg-blueprint-blue px-3 py-2 text-xs font-medium text-white"
            type="button"
            onclick={goNext}
          >
            Configurer le radar
            <Icon name="arrow-right" size={13} />
          </button>
        </div>
      </div>
    </section>
  {:else if currentStep === 'source'}
    <section class="rounded-xl border border-border-light bg-surface-white p-4">
      <p class="text-sm font-semibold text-text-primary">
        Choisissez la première source à vérifier
      </p>
      <p class="mt-1 text-xs leading-5 text-text-subtle">
        Pulse utilisera vos sessions navigateur existantes. Aucun identifiant n’est stocké.
      </p>
      <div class="mt-3 grid grid-cols-2 gap-2">
        {#each ['Free-Work', 'LeHibou', 'Hiway', 'Collective'] as source}
          <button
            type="button"
            class="rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors {selectedSource ===
            source
              ? 'border-blueprint-blue/25 bg-blueprint-blue/8 text-blueprint-blue'
              : 'border-border-light bg-page-canvas text-text-primary'}"
            onclick={() => (selectedSource = source)}
          >
            {source}
          </button>
        {/each}
      </div>
      <button
        class="mt-3 inline-flex items-center gap-2 rounded-lg bg-blueprint-blue px-3 py-2 text-xs font-medium text-white"
        type="button"
        onclick={goNext}
      >
        Continuer avec {selectedSource}
        <Icon name="arrow-right" size={13} />
      </button>
    </section>
  {:else if currentStep === 'activity'}
    <section class="rounded-xl border border-border-light bg-surface-white p-4">
      <p class="text-sm font-semibold text-text-primary">Le premier scan classera vos missions</p>
      <div class="mt-3 space-y-2">
        <div class="rounded-lg border border-border-light bg-page-canvas px-3 py-2">
          <p class="text-xs font-medium text-text-primary">Mission prioritaire détectée</p>
          <p class="mt-0.5 text-[11px] text-text-subtle">Score 86, stack forte, TJM compatible.</p>
        </div>
        <div class="rounded-lg border border-status-orange/20 bg-status-orange/8 px-3 py-2">
          <p class="text-xs font-medium text-status-orange">Source à vérifier</p>
          <p class="mt-0.5 text-[11px] text-text-subtle">
            Si une source casse, Pulse affiche l’impact avant les résultats.
          </p>
        </div>
      </div>
      <button
        class="mt-3 inline-flex items-center gap-2 rounded-lg bg-blueprint-blue px-3 py-2 text-xs font-medium text-white"
        type="button"
        onclick={goNext}
      >
        Créer une première alerte
        <Icon name="arrow-right" size={13} />
      </button>
    </section>
  {:else if currentStep === 'alert'}
    <section class="rounded-xl border border-border-light bg-surface-white p-4">
      <label for="ob-alert-threshold" class="text-sm font-semibold text-text-primary">
        Alerte prioritaire
      </label>
      <p class="mt-1 text-xs leading-5 text-text-subtle">
        Les missions au-dessus de ce score doivent apparaître comme action à traiter.
      </p>
      <div class="mt-3 flex items-center gap-3">
        <input
          id="ob-alert-threshold"
          type="range"
          min="60"
          max="95"
          step="5"
          class="flex-1"
          bind:value={alertThreshold}
        />
        <span
          class="w-12 text-right font-mono text-sm font-semibold tabular-nums text-text-primary"
        >
          {alertThreshold}+
        </span>
      </div>
      <button
        class="mt-3 inline-flex items-center gap-2 rounded-lg bg-blueprint-blue px-3 py-2 text-xs font-medium text-white"
        type="button"
        onclick={saveAlertAndContinue}
        disabled={isSavingAlertPreferences}
      >
        {isSavingAlertPreferences ? 'Sauvegarde...' : 'Voir le premier insight'}
        <Icon name={isSavingAlertPreferences ? 'loader' : 'arrow-right'} size={13} />
      </button>
    </section>
  {:else if currentStep === 'insight'}
    <section class="rounded-xl border border-accent-green/20 bg-accent-green/6 p-4">
      <div class="flex items-start gap-3">
        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-green/10 text-accent-green"
        >
          <Icon name="lightbulb" size={16} />
        </div>
        <div>
          <p class="text-sm font-semibold text-text-primary">Action recommandée après le scan</p>
          <p class="mt-1 text-xs leading-5 text-text-subtle">
            Commencer par les missions {alertThreshold}+ issues de {selectedSource}, puis vérifier
            les sources qui n’ont rien remonté.
          </p>
        </div>
      </div>
    </section>
  {/if}

  <div class="space-y-2">
    <div>
      <p class="text-sm font-semibold text-text-primary">Personnalisez vos résultats</p>
      <p class="mt-1 text-xs leading-relaxed text-text-secondary">
        Cette étape est facultative. Ajoutez au moins votre poste et votre stack pour mieux classer
        les missions.
      </p>
    </div>
  </div>

  <div>
    <label for="ob-firstname" class="mb-2 block text-xs uppercase tracking-[0.18em] text-text-muted"
      >Prénom</label
    >
    <input
      id="ob-firstname"
      type="text"
      class="soft-ring w-full rounded-lg border border-border-light bg-page-canvas px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-blueprint-blue/30 focus:ring-2 focus:ring-blueprint-blue/15 transition-all duration-200"
      placeholder="ex: Camille"
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
      placeholder="ex: Développeur React Senior"
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
        aria-label="Ajouter la stack technique"
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
      Passer et voir le feed
    </button>
  </div>
</div>
