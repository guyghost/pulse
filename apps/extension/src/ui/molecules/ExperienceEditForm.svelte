<script lang="ts">
  import { untrack } from 'svelte';
  import { Button, Icon } from '@pulse/ui';
  import type { Experience } from '$lib/core/types/profile';

  /**
   * Inline add/edit form for a single experience. Pure molecule: receives a
   * draft (or null for a new entry) and emits save/cancel via callbacks.
   */
  const {
    draft = null,
    isBusy = false,
    onSave,
    onCancel,
  }: {
    draft?: Experience | null;
    isBusy?: boolean;
    onSave?: (data: ExperienceFormData) => void;
    onCancel?: () => void;
  } = $props();

  export interface ExperienceFormData {
    title: string;
    company: string;
    employmentType: string;
    location: string;
    startDate: string | null;
    endDate: string | null;
    isCurrent: boolean;
    description: string;
    skills: string[];
  }

  function snapshotDraft(value: Experience | null): Experience | null {
    return value === null ? null : { ...value, skills: [...value.skills] };
  }

  function draftsEqual(left: Experience | null, right: Experience | null): boolean {
    if (left === null || right === null) {
      return left === right;
    }
    return (
      left.id === right.id &&
      left.title === right.title &&
      left.company === right.company &&
      left.employmentType === right.employmentType &&
      left.location === right.location &&
      left.startDate === right.startDate &&
      left.endDate === right.endDate &&
      left.isCurrent === right.isCurrent &&
      left.description === right.description &&
      left.skills.length === right.skills.length &&
      left.skills.every((skill, index) => skill === right.skills[index]) &&
      left.source === right.source &&
      left.sourceExternalId === right.sourceExternalId &&
      left.positionIndex === right.positionIndex &&
      left.updatedAt === right.updatedAt
    );
  }

  // Capture the initial snapshot, then reconcile only when the parent commits
  // a genuinely different immutable draft. Local edits therefore survive
  // capability-only rerenders while true-to-true replacements cannot go stale.
  let title = $state(untrack(() => draft?.title ?? ''));
  let company = $state(untrack(() => draft?.company ?? ''));
  let employmentType = $state(untrack(() => draft?.employmentType ?? ''));
  let location = $state(untrack(() => draft?.location ?? ''));
  let startDate = $state(untrack(() => draft?.startDate ?? ''));
  let endDate = $state(untrack(() => draft?.endDate ?? ''));
  let isCurrent = $state(untrack(() => draft?.isCurrent ?? false));
  let description = $state(untrack(() => draft?.description ?? ''));
  let skillsText = $state(untrack(() => (draft?.skills ?? []).join(', ')));

  let touched = $state(false);
  let appliedDraft = $state.raw(untrack(() => snapshotDraft(draft)));

  $effect.pre(() => {
    const nextDraft = snapshotDraft(draft);
    if (draftsEqual(appliedDraft, nextDraft)) {
      return;
    }
    appliedDraft = nextDraft;
    title = nextDraft?.title ?? '';
    company = nextDraft?.company ?? '';
    employmentType = nextDraft?.employmentType ?? '';
    location = nextDraft?.location ?? '';
    startDate = nextDraft?.startDate ?? '';
    endDate = nextDraft?.endDate ?? '';
    isCurrent = nextDraft?.isCurrent ?? false;
    description = nextDraft?.description ?? '';
    skillsText = (nextDraft?.skills ?? []).join(', ');
    touched = false;
  });

  const titleError = $derived(touched && title.trim().length === 0 ? 'Le titre est requis.' : '');
  const companyError = $derived(
    touched && company.trim().length === 0 ? 'L’entreprise est requise.' : ''
  );
  const startDateError = $derived(
    touched && startDate.trim().length === 0 ? 'La date de début est requise.' : ''
  );
  // End date is optional for past roles — the user may not remember the exact
  // month. Only validate format when a value is provided.
  function handleSubmit() {
    if (isBusy || typeof onSave !== 'function') {
      return;
    }
    touched = true;
    const skills = skillsText
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    onSave({
      title: title.trim(),
      company: company.trim(),
      employmentType: employmentType.trim(),
      location: location.trim(),
      startDate: startDate.trim() || null,
      endDate: isCurrent ? null : endDate.trim() || null,
      isCurrent,
      description: description.trim(),
      skills,
    });
  }

  function handleCancel(): void {
    if (!isBusy) {
      onCancel?.();
    }
  }

  function handleCurrentToggle(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    isCurrent = target.checked;
    if (isCurrent) {
      endDate = '';
    }
  }
</script>

<form
  onsubmit={(event) => {
    event.preventDefault();
    handleSubmit();
  }}
  class="space-y-3"
>
  <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
    <label class="flex flex-col gap-1">
      <span class="text-[11px] font-medium text-text-secondary">Titre du poste</span>
      <input
        bind:value={title}
        oninput={() => (touched = true)}
        type="text"
        data-experience-control="title"
        data-experience-focus="title"
        placeholder="Lead Frontend"
        class="rounded-lg border border-border-light bg-surface-white px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-blueprint-blue focus:outline-none focus:ring-2 focus:ring-blueprint-blue/20"
        aria-invalid={Boolean(titleError)}
      />
      {#if titleError}
        <span class="text-[11px] text-status-red">{titleError}</span>
      {/if}
    </label>
    <label class="flex flex-col gap-1">
      <span class="text-[11px] font-medium text-text-secondary">Entreprise</span>
      <input
        bind:value={company}
        oninput={() => (touched = true)}
        type="text"
        data-experience-focus="company"
        placeholder="Acme"
        class="rounded-lg border border-border-light bg-surface-white px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-blueprint-blue focus:outline-none focus:ring-2 focus:ring-blueprint-blue/20"
        aria-invalid={Boolean(companyError)}
      />
      {#if companyError}
        <span class="text-[11px] text-status-red">{companyError}</span>
      {/if}
    </label>
    <label class="flex flex-col gap-1">
      <span class="text-[11px] font-medium text-text-secondary">Type de contrat</span>
      <input
        name="employmentType"
        bind:value={employmentType}
        type="text"
        placeholder="Freelance, CDI, Temps plein"
        class="rounded-lg border border-border-light bg-surface-white px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-blueprint-blue focus:outline-none focus:ring-2 focus:ring-blueprint-blue/20"
      />
    </label>
  </div>

  <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
    <label class="flex flex-col gap-1">
      <span class="text-[11px] font-medium text-text-secondary">Début</span>
      <input
        bind:value={startDate}
        type="month"
        data-experience-focus="startDate"
        class="rounded-lg border border-border-light bg-surface-white px-3 py-2 text-sm text-text-primary focus:border-blueprint-blue focus:outline-none focus:ring-2 focus:ring-blueprint-blue/20"
        aria-invalid={Boolean(startDateError)}
      />
      {#if startDateError}
        <span class="text-[11px] text-status-red">{startDateError}</span>
      {/if}
    </label>
    <label class="flex flex-col gap-1">
      <span class="text-[11px] font-medium text-text-secondary">Fin</span>
      <input
        bind:value={endDate}
        type="month"
        disabled={isCurrent}
        data-experience-focus="endDate"
        class="rounded-lg border border-border-light bg-surface-white px-3 py-2 text-sm text-text-primary focus:border-blueprint-blue focus:outline-none focus:ring-2 focus:ring-blueprint-blue/20 disabled:opacity-40"
      />
    </label>
    <label class="flex items-end gap-2 pb-2">
      <input
        type="checkbox"
        checked={isCurrent}
        onchange={handleCurrentToggle}
        data-experience-control="current"
        data-experience-focus="current"
        class="h-4 w-4 rounded border-border-light text-blueprint-blue focus:ring-blueprint-blue/30"
      />
      <span class="text-xs text-text-secondary">Poste actuel</span>
    </label>
  </div>

  <label class="flex flex-col gap-1">
    <span class="text-[11px] font-medium text-text-secondary">Localisation</span>
    <input
      bind:value={location}
      type="text"
      placeholder="Paris, France (ou distant)"
      class="rounded-lg border border-border-light bg-surface-white px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-blueprint-blue focus:outline-none focus:ring-2 focus:ring-blueprint-blue/20"
    />
  </label>

  <label class="flex flex-col gap-1">
    <span class="text-[11px] font-medium text-text-secondary">Description</span>
    <textarea
      bind:value={description}
      rows="3"
      placeholder="Contexte, responsabilités, réalisations notables."
      class="resize-y rounded-lg border border-border-light bg-surface-white px-3 py-2 text-sm leading-relaxed text-text-primary placeholder:text-text-muted focus:border-blueprint-blue focus:outline-none focus:ring-2 focus:ring-blueprint-blue/20"
    ></textarea>
  </label>

  <label class="flex flex-col gap-1">
    <span class="text-[11px] font-medium text-text-secondary"
      >Compétences (séparées par des virgules)</span
    >
    <input
      bind:value={skillsText}
      type="text"
      data-experience-focus="skills"
      placeholder="React, TypeScript, Node.js"
      class="rounded-lg border border-border-light bg-surface-white px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-blueprint-blue focus:outline-none focus:ring-2 focus:ring-blueprint-blue/20"
    />
  </label>

  <div class="flex items-center justify-end gap-2 pt-1">
    {#if typeof onCancel === 'function'}
      <Button
        variant="ghost"
        size="sm"
        onclick={handleCancel}
        disabled={isBusy}
        data-experience-control="cancel">Annuler</Button
      >
    {/if}
    {#if typeof onSave === 'function'}
      <Button
        variant="primary"
        size="sm"
        type="submit"
        disabled={isBusy}
        data-experience-control="save"
      >
        <Icon name="check-circle" size={14} />
        Enregistrer
      </Button>
    {/if}
  </div>
</form>
