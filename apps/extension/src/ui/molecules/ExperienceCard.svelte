<script lang="ts">
  import { slide } from 'svelte/transition';
  import { Badge, Button, Icon } from '@pulse/ui';
  import type { Experience } from '$lib/core/types/profile';
  import { formatExperienceDateRange } from '$lib/core/cv/experience-helpers';
  import ExperienceEditForm, { type ExperienceFormData } from './ExperienceEditForm.svelte';

  /**
   * Single experience row. Expandable display + inline edit form.
   * Pure molecule: all mutations go through callbacks.
   */
  const {
    experience,
    isEditing = false,
    isBusy = false,
    draft = null,
    onEdit,
    onDelete,
    onSave,
    onCancelEdit,
  }: {
    experience: Experience;
    isEditing?: boolean;
    isBusy?: boolean;
    draft?: Experience | null;
    onEdit?: () => void;
    onDelete?: () => void;
    onSave?: (experience: Experience) => void;
    onCancelEdit?: () => void;
  } = $props();

  let expanded = $state(false);
  const dateRange = $derived(formatExperienceDateRange(experience));
  const hasDetails = $derived(experience.description.length > 0 || experience.skills.length > 0);

  const sourceLabel = $derived(
    experience.source === 'linkedin'
      ? 'LinkedIn'
      : experience.source === 'connector-import'
        ? 'Import connecteur'
        : 'Manuel'
  );

  function handleSave(data: ExperienceFormData) {
    if (!draft) {
      return;
    }
    onSave?.({ ...draft, ...data });
  }
</script>

<div class="section-card rounded-xl p-4">
  {#if isEditing && draft}
    <div transition:slide={{ duration: 180 }}>
      <div class="mb-3 flex items-center gap-2">
        <Icon name="edit-2" size={14} class="text-blueprint-blue" />
        <span class="text-xs font-medium text-text-secondary">
          {experience.title ? 'Modifier l’expérience' : 'Nouvelle expérience'}
        </span>
      </div>
      <ExperienceEditForm {draft} onSave={handleSave} onCancel={onCancelEdit} />
    </div>
  {:else}
    <div class="flex items-start gap-3">
      <button
        type="button"
        onclick={() => (expanded = !expanded)}
        class="flex min-w-0 flex-1 items-start gap-3 text-left"
        aria-expanded={expanded}
      >
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 class="truncate text-sm font-semibold text-text-primary">
              {experience.title || 'Sans titre'}
            </h3>
            <span class="text-xs text-text-muted">·</span>
            <span class="truncate text-sm text-text-secondary">
              {experience.company || 'Entreprise inconnue'}
            </span>
          </div>
          <div
            class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-subtle"
          >
            <span class="inline-flex items-center gap-1">
              <Icon name="calendar-clock" size={12} />
              {dateRange}
            </span>
            {#if experience.employmentType}
              <span>{experience.employmentType}</span>
            {/if}
            {#if experience.location}
              <span>{experience.location}</span>
            {/if}
            {#if experience.isCurrent}
              <Badge label="Actuel" variant="success" size="sm" />
            {/if}
          </div>
        </div>
        {#if hasDetails}
          <Icon
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            class="mt-0.5 shrink-0 text-text-muted"
          />
        {/if}
      </button>

      <div class="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" onclick={onEdit} disabled={isBusy} aria-label="Modifier">
          <Icon name="edit-2" size={14} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onclick={onDelete}
          disabled={isBusy}
          aria-label="Supprimer"
          class="hover:text-status-red"
        >
          <Icon name="trash-2" size={14} />
        </Button>
      </div>
    </div>

    {#if expanded && hasDetails}
      <div
        transition:slide={{ duration: 180 }}
        class="mt-3 space-y-3 border-t border-border-light pt-3"
      >
        {#if experience.description}
          <p class="whitespace-pre-line text-xs leading-relaxed text-text-secondary">
            {experience.description}
          </p>
        {/if}
        {#if experience.skills.length > 0}
          <div class="flex flex-wrap gap-1.5">
            {#each experience.skills as skill (skill)}
              <Badge label={skill} variant="tech" size="sm" />
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <div class="mt-2 flex items-center justify-between">
      <span class="text-[10px] uppercase tracking-wide text-text-muted">{sourceLabel}</span>
      {#if isBusy}
        <span class="inline-flex items-center gap-1 text-[10px] text-text-muted">
          <Icon name="loader-2" size={11} class="animate-spin" />
          Enregistrement…
        </span>
      {/if}
    </div>
  {/if}
</div>
