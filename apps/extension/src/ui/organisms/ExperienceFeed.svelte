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
  import { groupExperiencesByYear } from '$lib/core/cv/group-experiences';
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
  const yearGroups = $derived(groupExperiencesByYear(store.experiences));

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
      <h2 tabindex="-1" data-cv-heading class="text-body-lg font-semibold text-text-primary">
        Expériences
      </h2>
      <span class="text-caption text-text-muted">
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
        <div class="section-card space-y-2 rounded-xl p-4">
          <Skeleton width="55%" height="0.95rem" />
          <Skeleton width="35%" height="0.75rem" />
          <div class="flex items-center gap-3 pt-1">
            <Skeleton width="6.5rem" height="0.65rem" />
            <Skeleton width="4rem" height="0.65rem" />
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
        class="flex items-start gap-2 rounded-xl border border-status-red/30 bg-status-red/5 px-4 py-3 text-meta text-status-red"
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

    {#each yearGroups as group (group.year)}
      <section
        aria-label={group.year === 0 ? 'Expériences sans date' : `Expériences ${group.year}`}
      >
        <div
          class="sticky top-0 z-10 -mt-1 flex items-baseline gap-2 bg-page-canvas/95 py-1.5 backdrop-blur-sm"
        >
          <h3 class="eyebrow eyebrow--strong eyebrow--subtle">
            {group.year === 0 ? 'Sans date' : group.year}
          </h3>
          <span class="text-micro text-text-muted">
            {group.experiences.length}
            {group.experiences.length > 1 ? 'postes' : 'poste'}
          </span>
        </div>
        <ol class="relative ml-1 space-y-3 border-l border-border-light pl-4">
          {#each group.experiences as experience, i (experience.id)}
            <li
              class="relative"
              in:fly={{ y: 15, duration: 250, delay: Math.min(i * 40, 240), easing: cubicOut }}
            >
              <span
                aria-hidden="true"
                class="absolute top-6 -left-5 h-2 w-2 rounded-full border border-page-canvas bg-blueprint-blue/70"
              ></span>
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
            </li>
          {/each}
        </ol>
      </section>
    {/each}
  {/if}
</div>
