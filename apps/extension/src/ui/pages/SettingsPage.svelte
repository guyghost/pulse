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
  import { sendMessage } from '$lib/shell/messaging/bridge';
  import type { BridgeMessage } from '$lib/shell/messaging/bridge';
  import type { ConnectedDashboardSyncStatus } from '$lib/shell/sync/connected-dashboard';

  const DASHBOARD_BASE_URL =
    import.meta.env.VITE_DASHBOARD_URL ??
    import.meta.env.PUBLIC_DASHBOARD_URL ??
    import.meta.env.PUBLIC_DASHBOARD_BASE_URL ??
    'https://missionpulse.app';

  function getDashboardUrl() {
    const trimmed = DASHBOARD_BASE_URL.trim().replace(/\/$/, '');
    if (!trimmed) {
      return 'https://missionpulse.app/dashboard';
    }

    return trimmed.endsWith('/dashboard') ? trimmed : `${trimmed}/dashboard`;
  }

  const { onNavigateToOnboarding }: { onBack?: () => void; onNavigateToOnboarding?: () => void } =
    $props();

  const settings = new SettingsPageController({
    onNavigateToOnboarding: () => {
      onNavigateToOnboarding?.();
    },
  });

  const auth = createAuthStore();
  settings.load();
  auth.checkStatus();

  let connectedSyncStatus = $state<ConnectedDashboardSyncStatus | null>(null);
  let connectedSyncLoading = $state(false);
  let connectedSyncRetrying = $state(false);
  let connectedSyncError = $state<string | null>(null);
  const connectedSyncEntities = $derived(connectedSyncStatus?.entities ?? []);
  const connectedSyncHasError = $derived(
    connectedSyncEntities.some((entity) => entity.state === 'error')
  );
  const connectedSyncHasPending = $derived(
    connectedSyncEntities.some((entity) => entity.state === 'pending')
  );

  const connectedSyncStateLabels: Record<
    ConnectedDashboardSyncStatus['entities'][number]['state'],
    string
  > = {
    healthy: 'Synchronisé',
    pending: 'En attente',
    error: 'Erreur',
    idle: 'Initial',
  };

  async function loadConnectedSyncStatus() {
    connectedSyncLoading = true;
    connectedSyncError = null;
    try {
      const response = await sendMessage({ type: 'GET_CONNECTED_SYNC_STATUS' });
      if (response.type === 'CONNECTED_SYNC_STATUS_RESULT') {
        connectedSyncStatus = response.payload;
      }
    } catch (error) {
      connectedSyncError = error instanceof Error ? error.message : 'Statut de sync indisponible';
    } finally {
      connectedSyncLoading = false;
    }
  }

  async function retryConnectedSync() {
    connectedSyncRetrying = true;
    connectedSyncError = null;
    try {
      const response: BridgeMessage = await sendMessage({ type: 'RETRY_CONNECTED_SYNC' });
      if (response.type !== 'CONNECTED_DASHBOARD_SYNCED') {
        connectedSyncError = 'Réponse de sync inattendue';
        return;
      }

      if (!response.payload.synced) {
        connectedSyncError = response.payload.reason ?? 'Retry de sync impossible';
        await showToast(connectedSyncError, 'error');
        return;
      }

      await showToast('Synchronisation dashboard relancée', 'success');
      await loadConnectedSyncStatus();
    } catch (error) {
      connectedSyncError = error instanceof Error ? error.message : 'Retry de sync impossible';
      await showToast(connectedSyncError, 'error');
    } finally {
      connectedSyncRetrying = false;
    }
  }

  loadConnectedSyncStatus();

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
      creditBalance={auth.creditBalance}
      isLoading={auth.storeState === 'loading'}
      error={auth.error}
      onLogin={async (email, password) => {
        const result = await auth.login(email, password);
        if (!result.success && result.error) {
          await showToast(result.error, 'error');
        }
      }}
      onSignup={async (email, password) => {
        const result = await auth.signup(email, password);
        if (result.success) {
          await showToast('Compte créé avec succès', 'success');
        }
      }}
      onLogout={async () => {
        await auth.logout();
        await showToast('Déconnecté', 'success');
      }}
      onOpenDashboard={() => {
        window.open(getDashboardUrl(), '_blank');
      }}
      onRefresh={() => auth.checkStatus()}
    />

    <div class="section-card rounded-xl p-5 space-y-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-sm font-medium text-text-primary">Dashboard connecté</h3>
          <p class="mt-1 text-xs text-text-subtle">
            Relancer l'envoi des missions, candidatures et statuts connecteurs vers Supabase.
          </p>
        </div>
        <span
          class="rounded-full border px-2 py-1 text-[10px] font-medium {connectedSyncStatus?.authenticated
            ? connectedSyncHasError
              ? 'border-status-red/20 bg-status-red/8 text-status-red'
              : connectedSyncHasPending
                ? 'border-status-orange/20 bg-status-orange/8 text-status-orange'
                : 'border-blueprint-blue/20 bg-blueprint-blue/8 text-blueprint-blue'
            : 'border-border-light bg-page-canvas text-text-subtle'}"
        >
          {connectedSyncStatus?.authenticated
            ? connectedSyncHasError
              ? 'Action requise'
              : connectedSyncHasPending
                ? 'En attente'
                : 'Connecté'
            : 'Déconnecté'}
        </span>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div class="rounded-lg border border-border-light bg-page-canvas px-3 py-2.5">
          <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">
            Installation
          </p>
          <p class="mt-1 truncate text-xs font-medium text-text-primary">
            {connectedSyncStatus?.installId ?? 'Non enregistrée'}
          </p>
        </div>
        <div class="rounded-lg border border-border-light bg-page-canvas px-3 py-2.5">
          <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">
            Dernière sync
          </p>
          <p class="mt-1 text-xs font-medium text-text-primary">
            {connectedSyncStatus?.lastGlobalSync
              ? new Intl.DateTimeFormat('fr-FR', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(connectedSyncStatus.lastGlobalSync))
              : 'Aucune'}
          </p>
        </div>
      </div>

      {#if connectedSyncEntities.length > 0}
        <div class="space-y-2">
          {#each connectedSyncEntities as entity}
            <div class="rounded-lg border border-border-light bg-page-canvas px-3 py-2.5">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-xs font-medium text-text-primary">{entity.label}</p>
                  <p class="mt-1 text-[11px] leading-4 text-text-subtle">
                    Push: {entity.lastPushAt
                      ? new Intl.DateTimeFormat('fr-FR', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        }).format(new Date(entity.lastPushAt))
                      : 'Aucun'} · Pull: {entity.lastPullAt
                      ? new Intl.DateTimeFormat('fr-FR', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        }).format(new Date(entity.lastPullAt))
                      : 'Aucun'}
                  </p>
                </div>
                <span
                  class="rounded-full border px-2 py-1 text-[10px] font-medium {entity.state ===
                  'error'
                    ? 'border-status-red/20 bg-status-red/8 text-status-red'
                    : entity.state === 'pending'
                      ? 'border-status-orange/20 bg-status-orange/8 text-status-orange'
                      : 'border-border-light bg-surface-white text-text-subtle'}"
                >
                  {connectedSyncStateLabels[entity.state]}
                </span>
              </div>

              <div class="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <p class="rounded-md bg-surface-white px-2 py-1 text-text-subtle">
                  Upload: <span class="font-medium text-text-primary"
                    >{entity.pendingUploadCount}</span
                  >
                </p>
                <p class="rounded-md bg-surface-white px-2 py-1 text-text-subtle">
                  Download: <span class="font-medium text-text-primary"
                    >{entity.pendingDownloadCount}</span
                  >
                </p>
              </div>

              {#if entity.lastErrorMessage}
                <p
                  class="mt-2 rounded-md border border-status-red/20 bg-status-red/8 px-2 py-1.5 text-[11px] leading-4 text-status-red"
                >
                  {entity.lastErrorCode ?? 'sync_error'}: {entity.lastErrorMessage}
                </p>
              {/if}

              {#if entity.retryAfterAt}
                <p class="mt-2 text-[11px] leading-4 text-text-subtle">
                  Retry après {new Intl.DateTimeFormat('fr-FR', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(entity.retryAfterAt))}
                </p>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      {#if connectedSyncError}
        <p
          class="rounded-lg border border-status-red/20 bg-status-red/8 px-3 py-2 text-xs leading-5 text-status-red"
        >
          {connectedSyncError}
        </p>
      {/if}

      <div class="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onclick={retryConnectedSync}
          disabled={connectedSyncRetrying || connectedSyncLoading}
        >
          {#snippet children()}
            <Icon name="refresh-cw" size={14} class="mr-1" />
            {connectedSyncRetrying ? 'Synchronisation...' : 'Retenter la sync'}
          {/snippet}
        </Button>
        <Button variant="ghost" onclick={loadConnectedSyncStatus} disabled={connectedSyncLoading}>
          {#snippet children()}
            <Icon name="database" size={14} class="mr-1" />
            Actualiser
          {/snippet}
        </Button>
      </div>
    </div>

    <!-- Profil -->
    <ProfileSection
      bind:firstName={settings.firstName}
      bind:jobTitle={settings.jobTitle}
      bind:profileLocation={settings.profileLocation}
      bind:profileRemote={settings.profileRemote}
      bind:seniority={settings.seniority}
      bind:tjmMin={settings.tjmMin}
      bind:tjmMax={settings.tjmMax}
      bind:profileStack={settings.profileStack}
      bind:stackInput={settings.stackInput}
      bind:searchKeywords={settings.searchKeywords}
      bind:keywordInput={settings.keywordInput}
      editing={settings.editingProfile}
      profileSaved={settings.profileSaved}
      profileError={settings.profileError}
      onToggleEdit={() => settings.toggleProfileEditing()}
      onSave={() => settings.saveProfile()}
      onAddStack={() => settings.addStack()}
      onRemoveStack={(tech) => settings.removeStack(tech)}
      onAddKeyword={() => settings.addKeyword()}
      onRemoveKeyword={(keyword) => settings.removeKeyword(keyword)}
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

    <!-- Apparence -->
    <div class="section-card rounded-xl p-5 space-y-4">
      <div>
        <h3 class="text-sm font-medium text-text-primary">Apparence</h3>
        <p class="mt-1 text-xs text-text-subtle">Choisir le thème de l'interface.</p>
      </div>
      <div class="flex gap-2">
        {#each [{ id: 'light', label: 'Clair', icon: 'sun' }, { id: 'dark', label: 'Sombre', icon: 'moon' }, { id: 'system', label: 'Système', icon: 'monitor' }] as option}
          <button
            class="flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors
              {settings.theme === option.id
              ? 'border-blueprint-blue bg-blueprint-blue/10 text-blueprint-blue'
              : 'border-border-light bg-page-canvas text-text-primary hover:bg-subtle-gray'}"
            onclick={() => settings.updateTheme(option.id as 'light' | 'dark' | 'system')}
          >
            <Icon name={option.icon} size={14} />
            {option.label}
          </button>
        {/each}
      </div>
    </div>

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
        <div
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blueprint-blue/6"
        >
          <Icon name="cpu" size={14} class="text-blueprint-blue" />
        </div>
        <div>
          <h3 class="text-sm font-medium text-text-primary">IA locale</h3>
          <p class="mt-1 text-xs text-text-subtle">
            Le scoring sémantique utilise Gemini Nano via la Prompt API de Chrome, sans clé API
            externe.
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
          <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">
            Missions / scan
          </p>
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
      onShowConfirm={() => {
        settings.showResetConfirm = true;
      }}
      onCancelConfirm={() => {
        settings.showResetConfirm = false;
      }}
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
