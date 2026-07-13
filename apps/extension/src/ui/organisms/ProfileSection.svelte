<script lang="ts">
  import { Icon } from '@pulse/ui';
  import { Chip } from '@pulse/ui';
  import { Button } from '@pulse/ui';
  import type { RemoteType } from '$lib/core/types/mission';
  import type { SeniorityLevel } from '$lib/core/types/profile';
  import Tooltip from '../atoms/Tooltip.svelte';
  import { REMOTE_OPTIONS as remoteOptions } from '../constants/remote-options';
  import { LOCATION_LABELS } from '$lib/core/locations/location-catalog';

  /* eslint-disable prefer-const */
  let {
    firstName = $bindable(''),
    jobTitle = $bindable(''),
    profileLocation = $bindable(''),
    profileRemote = $bindable('any'),
    seniority = $bindable('senior'),
    tjmMin = $bindable(0),
    tjmMax = $bindable(0),
    profileKeywords = $bindable([]),
    keywordInput = $bindable(''),
    editing,
    isSaving = false,
    profileSaved,
    profileError,
    onToggleEdit,
    onSave,
    onAddKeyword,
    onRemoveKeyword,
  }: {
    firstName: string;
    jobTitle: string;
    profileLocation: string;
    profileRemote: RemoteType | 'any';
    seniority: SeniorityLevel;
    tjmMin: number;
    tjmMax: number;
    profileKeywords: string[];
    keywordInput: string;
    editing: boolean;
    isSaving?: boolean;
    profileSaved: boolean;
    profileError: string | null;
    onToggleEdit: () => void;
    onSave: () => void | Promise<void>;
    onAddKeyword: () => void;
    onRemoveKeyword: (keyword: string) => void;
  } = $props();
  /* eslint-enable prefer-const */

  const seniorityOptions: Array<{ value: SeniorityLevel; label: string }> = [
    { value: 'junior', label: 'Junior' },
    { value: 'confirmed', label: 'Confirmé' },
    { value: 'senior', label: 'Senior' },
  ];
</script>

<div class="section-card rounded-xl p-5">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blueprint-blue/6">
        <Icon name="edit-2" size={14} class="text-blueprint-blue" />
      </div>
      <div>
        <h3 class="text-sm font-medium text-text-primary">Profil</h3>
        <p class="mt-0.5 text-xs text-text-subtle">Vos informations de freelance.</p>
      </div>
    </div>
    <Tooltip
      label={editing ? 'Annuler la modification' : 'Modifier mes critères'}
      description={editing
        ? 'Quitte le mode édition sans sauvegarder.'
        : 'Ajuste les critères qui influencent le classement.'}
    >
      <button
        class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-light bg-surface-white text-text-muted transition-colors hover:bg-subtle-gray hover:text-text-primary"
        onclick={onToggleEdit}
        aria-label={editing ? 'Annuler la modification du profil' : 'Modifier mes critères'}
        disabled={isSaving}
      >
        <Icon name={editing ? 'x' : 'edit-2'} size={13} />
      </button>
    </Tooltip>
  </div>

  {#if editing}
    <div class="mt-4 space-y-2.5">
      <input
        type="text"
        placeholder="Prénom"
        class="w-full rounded-lg border border-border-light bg-page-canvas px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-blueprint-blue/30"
        bind:value={firstName}
      />
      <input
        type="text"
        placeholder="Poste (ex: Développeur React Senior)"
        class="w-full rounded-lg border border-border-light bg-page-canvas px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-blueprint-blue/30"
        bind:value={jobTitle}
      />
      <input
        type="text"
        placeholder="Localisation"
        class="w-full rounded-lg border border-border-light bg-page-canvas px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-blueprint-blue/30"
        list="profile-location-catalog"
        bind:value={profileLocation}
      />
      <datalist id="profile-location-catalog">
        {#each LOCATION_LABELS as label (label)}
          <option value={label}></option>
        {/each}
      </datalist>
      <div class="grid grid-cols-2 gap-2">
        <label class="space-y-1">
          <span class="text-[10px] font-medium uppercase tracking-[0.12em] text-text-muted">
            Remote
          </span>
          <select
            class="w-full rounded-lg border border-border-light bg-page-canvas px-3 py-2.5 text-sm text-text-primary outline-none transition-colors focus:border-blueprint-blue/30"
            bind:value={profileRemote}
          >
            {#each remoteOptions as option, i (i)}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        </label>
        <label class="space-y-1">
          <span class="text-[10px] font-medium uppercase tracking-[0.12em] text-text-muted">
            Séniorité
          </span>
          <select
            class="w-full rounded-lg border border-border-light bg-page-canvas px-3 py-2.5 text-sm text-text-primary outline-none transition-colors focus:border-blueprint-blue/30"
            bind:value={seniority}
          >
            {#each seniorityOptions as option, i (i)}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        </label>
      </div>
      <div class="flex gap-2">
        <input
          type="number"
          placeholder="TJM min"
          class="flex-1 rounded-lg border border-border-light bg-page-canvas px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-blueprint-blue/30"
          bind:value={tjmMin}
        />
        <input
          type="number"
          placeholder="TJM max"
          class="flex-1 rounded-lg border border-border-light bg-page-canvas px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-blueprint-blue/30"
          bind:value={tjmMax}
        />
      </div>

      <div class="space-y-2">
        <p class="text-[10px] font-medium uppercase tracking-[0.12em] text-text-muted">Mots-clés</p>
        <div class="flex gap-2">
          <input
            type="text"
            aria-label="Mots-clés"
            id="profile-keywords-input"
            placeholder="ex: React, Node.js, SaaS, marketplace..."
            class="flex-1 rounded-lg border border-border-light bg-page-canvas px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-blueprint-blue/30"
            bind:value={keywordInput}
            onkeydown={(e) => {
              if (e.key === 'Enter') {
                onAddKeyword();
              }
            }}
          />
          <Tooltip
            label="Ajouter le mot-clé"
            description="Ajoute ce mot-clé au scoring et aux recherches."
          >
            <button
              class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border-light bg-surface-white text-text-muted transition-colors hover:bg-subtle-gray hover:text-text-primary"
              onclick={onAddKeyword}
              aria-label="Ajouter le mot-clé"
            >
              <Icon name="plus" size={13} />
            </button>
          </Tooltip>
        </div>
        {#if profileKeywords.length > 0}
          <div class="flex flex-wrap gap-1.5 pt-1">
            {#each profileKeywords as keyword (keyword)}
              <Chip label={keyword} selected={true} onclick={() => onRemoveKeyword(keyword)} />
            {/each}
          </div>
        {/if}
      </div>

      <div class="pt-1">
        <Button variant="secondary" onclick={onSave} loading={isSaving}>
          {isSaving ? 'Sauvegarde...' : profileSaved ? 'Sauvegardé !' : 'Enregistrer le profil'}
        </Button>
      </div>
      {#if profileError}
        <p class="text-xs text-status-red">{profileError}</p>
      {/if}
    </div>
  {:else}
    <div class="mt-4 space-y-2 text-sm">
      <p class="text-text-primary">
        {firstName || 'Non renseigné'}
        {jobTitle ? ` — ${jobTitle}` : ''}
      </p>
      <p class="text-text-subtle">{profileLocation || 'Localisation non renseignée'}</p>
      <div class="grid grid-cols-2 gap-2">
        <div class="rounded-lg border border-border-light bg-page-canvas px-3 py-2.5">
          <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">Remote</p>
          <p class="mt-1 text-xs font-medium text-text-primary">
            {remoteOptions.find((option) => option.value === profileRemote)?.label ?? 'Indifférent'}
          </p>
        </div>
        <div class="rounded-lg border border-border-light bg-page-canvas px-3 py-2.5">
          <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">
            Séniorité
          </p>
          <p class="mt-1 text-xs font-medium text-text-primary">
            {seniorityOptions.find((option) => option.value === seniority)?.label ?? 'Senior'}
          </p>
        </div>
      </div>
      {#if tjmMin > 0 || tjmMax > 0}
        <p class="text-text-subtle">TJM : {tjmMin} – {tjmMax} €/jour</p>
      {/if}
      {#if profileKeywords.length > 0}
        <div class="flex flex-wrap gap-1.5 pt-1">
          {#each profileKeywords as keyword (keyword)}
            <span
              class="inline-flex items-center rounded-md bg-blueprint-blue/6 px-2 py-0.5 text-[11px] text-blueprint-blue"
              >{keyword}</span
            >
          {/each}
        </div>
      {:else}
        <p class="text-xs text-text-muted">Aucun mot-clé renseigné</p>
      {/if}
    </div>
  {/if}
</div>
