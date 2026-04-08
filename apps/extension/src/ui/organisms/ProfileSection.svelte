<script lang="ts">
  import Icon from '../atoms/Icon.svelte';
  import Chip from '../atoms/Chip.svelte';
  import Button from '../atoms/Button.svelte';

  let {
    firstName,
    jobTitle,
    profileLocation,
    tjmMin,
    tjmMax,
    profileStack,
    stackInput,
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

<div class="section-card-strong rounded-[1.5rem] p-4 space-y-3">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <Icon name="edit-2" size={12} class="text-accent-blue/60" />
      <div>
        <h3 class="text-sm font-semibold text-text-primary">Profil</h3>
        <p class="mt-1 text-xs leading-relaxed text-text-secondary">
          Vos informations de freelance.
        </p>
      </div>
    </div>
    <button
      class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/8 bg-white/4 text-text-secondary transition-colors hover:bg-white/8 hover:text-text-primary"
      onclick={onToggleEdit}
      title={editing ? 'Annuler' : 'Modifier'}
    >
      <Icon name={editing ? 'x' : 'edit-2'} size={14} />
    </button>
  </div>

  {#if editing}
    <div class="space-y-2">
      <input
        type="text"
        placeholder="Prenom"
        class="soft-ring w-full rounded-[1.1rem] border border-white/10 bg-white/5 px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue/30 focus:ring-2 focus:ring-accent-blue/15"
        bind:value={firstName}
      />
      <input
        type="text"
        placeholder="Poste (ex: Developpeur React Senior)"
        class="soft-ring w-full rounded-[1.1rem] border border-white/10 bg-white/5 px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue/30 focus:ring-2 focus:ring-accent-blue/15"
        bind:value={jobTitle}
      />
      <input
        type="text"
        placeholder="Localisation"
        class="soft-ring w-full rounded-[1.1rem] border border-white/10 bg-white/5 px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue/30 focus:ring-2 focus:ring-accent-blue/15"
        bind:value={profileLocation}
      />
      <div class="flex gap-2">
        <input
          type="number"
          placeholder="TJM min"
          class="soft-ring flex-1 rounded-[1.1rem] border border-white/10 bg-white/5 px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue/30 focus:ring-2 focus:ring-accent-blue/15"
          bind:value={tjmMin}
        />
        <input
          type="number"
          placeholder="TJM max"
          class="soft-ring flex-1 rounded-[1.1rem] border border-white/10 bg-white/5 px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue/30 focus:ring-2 focus:ring-accent-blue/15"
          bind:value={tjmMax}
        />
      </div>

      <div class="space-y-2">
        <label for="stack-input" class="text-xs uppercase tracking-[0.18em] text-text-muted"
          >Stack technique</label
        >
        <div class="flex gap-2">
          <input
            id="stack-input"
            type="text"
            placeholder="ex: React, Node.js..."
            class="soft-ring flex-1 rounded-[1.1rem] border border-white/10 bg-white/5 px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue/30 focus:ring-2 focus:ring-accent-blue/15"
            bind:value={stackInput}
            onkeydown={(e) => {
              if (e.key === 'Enter') {
                onAddStack();
              }
            }}
          />
          <button
            class="inline-flex min-h-12 items-center justify-center rounded-[1.1rem] border border-white/10 bg-white/6 px-4 text-text-secondary transition-all duration-200 hover:bg-white/10 hover:text-text-primary"
            onclick={onAddStack}
            title="Ajouter"
          >
            <Icon name="plus" size={14} />
          </button>
        </div>
        {#if profileStack.length > 0}
          <div class="flex flex-wrap gap-2 pt-1">
            {#each profileStack as tech}
              <Chip label={tech} selected={true} onclick={() => onRemoveStack(tech)} />
            {/each}
          </div>
        {/if}
      </div>

      <Button variant="secondary" onclick={onSave}>
        {#snippet children()}{profileSaved ? 'Sauvegarde !' : 'Enregistrer le profil'}{/snippet}
      </Button>
      {#if profileError}
        <p class="text-xs text-red-400">{profileError}</p>
      {/if}
    </div>
  {:else}
    <div class="space-y-2 text-sm">
      <p class="text-text-primary">
        {firstName || 'Non renseigné'}
        {jobTitle ? `— ${jobTitle}` : ''}
      </p>
      <p class="text-text-secondary">{profileLocation || 'Localisation non renseignée'}</p>
      {#if tjmMin > 0 || tjmMax > 0}
        <p class="text-text-secondary">TJM : {tjmMin} – {tjmMax} €/jour</p>
      {/if}
      {#if profileStack.length > 0}
        <div class="flex flex-wrap gap-1.5 pt-1">
          {#each profileStack as tech}
            <span
              class="inline-flex items-center rounded-full bg-accent-blue/10 px-2 py-0.5 text-xs text-accent-blue"
              >{tech}</span
            >
          {/each}
        </div>
      {:else}
        <p class="text-text-muted text-xs">Aucune technologie renseignée</p>
      {/if}
    </div>
  {/if}
</div>
