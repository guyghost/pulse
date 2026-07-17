<script module lang="ts">
  import type {
    FocusExitRequest,
    FocusExitResult,
  } from '../../models/cv-experience-card-accessibility.machine';

  function focusConnected(element: HTMLElement | null): boolean {
    if (
      element === null ||
      !element.isConnected ||
      element.matches(':disabled') ||
      element.getAttribute('aria-disabled') === 'true'
    ) {
      return false;
    }
    try {
      element.focus();
      return document.activeElement === element;
    } catch {
      return false;
    }
  }

  /** Synchronous, closed parent port required by the reviewed accessibility model. */
  export function focusExperienceExitTarget(
    root: HTMLElement,
    request: FocusExitRequest
  ): FocusExitResult {
    const articles = Array.from(root.querySelectorAll<HTMLElement>('[data-cv-experience-article]'))
      .map((element, renderedIndex) => ({
        element,
        experienceId: element.dataset.experienceId ?? '',
        positionIndex: Number(element.dataset.positionIndex),
        renderedIndex,
      }))
      .filter((candidate) => Number.isSafeInteger(candidate.positionIndex))
      .sort(
        (left, right) =>
          left.positionIndex - right.positionIndex || left.renderedIndex - right.renderedIndex
      );

    const currentIndex = articles.findIndex(
      (candidate) => candidate.experienceId === request.experienceId
    );
    const next =
      currentIndex >= 0
        ? articles
            .slice(currentIndex + 1)
            .find((candidate) => candidate.experienceId !== request.experienceId)
        : articles.find((candidate) => candidate.positionIndex > request.positionIndex);
    if (focusConnected(next?.element ?? null)) {
      return 'next_experience_article';
    }

    const previous =
      currentIndex >= 0
        ? articles
            .slice(0, currentIndex)
            .reverse()
            .find((candidate) => candidate.experienceId !== request.experienceId)
        : [...articles]
            .reverse()
            .find((candidate) => candidate.positionIndex < request.positionIndex);
    if (focusConnected(previous?.element ?? null)) {
      return 'previous_experience_article';
    }

    if (focusConnected(root.querySelector<HTMLElement>('[data-cv-add-experience]'))) {
      return 'add_experience_button';
    }
    if (focusConnected(root.querySelector<HTMLElement>('[data-cv-heading]'))) {
      return 'cv_heading';
    }
    return null;
  }
</script>

<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { Button, Icon, Skeleton } from '@pulse/ui';
  import type { CvExperienceStore } from '$lib/state/cv-experience.svelte';
  import type { Experience } from '$lib/core/types/profile';
  import ExperienceCard from '../molecules/ExperienceCard.svelte';
  import OperationalEmptyState from '../molecules/OperationalEmptyState.svelte';

  const { store }: { store: CvExperienceStore } = $props();
  let feedRoot = $state<HTMLElement | null>(null);

  function blankExperience(): Experience {
    return {
      id: 'blank',
      title: '',
      company: null,
      employmentType: null,
      location: null,
      startDate: null,
      endDate: null,
      isCurrent: false,
      description: '',
      skills: [],
      source: 'manual',
      sourceExternalId: null,
      positionIndex: 0,
      updatedAt: 0,
    };
  }

  const isLoading = $derived(store.feedStatus === 'loading');
  const hasError = $derived(store.feedStatus === 'error' && store.experiences.length === 0);
  const isAdding = $derived(
    store.editStatus === 'adding' || (store.editStatus === 'error' && store.editingId === null)
  );
  const isEditing = $derived(
    store.editStatus === 'editing' || (store.editStatus === 'error' && store.editingId !== null)
  );
  const showEditError = $derived(store.editStatus === 'error' && Boolean(store.editError));
  const busyId = $derived(
    store.editStatus === 'saving' || store.editStatus === 'deleting' ? store.editingId : null
  );

  function handleSave(experience: Experience) {
    store.saveExperience(experience);
  }

  function handleFocusExitRequest(request: FocusExitRequest): FocusExitResult {
    return feedRoot === null ? null : focusExperienceExitTarget(feedRoot, request);
  }
</script>

<div bind:this={feedRoot} class="flex flex-col gap-3">
  <div class="flex items-center justify-between gap-3">
    <div class="flex items-baseline gap-2">
      <h2 tabindex="-1" data-cv-heading class="text-sm font-semibold text-text-primary">
        Expériences
      </h2>
      <span class="text-[11px] text-text-muted">
        {store.experiences.length}
        {store.experiences.length > 1 ? 'entrées' : 'entrée'}
      </span>
    </div>
    <Button
      variant="secondary"
      size="sm"
      aria-label="Ajouter une expérience"
      onclick={() => store.newExperience()}
      disabled={isAdding || isEditing || store.isSyncing}
      data-cv-add-experience
    >
      <Icon name="file-plus" size={14} />
      Ajouter
    </Button>
  </div>

  {#if isLoading}
    <div aria-busy="true" role="status" aria-live="polite" class="flex flex-col gap-3">
      <span class="sr-only">Chargement de vos expériences…</span>
      {#each Array(3) as _, i (i)}
        <div class="section-card rounded-xl p-4 space-y-3">
          <Skeleton width="55%" height="0.95rem" />
          <Skeleton width="35%" height="0.75rem" />
          <div class="flex gap-2">
            <Skeleton width="3rem" height="1rem" variant="circle" />
            <Skeleton width="4rem" height="1rem" variant="circle" />
          </div>
        </div>
      {/each}
    </div>
  {:else if hasError}
    <OperationalEmptyState
      title="Impossible de charger vos expériences"
      description={store.feedError ?? 'Une erreur est survenue.'}
      severity="critical"
      statusLabel="Erreur"
      icon="triangle-alert"
      proofLabel="État"
      proofValue="Feed indisponible"
      primaryActionLabel="Réessayer"
      primaryActionIcon="refresh-cw"
      onPrimaryAction={() => store.reload()}
    />
  {:else if store.experiences.length === 0 && !isAdding}
    <OperationalEmptyState
      title="Renseignez vos expériences professionnelles"
      description="Ajoutez chaque poste pour construire votre CV, puis synchronisez-le vers vos plateformes connectées."
      severity="neutral"
      statusLabel="CV vide"
      icon="file-text"
      proofLabel="Expériences"
      proofValue="0 entrée"
      primaryActionLabel="Ajouter une expérience"
      primaryActionIcon="file-plus"
      onPrimaryAction={() => store.newExperience()}
    />
  {:else}
    {#if showEditError}
      <div
        role="alert"
        aria-live="assertive"
        class="flex items-start gap-2 rounded-xl border border-status-red/30 bg-status-red/5 px-4 py-3 text-xs text-status-red"
      >
        <Icon name="triangle-alert" size={14} />
        <span class="flex-1">{store.editError}</span>
      </div>
    {/if}

    {#if isAdding}
      <div in:fly={{ y: 12, duration: 220, easing: cubicOut }}>
        <ExperienceCard
          experience={store.draft ?? blankExperience()}
          isEditing
          draft={store.draft}
          onSave={handleSave}
          onCancelEdit={() => store.cancelEdit()}
          onFocusExitRequest={handleFocusExitRequest}
        />
      </div>
    {/if}

    {#each store.experiences as experience, i (experience.id)}
      <div in:fly={{ y: 15, duration: 250, delay: Math.min(i * 40, 240), easing: cubicOut }}>
        <ExperienceCard
          {experience}
          isEditing={isEditing && store.editingId === experience.id}
          isBusy={busyId === experience.id}
          draft={store.editingId === experience.id ? store.draft : null}
          onEdit={() => store.editExperience(experience.id)}
          onDelete={() => store.deleteExperience(experience.id)}
          onSave={handleSave}
          onCancelEdit={() => store.cancelEdit()}
          onFocusExitRequest={handleFocusExitRequest}
        />
      </div>
    {/each}

    {#if store.experiences.length > 0}
      <p class="py-1 text-center text-[11px] text-text-muted">Tri du plus récent au plus ancien</p>
    {/if}
  {/if}
</div>
