<script lang="ts">
  import SettingsLayout from '../templates/SettingsLayout.svelte';
  import Button from '../atoms/Button.svelte';
  import Chip from '../atoms/Chip.svelte';
  import Icon from '../atoms/Icon.svelte';
  import BackupRestoreModal from '../molecules/BackupRestoreModal.svelte';
  import { SettingsPageController } from '$lib/state/settings-page.svelte';
  import type { ExportFormat } from '$lib/core/export/mission-export';
  import { showToast } from '$lib/shell/notifications/toast-service';

  let {
    onBack,
    onNavigateToOnboarding,
  }: { onBack?: () => void; onNavigateToOnboarding?: () => void } = $props();

  const settings = new SettingsPageController({
    onNavigateToOnboarding: () => {
      onNavigateToOnboarding?.();
    },
  });

  settings.load();

  async function handleExportFavorites(format: ExportFormat) {
    const result = await settings.exportFavorites(format);
    if (!result.ok) {
      await showToast(result.error, 'error');
      return;
    }

    await showToast('Export des favoris lancé', 'success');
  }

  async function handleCreateBackup() {
    const result = await settings.createBackupFile();
    if (!result.ok) {
      await showToast(result.error, 'error');
      return;
    }

    await showToast('Sauvegarde créée', 'success');
  }

  async function handleRestoreBackup() {
    const result = await settings.restoreBackup();
    if (!result.ok) {
      await showToast(result.error, 'error');
      return;
    }

    await settings.load();
    await showToast('Sauvegarde restaurée', 'success');
  }

  async function handleScanIntervalChange(event: Event) {
    const value = Number.parseInt((event.target as HTMLInputElement).value, 10);
    await settings.updateScanInterval(value);
  }

  async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    await settings.handleFileSelect(input.files?.[0]);
  }
</script>

{#snippet settingsContent()}
  <div class="space-y-6">
    <!-- Profil -->
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
          onclick={() => {
            settings.toggleProfileEditing();
          }}
          title={settings.editingProfile ? 'Annuler' : 'Modifier'}
        >
          <Icon name={settings.editingProfile ? 'x' : 'edit-2'} size={14} />
        </button>
      </div>

      {#if settings.editingProfile}
        <div class="space-y-2">
          <input
            type="text"
            placeholder="Prenom"
            class="soft-ring w-full rounded-[1.1rem] border border-white/10 bg-white/5 px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue/30 focus:ring-2 focus:ring-accent-blue/15"
            bind:value={settings.firstName}
          />
          <input
            type="text"
            placeholder="Poste (ex: Developpeur React Senior)"
            class="soft-ring w-full rounded-[1.1rem] border border-white/10 bg-white/5 px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue/30 focus:ring-2 focus:ring-accent-blue/15"
            bind:value={settings.jobTitle}
          />
          <input
            type="text"
            placeholder="Localisation"
            class="soft-ring w-full rounded-[1.1rem] border border-white/10 bg-white/5 px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue/30 focus:ring-2 focus:ring-accent-blue/15"
            bind:value={settings.profileLocation}
          />
          <div class="flex gap-2">
            <input
              type="number"
              placeholder="TJM min"
              class="soft-ring flex-1 rounded-[1.1rem] border border-white/10 bg-white/5 px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue/30 focus:ring-2 focus:ring-accent-blue/15"
              bind:value={settings.tjmMin}
            />
            <input
              type="number"
              placeholder="TJM max"
              class="soft-ring flex-1 rounded-[1.1rem] border border-white/10 bg-white/5 px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue/30 focus:ring-2 focus:ring-accent-blue/15"
              bind:value={settings.tjmMax}
            />
          </div>

          <!-- Stack Editor -->
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
                bind:value={settings.stackInput}
                onkeydown={(e) => {
                  if (e.key === 'Enter') settings.addStack();
                }}
              />
              <button
                class="inline-flex min-h-12 items-center justify-center rounded-[1.1rem] border border-white/10 bg-white/6 px-4 text-text-secondary transition-all duration-200 hover:bg-white/10 hover:text-text-primary"
                onclick={() => settings.addStack()}
                title="Ajouter"
              >
                <Icon name="plus" size={14} />
              </button>
            </div>
            {#if settings.profileStack.length > 0}
              <div class="flex flex-wrap gap-2 pt-1">
                {#each settings.profileStack as tech}
                  <Chip label={tech} selected={true} onclick={() => settings.removeStack(tech)} />
                {/each}
              </div>
            {/if}
          </div>

          <Button variant="secondary" onclick={() => settings.saveProfile()}>
            {#snippet children()}{settings.profileSaved ? 'Sauvegarde !' : 'Enregistrer le profil'}{/snippet}
          </Button>
          {#if settings.profileError}
            <p class="text-xs text-red-400">{settings.profileError}</p>
          {/if}
        </div>
      {:else}
        <div class="space-y-2 text-sm">
          <p class="text-text-primary">
            {settings.firstName || 'Non renseigné'}
            {settings.jobTitle ? `— ${settings.jobTitle}` : ''}
          </p>
          <p class="text-text-secondary">{settings.profileLocation || 'Localisation non renseignée'}</p>
          {#if settings.tjmMin > 0 || settings.tjmMax > 0}
            <p class="text-text-secondary">TJM : {settings.tjmMin} - {settings.tjmMax} EUR/jour</p>
          {/if}
          {#if settings.profileStack.length > 0}
            <div class="flex flex-wrap gap-1.5 pt-1">
              {#each settings.profileStack as tech}
                <span
                  class="inline-flex items-center rounded-full bg-accent-blue/10 px-2 py-0.5 text-xs text-accent-blue"
                >
                  {tech}
                </span>
              {/each}
            </div>
          {:else}
            <p class="text-text-muted text-xs">Aucune technologie renseignée</p>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Scan automatique -->
    <div class="section-card rounded-[1.5rem] p-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-semibold text-text-primary">Scan automatique</h3>
          <p class="mt-1 text-xs leading-relaxed text-text-secondary">
            Scanner les plateformes en arriere-plan automatiquement.
          </p>
        </div>
        <button
          class="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200 {settings.autoScan
            ? 'border-accent-emerald/30 bg-accent-emerald/20'
            : 'border-white/10 bg-white/5'}"
          onclick={() => settings.toggleAutoScan()}
          role="switch"
          aria-checked={settings.autoScan}
          aria-label="Activer le scan automatique"
        >
          <span
            class="inline-block h-5 w-5 rounded-full transition-transform duration-200 {settings.autoScan
              ? 'translate-x-6 bg-accent-emerald'
              : 'translate-x-0.5 bg-text-muted'}"
          ></span>
        </button>
      </div>
    </div>

    <!-- Intervalle de scan -->
    <div
      class="section-card rounded-[1.5rem] p-4 space-y-3 transition-opacity duration-200"
      class:opacity-40={!settings.autoScan}
      class:pointer-events-none={!settings.autoScan}
    >
      <div>
        <h3 class="text-sm font-semibold text-text-primary">Fréquence de scan</h3>
        <p class="mt-1 text-xs leading-relaxed text-text-secondary">
          Scanner les plateformes toutes les {settings.scanInterval} minutes.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-text-muted">5 min</span>
        <input
          type="range"
          min="5"
          max="120"
          step="5"
          value={settings.scanInterval}
          onchange={handleScanIntervalChange}
          class="flex-1 accent-accent-blue"
        />
        <span class="text-xs text-text-muted">120 min</span>
      </div>
      <p class="text-center text-sm font-semibold text-accent-blue">{settings.scanInterval} min</p>
      {#if !settings.autoScan}
        <p class="text-center text-[11px] text-text-muted">
          Activez le scan automatique pour configurer la fréquence.
        </p>
      {/if}
    </div>

    <!-- Notifications -->
    <div class="section-card rounded-[1.5rem] p-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-semibold text-text-primary">Notifications</h3>
          <p class="mt-1 text-xs leading-relaxed text-text-secondary">
            Recevoir une alerte quand de nouvelles missions arrivent.
          </p>
        </div>
        <button
          class="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200 {settings.notifications
            ? 'border-accent-emerald/30 bg-accent-emerald/20'
            : 'border-white/10 bg-white/5'}"
          onclick={() => settings.toggleNotifications()}
          role="switch"
          aria-checked={settings.notifications}
          aria-label="Activer les notifications"
        >
          <span
            class="inline-block h-5 w-5 rounded-full transition-transform duration-200 {settings.notifications
              ? 'translate-x-6 bg-accent-emerald'
              : 'translate-x-0.5 bg-text-muted'}"
          ></span>
        </button>
      </div>
    </div>

    <!-- Export -->
    <div class="section-card rounded-[1.5rem] p-4 space-y-4">
      <div>
        <h3 class="text-sm font-semibold text-text-primary">Export</h3>
        <p class="mt-1 text-xs leading-relaxed text-text-secondary">
          Exporter vos missions favorites dans différents formats.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          class="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-text-primary transition-all hover:bg-white/10 disabled:opacity-50"
          onclick={() => handleExportFavorites('json')}
          disabled={settings.isExporting}
        >
          <Icon name="file-json" size={16} class="text-accent-blue" />
          JSON
        </button>
        <button
          class="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-text-primary transition-all hover:bg-white/10 disabled:opacity-50"
          onclick={() => handleExportFavorites('csv')}
          disabled={settings.isExporting}
        >
          <Icon name="file-spreadsheet" size={16} class="text-accent-emerald" />
          CSV
        </button>
        <button
          class="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-text-primary transition-all hover:bg-white/10 disabled:opacity-50"
          onclick={() => handleExportFavorites('markdown')}
          disabled={settings.isExporting}
        >
          <Icon name="file-text" size={16} class="text-accent-amber" />
          Markdown
        </button>
      </div>
      {#if settings.exportSuccess}
        <p class="text-xs text-accent-emerald">Export réussi !</p>
      {/if}
    </div>

    <!-- Sauvegarde et restauration -->
    <div class="section-card rounded-[1.5rem] p-4 space-y-4">
      <div>
        <h3 class="text-sm font-semibold text-text-primary">Sauvegarde</h3>
        <p class="mt-1 text-xs leading-relaxed text-text-secondary">
          Sauvegarder ou restaurer vos données (profil, paramètres, favoris).
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="secondary" onclick={handleCreateBackup}>
          {#snippet children()}
            <Icon name="download" size={16} class="mr-1" />
            Créer une sauvegarde
          {/snippet}
        </Button>
        <input
          type="file"
          accept=".pulse-backup,.json"
          class="hidden"
          onchange={handleFileSelect}
          bind:this={settings.fileInput}
        />
        <Button variant="ghost" onclick={() => settings.triggerFileSelect()}>
          {#snippet children()}
            <Icon name="upload" size={16} class="mr-1" />
            Restaurer depuis une sauvegarde
          {/snippet}
        </Button>
      </div>
    </div>

    <!-- IA locale -->
    <div class="section-card-strong rounded-[1.5rem] p-4 space-y-3">
      <div class="flex items-center gap-2">
        <Icon name="info" size={12} class="text-accent-blue/60" />
        <div>
          <h3 class="text-sm font-semibold text-text-primary">IA locale</h3>
          <p class="mt-1 text-xs leading-relaxed text-text-secondary">
            Le scoring semantique utilise Gemini Nano via la Prompt API de Chrome, sans cle API externe.
          </p>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-2 text-[11px]">
        <div class="rounded-[1.2rem] border border-white/8 bg-white/[0.05] px-3 py-3">
          <p class="uppercase tracking-[0.18em] text-text-muted">Statut</p>
          <p class="mt-2 text-sm font-semibold text-white">
            {settings.aiAvailability === 'available'
              ? 'Disponible'
              : settings.aiAvailability === 'after-download'
                ? 'Téléchargement requis'
                : 'Indisponible'}
          </p>
        </div>
        <div class="rounded-[1.2rem] border border-white/8 bg-white/[0.05] px-3 py-3">
          <p class="uppercase tracking-[0.18em] text-text-muted">Missions / scan</p>
          <p class="mt-2 text-sm font-semibold text-white">{settings.maxSemanticPerScan}</p>
        </div>
      </div>
      <p class="text-xs leading-relaxed text-text-secondary">
        Les scores sont mis en cache localement pour limiter la latence et eviter les recalculs inutiles.
      </p>
    </div>

    <!-- Zone de danger -->
    <div class="section-card rounded-[1.5rem] border border-red-500/20 p-4 space-y-3">
      <div>
        <h3 class="text-sm font-semibold text-red-400">Zone dangereuse</h3>
        <p class="mt-1 text-xs leading-relaxed text-text-secondary">
          Supprimer toutes les données locales (profil, missions, cache).
        </p>
      </div>
      {#if settings.showResetConfirm}
        <div class="flex gap-2">
          <Button
            variant="ghost"
            onclick={() => {
              settings.showResetConfirm = false;
            }}
          >
            {#snippet children()}Annuler{/snippet}
          </Button>
          <button
            class="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/20 px-4 py-2.5 text-sm font-semibold text-red-400 transition-all duration-200 hover:bg-red-500/30"
            onclick={() => settings.resetAll()}
          >
            Confirmer la suppression
          </button>
        </div>
      {:else}
        <button
          class="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-400 transition-all duration-200 hover:bg-red-500/20"
          onclick={() => {
            settings.showResetConfirm = true;
          }}
        >
          <Icon name="trash-2" size={14} />
          Reinitialiser tout
        </button>
      {/if}
    </div>
  </div>
{/snippet}

<SettingsLayout {onBack} content={settingsContent} />

{#if settings.showBackupModal}
  <BackupRestoreModal
    backup={settings.pendingBackup}
    error={settings.backupError}
    onConfirm={handleRestoreBackup}
    onCancel={() => settings.cancelRestore()}
  />
{/if}
