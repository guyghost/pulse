<script lang="ts">
  import { Button } from '@pulse/ui';
  import { Icon } from '@pulse/ui';
  import BackupRestoreModal from '../molecules/BackupRestoreModal.svelte';
  import AccountSection from '../organisms/AccountSection.svelte';
  import ProfileSection from '../organisms/ProfileSection.svelte';
  import ScanSettings from '../organisms/ScanSettings.svelte';
  import DangerZone from '../organisms/DangerZone.svelte';
  import { SettingsPageController } from '$lib/state/settings-page.svelte';
  import { createAuthStore } from '$lib/state/auth.svelte';
  import type { ExportFormat } from '$lib/core/export/mission-export';
  import { showToast } from '$lib/shell/notifications/toast-service';

  const {
    onNavigateToOnboarding,
  }: { onBack?: () => void; onNavigateToOnboarding?: () => void } = $props();

  const settings = new SettingsPageController({
    onNavigateToOnboarding: () => { onNavigateToOnboarding?.(); },
  });

  const auth = createAuthStore();
  settings.load();
  auth.checkStatus();

  async function handleExportFavorites(format: ExportFormat) {
    const result = await settings.exportFavorites(format);
    if (!result.ok) { await showToast(result.error, 'error'); return; }
    await showToast('Export des favoris lancé', 'success');
  }

  async function handleCreateBackup() {
    const result = await settings.createBackupFile();
    if (!result.ok) { await showToast(result.error, 'error'); return; }
    await showToast('Sauvegarde créée', 'success');
  }

  async function handleRestoreBackup() {
    const result = await settings.restoreBackup();
    if (!result.ok) { await showToast(result.error, 'error'); return; }
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

<div class="flex h-full flex-col overflow-y-auto px-4 pb-5 pt-4">
  <!-- Hero -->
  <section class="section-card-strong rounded-2xl px-5 py-4">
    <div class="flex items-center gap-3">
      <div
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blueprint-blue/15 bg-blueprint-blue/6"
      >
        <Icon name="settings" size={16} class="text-blueprint-blue" />
      </div>
      <div>
        <p class="eyebrow text-blueprint-blue">Configuration</p>
        <h2 class="mt-1 text-base font-semibold text-text-primary">Paramètres</h2>
      </div>
    </div>
  </section>

  <div class="mt-4 space-y-4">
    <!-- Compte -->
    <AccountSection
      isAuthenticated={auth.isAuthenticated}
      email={auth.user?.email ?? null}
      premiumStatus={auth.premiumStatus}
      premiumExpiresAt={auth.user?.premiumExpiresAt ?? null}
      isLoading={auth.storeState === 'loading'}
      error={auth.error}
      onLogin={async (email, password) => {
        const result = await auth.login(email, password);
        if (!result.success && result.error) await showToast(result.error, 'error');
      }}
      onSignup={async (email, password) => {
        const result = await auth.signup(email, password);
        if (result.success) await showToast('Compte créé avec succès', 'success');
      }}
      onLogout={async () => {
        await auth.logout();
        await showToast('Déconnecté', 'success');
      }}
      onOpenDashboard={() => { window.open('https://missionpulse.app/dashboard', '_blank'); }}
    />

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
    <div class="section-card rounded-xl p-5 space-y-4">
      <div>
        <h3 class="text-sm font-medium text-text-primary">Export</h3>
        <p class="mt-1 text-xs text-text-subtle">
          Exporter vos missions favorites dans différents formats.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          class="inline-flex items-center gap-2 rounded-lg border border-border-light bg-page-canvas px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-subtle-gray disabled:opacity-50"
          onclick={() => handleExportFavorites('json')}
          disabled={settings.isExporting}
        >
          <Icon name="file-json" size={14} class="text-blueprint-blue" />
          JSON
        </button>
        <button
          class="inline-flex items-center gap-2 rounded-lg border border-border-light bg-page-canvas px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-subtle-gray disabled:opacity-50"
          onclick={() => handleExportFavorites('csv')}
          disabled={settings.isExporting}
        >
          <Icon name="file-spreadsheet" size={14} class="text-blueprint-blue" />
          CSV
        </button>
        <button
          class="inline-flex items-center gap-2 rounded-lg border border-border-light bg-page-canvas px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-subtle-gray disabled:opacity-50"
          onclick={() => handleExportFavorites('markdown')}
          disabled={settings.isExporting}
        >
          <Icon name="file-text" size={14} class="text-blueprint-blue" />
          Markdown
        </button>
      </div>
      {#if settings.exportSuccess}
        <p class="text-xs text-blueprint-blue">Export réussi !</p>
      {/if}
    </div>

    <!-- Sauvegarde -->
    <div class="section-card rounded-xl p-5 space-y-4">
      <div>
        <h3 class="text-sm font-medium text-text-primary">Sauvegarde</h3>
        <p class="mt-1 text-xs text-text-subtle">
          Sauvegarder ou restaurer vos données (profil, paramètres, favoris).
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="secondary" onclick={handleCreateBackup}>
          {#snippet children()}
            <Icon name="download" size={14} class="mr-1" />
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
            <Icon name="upload" size={14} class="mr-1" />
            Restaurer
          {/snippet}
        </Button>
      </div>
    </div>

    <!-- IA locale -->
    <div class="section-card rounded-xl p-5 space-y-3">
      <div class="flex items-start gap-3">
        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blueprint-blue/6">
          <Icon name="cpu" size={14} class="text-blueprint-blue" />
        </div>
        <div>
          <h3 class="text-sm font-medium text-text-primary">IA locale</h3>
          <p class="mt-1 text-xs text-text-subtle">
            Le scoring sémantique utilise Gemini Nano via la Prompt API de Chrome, sans clé API externe.
          </p>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div class="rounded-lg border border-border-light bg-page-canvas px-3 py-2.5">
          <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">Statut</p>
          <p class="mt-1 text-xs font-medium text-text-primary">
            {settings.aiAvailability === 'available'
              ? 'Disponible'
              : settings.aiAvailability === 'after-download'
                ? 'Téléchargement requis'
                : 'Indisponible'}
          </p>
        </div>
        <div class="rounded-lg border border-border-light bg-page-canvas px-3 py-2.5">
          <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">Missions / scan</p>
          <p class="mt-1 text-xs font-medium text-text-primary">{settings.maxSemanticPerScan}</p>
        </div>
      </div>
    </div>

    <!-- Onboarding -->
    <div class="section-card rounded-xl p-5 space-y-4">
      <div>
        <h3 class="text-sm font-medium text-text-primary">Onboarding</h3>
        <p class="mt-1 text-xs text-text-subtle">
          Rejouer l'accompagnement initial ou relancer le tour du feed.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="secondary" onclick={() => settings.restartOnboarding()}>
          {#snippet children()}
            <Icon name="star" size={14} class="mr-1" />
            Rejouer l'onboarding
          {/snippet}
        </Button>
        <Button variant="ghost" onclick={() => settings.replayFeedTour()}>
          {#snippet children()}
            <Icon name="play" size={14} class="mr-1" />
            Revoir le tour du feed
          {/snippet}
        </Button>
      </div>
    </div>

    <!-- Zone de danger -->
    <DangerZone
      showResetConfirm={settings.showResetConfirm}
      onShowConfirm={() => { settings.showResetConfirm = true; }}
      onCancelConfirm={() => { settings.showResetConfirm = false; }}
      onConfirmReset={() => settings.resetAll()}
    />
  </div>
</div>

{#if settings.showBackupModal}
  <BackupRestoreModal
    backup={settings.pendingBackup}
    error={settings.backupError}
    onConfirm={handleRestoreBackup}
    onCancel={() => settings.cancelRestore()}
  />
{/if}
