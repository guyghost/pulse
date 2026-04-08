<script lang="ts">
  import SettingsLayout from '../templates/SettingsLayout.svelte';
  import Button from '../atoms/Button.svelte';
  import Icon from '../atoms/Icon.svelte';
  import BackupRestoreModal from '../molecules/BackupRestoreModal.svelte';
  import ProfileSection from '../organisms/ProfileSection.svelte';
  import ScanSettings from '../organisms/ScanSettings.svelte';
  import DangerZone from '../organisms/DangerZone.svelte';
  import { SettingsPageController } from '$lib/state/settings-page.svelte';
  import type { ExportFormat } from '$lib/core/export/mission-export';
  import { showToast } from '$lib/shell/notifications/toast-service';

  const {
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
    <ProfileSection
      bind:firstName={settings.firstName}
      bind:jobTitle={settings.jobTitle}
      bind:profileLocation={settings.profileLocation}
      bind:tjmMin={settings.tjmMin}
      bind:tjmMax={settings.tjmMax}
      bind:profileStack={settings.profileStack}
      bind:stackInput={settings.stackInput}
      editing={settings.editingProfile}
      profileSaved={settings.profileSaved}
      profileError={settings.profileError}
      onToggleEdit={() => settings.toggleProfileEditing()}
      onSave={() => settings.saveProfile()}
      onAddStack={() => settings.addStack()}
      onRemoveStack={(tech) => settings.removeStack(tech)}
    />

    <!-- Scan & Notifications -->
    <ScanSettings
      autoScan={settings.autoScan}
      scanInterval={settings.scanInterval}
      notifications={settings.notifications}
      onToggleAutoScan={() => settings.toggleAutoScan()}
      onToggleNotifications={() => settings.toggleNotifications()}
      onScanIntervalChange={handleScanIntervalChange}
    />

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
            Le scoring semantique utilise Gemini Nano via la Prompt API de Chrome, sans cle API
            externe.
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
        Les scores sont mis en cache localement pour limiter la latence et eviter les recalculs
        inutiles.
      </p>
    </div>

    <!-- Zone de danger -->
    <DangerZone
      showResetConfirm={settings.showResetConfirm}
      onShowConfirm={() => {
        settings.showResetConfirm = true;
      }}
      onCancelConfirm={() => {
        settings.showResetConfirm = false;
      }}
      onConfirmReset={() => settings.resetAll()}
    />
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
