<script lang="ts">
  import { Icon } from '@pulse/ui';
  import { Chip } from '@pulse/ui';
  import { Button } from '@pulse/ui';

  let {
    firstName = $bindable(''),
    jobTitle = $bindable(''),
    profileLocation = $bindable(''),
    tjmMin = $bindable(0),
    tjmMax = $bindable(0),
    profileStack = $bindable([]),
    stackInput = $bindable(''),
    editing,
    profileSaved,
    profileError,
    onToggleEdit,
    onSave,
    onAddStack,
    onRemoveStack,
  }: {
    firstName: string;
    jobTitle: string;
    profileLocation: string;
    tjmMin: number;
    tjmMax: number;
    profileStack: string[];
    stackInput: string;
    editing: boolean;
    profileSaved: boolean;
    profileError: string | null;
    onToggleEdit: () => void;
    onSave: () => void;
    onAddStack: () => void;
    onRemoveStack: (tech: string) => void;
  } = $props();
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
    <button
      class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-light bg-surface-white text-text-muted transition-colors hover:bg-subtle-gray hover:text-text-primary"
      onclick={onToggleEdit}
      title={editing ? 'Annuler' : 'Modifier'}
    >
      <Icon name={editing ? 'x' : 'edit-2'} size={13} />
    </button>
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
        bind:value={profileLocation}
      />
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
        <p class="text-[10px] font-medium uppercase tracking-[0.12em] text-text-muted">Stack technique</p>
        <div class="flex gap-2">
          <input
            type="text"
            placeholder="ex: React, Node.js..."
            class="flex-1 rounded-lg border border-border-light bg-page-canvas px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-blueprint-blue/30"
            bind:value={stackInput}
            onkeydown={(e) => { if (e.key === 'Enter') onAddStack(); }}
          />
          <button
            class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border-light bg-surface-white text-text-muted transition-colors hover:bg-subtle-gray hover:text-text-primary"
            onclick={onAddStack}
            title="Ajouter"
          >
            <Icon name="plus" size={13} />
          </button>
        </div>
        {#if profileStack.length > 0}
          <div class="flex flex-wrap gap-1.5 pt-1">
            {#each profileStack as tech}
              <Chip label={tech} selected={true} onclick={() => onRemoveStack(tech)} />
            {/each}
          </div>
        {/if}
      </div>

      <div class="pt-1">
        <Button variant="secondary" onclick={onSave}>
          {#snippet children()}{profileSaved ? 'Sauvegardé !' : 'Enregistrer le profil'}{/snippet}
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
      {#if tjmMin > 0 || tjmMax > 0}
        <p class="text-text-subtle">TJM : {tjmMin} – {tjmMax} €/jour</p>
      {/if}
      {#if profileStack.length > 0}
        <div class="flex flex-wrap gap-1.5 pt-1">
          {#each profileStack as tech}
            <span class="inline-flex items-center rounded-md bg-blueprint-blue/6 px-2 py-0.5 text-[11px] text-blueprint-blue">{tech}</span>
          {/each}
        </div>
      {:else}
        <p class="text-xs text-text-muted">Aucune technologie renseignée</p>
      {/if}
    </div>
  {/if}
</div>
