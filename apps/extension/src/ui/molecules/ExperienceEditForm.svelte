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
    onSave,
    onCancel,
  }: {
    draft?: Experience | null;
    onSave: (data: ExperienceFormData) => void;
    onCancel: () => void;
  } = $props();

  export interface ExperienceFormData {
    title: string;
    company: string;
    location: string;
    startDate: string | null;
    endDate: string | null;
    isCurrent: boolean;
    description: string;
    skills: string[];
  }

  // The parent remounts this component for each edit session, so we only need
  // the initial draft snapshot (untrack silences state_referenced_locally).
  let title = $state(untrack(() => draft?.title ?? ''));
  let company = $state(untrack(() => draft?.company ?? ''));
  let location = $state(untrack(() => draft?.location ?? ''));
  let startDate = $state(untrack(() => draft?.startDate ?? ''));
  let endDate = $state(untrack(() => draft?.endDate ?? ''));
  let isCurrent = $state(untrack(() => draft?.isCurrent ?? false));
  let description = $state(untrack(() => draft?.description ?? ''));
  let skillsText = $state(untrack(() => (draft?.skills ?? []).join(', ')));

  let touched = $state(false);

  const titleError = $derived(touched && title.trim().length === 0 ? 'Le titre est requis.' : '');
  const companyError = $derived(
    touched && company.trim().length === 0 ? 'L’entreprise est requise.' : ''
  );
  const startDateError = $derived(
    touched && startDate.trim().length === 0 ? 'La date de début est requise.' : ''
  );
  // End date is optional for past roles — the user may not remember the exact
  // month. Only validate format when a value is provided.
  const hasErrors = $derived(Boolean(titleError || companyError || startDateError));

  function handleSubmit() {
    touched = true;
    if (hasErrors) {
      return;
    }
    const skills = skillsText
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    onSave({
      title: title.trim(),
      company: company.trim(),
      location: location.trim(),
      startDate: startDate.trim() || null,
      endDate: isCurrent ? null : endDate.trim() || null,
      isCurrent,
      description: description.trim(),
      skills,
    });
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
  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <label class="flex flex-col gap-1">
      <span class="text-[11px] font-medium text-text-secondary">Titre du poste</span>
      <input
        bind:value={title}
        oninput={() => (touched = true)}
        type="text"
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
        placeholder="Acme"
        class="rounded-lg border border-border-light bg-surface-white px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-blueprint-blue focus:outline-none focus:ring-2 focus:ring-blueprint-blue/20"
        aria-invalid={Boolean(companyError)}
      />
      {#if companyError}
        <span class="text-[11px] text-status-red">{companyError}</span>
      {/if}
    </label>
  </div>

  <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
    <label class="flex flex-col gap-1">
      <span class="text-[11px] font-medium text-text-secondary">Début</span>
      <input
        bind:value={startDate}
        type="month"
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
        class="rounded-lg border border-border-light bg-surface-white px-3 py-2 text-sm text-text-primary focus:border-blueprint-blue focus:outline-none focus:ring-2 focus:ring-blueprint-blue/20 disabled:opacity-40"
      />
    </label>
    <label class="flex items-end gap-2 pb-2">
      <input
        type="checkbox"
        checked={isCurrent}
        onchange={handleCurrentToggle}
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
      placeholder="React, TypeScript, Node.js"
      class="rounded-lg border border-border-light bg-surface-white px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-blueprint-blue focus:outline-none focus:ring-2 focus:ring-blueprint-blue/20"
    />
  </label>

  <div class="flex items-center justify-end gap-2 pt-1">
    <Button variant="ghost" size="sm" onclick={onCancel}>Annuler</Button>
    <Button variant="primary" size="sm" type="submit">
      <Icon name="check-circle" size={14} />
      Enregistrer
    </Button>
  </div>
</form>
