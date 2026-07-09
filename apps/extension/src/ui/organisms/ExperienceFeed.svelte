<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { Button, Icon, Skeleton } from '@pulse/ui';
  import type { CvExperienceStore } from '$lib/state/cv-experience.svelte';
  import type { Experience } from '$lib/core/types/profile';
  import ExperienceCard from '../molecules/ExperienceCard.svelte';
  import type { ExperienceFormData } from '../molecules/ExperienceEditForm.svelte';
  import OperationalEmptyState from '../molecules/OperationalEmptyState.svelte';

  const { store }: { store: CvExperienceStore } = $props();

  function blankExperience(): Experience {
    return {
      id: 'blank',
      title: '',
      company: null,
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
  const isAdding = $derived(store.editStatus === 'adding');
  const isEditing = $derived(store.editStatus === 'editing' || store.editStatus === 'error');
  const busyId = $derived(
    store.editStatus === 'saving' || store.editStatus === 'deleting' ? store.editingId : null
  );

  function handleSave(data: ExperienceFormData) {
    store.saveExperience(data as Experience);
  }
</script>

<div class="flex flex-col gap-3">
  <div class="flex items-center justify-between gap-3">
    <div class="flex items-baseline gap-2">
      <h2 class="text-sm font-semibold text-text-primary">Expériences</h2>
      <span class="text-[11px] text-text-muted">
        {store.experiences.length}
        {store.experiences.length > 1 ? 'entrées' : 'entrée'}
      </span>
    </div>
    <Button
      variant="secondary"
      size="sm"
      onclick={() => store.newExperience()}
      disabled={isAdding || isEditing || store.isSyncing}
    >
      <Icon name="file-plus" size={14} />
      Ajouter
    </Button>
  </div>

  {#if isLoading}
    {#each Array(3) as _}
      <div class="section-card rounded-xl p-4 space-y-3">
        <Skeleton width="55%" height="0.95rem" />
        <Skeleton width="35%" height="0.75rem" />
        <div class="flex gap-2">
          <Skeleton width="3rem" height="1rem" rounded="full" />
          <Skeleton width="4rem" height="1rem" rounded="full" />
        </div>
      </div>
    {/each}
  {:else if hasError}
    <OperationalEmptyState
      title="Impossible de charger vos expériences"
      description={store.error ?? 'Une erreur est survenue.'}
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
    {#if isAdding}
      <div in:fly={{ y: 12, duration: 220, easing: cubicOut }}>
        <ExperienceCard
          experience={store.draft ?? blankExperience()}
          isEditing
          draft={store.draft}
          onSave={handleSave}
          onCancelEdit={() => store.cancelEdit()}
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
        />
      </div>
    {/each}

    {#if store.experiences.length > 0}
      <p class="py-1 text-center text-[11px] text-text-muted">Tri du plus récent au plus ancien</p>
    {/if}
  {/if}
</div>
