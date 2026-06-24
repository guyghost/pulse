<script lang="ts">
  import { Button } from '@pulse/ui';
  import { Icon } from '@pulse/ui';
  import type { IconName } from '@pulse/ui';
  import BackupRestoreModal from '../molecules/BackupRestoreModal.svelte';
  import ProfileSection from '../organisms/ProfileSection.svelte';
  import ScanSettings from '../organisms/ScanSettings.svelte';
  import DangerZone from '../organisms/DangerZone.svelte';
  import type { Mission } from '$lib/core/types/mission';
  import { SettingsPageController } from '$lib/state/settings-page.svelte';
  import type { ExportFormat } from '$lib/core/export/mission-export';
  import { showToast, showToastAction } from '$lib/shell/notifications/toast-service';
  import OperationalStoryCard, {
    type OperationalEvidence,
  } from '../molecules/OperationalStoryCard.svelte';
  import OfflineNotice from '../molecules/OfflineNotice.svelte';
  import AlertBuilderCard from '../molecules/AlertBuilderCard.svelte';
  import { DEFAULT_CONNECTED_ALERT_PREFERENCES } from '$lib/core/types/alert-preferences';
  import type { ConnectedAlertPreferences } from '$lib/core/types/alert-preferences';
  import {
    getAlertHistory,
    getAlertPreferences,
    saveAlertPreferences,
  } from '$lib/shell/facades/alert-preferences.facade';
  import type { AlertHistoryEntry } from '$lib/core/types/alert-history';
  import { getFavorites, getMissions, getSeenIds } from '$lib/shell/facades/feed-data.facade';
  import { getConnectionStore } from '$lib/state/connection-singleton.svelte';

  const {
    onBack,
    onNavigateToOnboarding,
  }: { onBack?: () => void; onNavigateToOnboarding?: () => void } = $props();

  const settings = new SettingsPageController({
    onNavigateToOnboarding: () => {
      onNavigateToOnboarding?.();
    },
  });
  const connection = getConnectionStore();
  const isOffline = $derived(connection.status === 'offline');

  type SettingsSectionId = 'sources' | 'alerts' | 'account' | 'data';

  type SettingsSectionLink = {
    id: SettingsSectionId;
    label: string;
    title: string;
    description: string;
    icon: IconName;
  };

  type AiTransparencyItem = {
    label: string;
    value: string;
    icon: IconName;
  };

  const settingsSections: SettingsSectionLink[] = [
    {
      id: 'sources',
      label: 'Sources',
      title: 'Radar et cadence',
      description: 'Profil, plateformes locales et fréquence de scan.',
      icon: 'radar',
    },
    {
      id: 'alerts',
      label: 'Alertes',
      title: 'Signal prioritaire',
      description: 'Seuil, stack et volume de notifications prévu.',
      icon: 'bell',
    },
    {
      id: 'account',
      label: 'Compte & IA',
      title: 'Synchronisation',
      description: 'Dashboard connecté et scoring sémantique local.',
      icon: 'cpu',
    },
    {
      id: 'data',
      label: 'Données',
      title: 'Exports et sécurité',
      description: 'Sauvegardes, apparence et suppression locale.',
      icon: 'database',
    },
  ];

  const aiTransparencyItems: AiTransparencyItem[] = [
    {
      label: 'Mission',
      value: 'Titre, description, stack, TJM, localisation et remote',
      icon: 'file-text',
    },
    {
      label: 'Profil',
      value: 'Stack cible, TJM cible, remote, localisation et mots-clés',
      icon: 'user',
    },
    {
      label: 'Cache',
      value: 'Scores conservés 7 jours, vidés quand le profil change',
      icon: 'database',
    },
    {
      label: 'Exclus',
      value: 'Sessions, cookies, identifiants et pages privées ne sont pas envoyés',
      icon: 'shield-check',
    },
  ];

  settings.load();
  let alertPreferences = $state<ConnectedAlertPreferences>(DEFAULT_CONNECTED_ALERT_PREFERENCES);
  let isSavingAlertPreferences = $state(false);
  let favoriteExportCount = $state(0);
  let alertPreviewMissions = $state<Mission[]>([]);
  let alertPreviewSeenIds = $state<string[]>([]);
  let alertHistory = $state<AlertHistoryEntry[]>([]);
  let aiSettingsSection: HTMLElement | null = $state(null);

  (async () => {
    const [storedAlertPreferences, favorites, missions, seenIds, storedAlertHistory] =
      await Promise.all([
        getAlertPreferences(),
        getFavorites(),
        getMissions(),
        getSeenIds(),
        getAlertHistory(),
      ]);
    alertPreferences = storedAlertPreferences;
    favoriteExportCount = Object.keys(favorites).length;
    alertPreviewMissions = missions;
    alertPreviewSeenIds = seenIds;
    alertHistory = storedAlertHistory;
  })().catch(() => {});

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

  async function handleSaveAlertPreferences(nextPreferences: ConnectedAlertPreferences) {
    const previousPreferences = alertPreferences;
    isSavingAlertPreferences = true;
    try {
      alertPreferences = await saveAlertPreferences(nextPreferences);
      showToastAction('Alerte prioritaire mise à jour', 'success', {
        label: 'Annuler',
        onClick: () => {
          void (async () => {
            try {
              alertPreferences = await saveAlertPreferences(previousPreferences);
              await showToast('Alerte prioritaire restaurée', 'success');
            } catch {
              await showToast("Impossible de restaurer l'alerte", 'error');
            }
          })();
        },
      });
    } catch {
      await showToast("Impossible d'enregistrer l'alerte", 'error');
    } finally {
      isSavingAlertPreferences = false;
    }
  }

  function focusAiSettings() {
    aiSettingsSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    aiSettingsSection?.focus({ preventScroll: true });
  }

  function scrollToSettingsSection(sectionId: SettingsSectionId) {
    document
      .getElementById(`settings-${sectionId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const profileReadyForBackup = $derived(
    settings.firstName.trim().length > 0 ||
      settings.jobTitle.trim().length > 0 ||
      settings.profileStack.length > 0
  );

  const exportStory = $derived.by(() => {
    const evidence: OperationalEvidence[] = [
      {
        label: 'Favoris',
        value: favoriteExportCount,
        icon: 'star',
        severity: favoriteExportCount > 0 ? 'success' : 'attention',
      },
      {
        label: 'Formats',
        value: 3,
        icon: 'file-down',
        severity: 'neutral',
      },
      {
        label: 'État',
        value: settings.isExporting ? 'En cours' : 'Prêt',
        icon: settings.isExporting ? 'loader' : 'check',
        severity: settings.isExporting ? 'attention' : 'success',
      },
    ];

    if (favoriteExportCount === 0) {
      return {
        severity: 'attention' as const,
        statusLabel: 'Rien à exporter',
        title: 'Aucune mission favorite ne peut être transmise',
        description:
          'L’export devient utile après qualification du feed. Retournez marquer les missions à suivre, puis revenez ici.',
        evidence,
        primaryActionLabel: 'Retourner au feed',
        primaryActionIcon: 'arrow-left',
      };
    }

    return {
      severity: 'success' as const,
      statusLabel: 'Export prêt',
      title: `${favoriteExportCount} mission${favoriteExportCount > 1 ? 's' : ''} prête${favoriteExportCount > 1 ? 's' : ''} à partager`,
      description:
        'Le prochain geste utile est de produire un rapport Markdown lisible avant les formats techniques.',
      evidence,
      primaryActionLabel: 'Exporter le rapport',
      primaryActionIcon: 'file-text',
    };
  });

  const backupStory = $derived.by(() => {
    const evidence: OperationalEvidence[] = [
      {
        label: 'Profil',
        value: profileReadyForBackup ? 'Prêt' : 'Manquant',
        icon: 'user',
        severity: profileReadyForBackup ? 'success' : 'attention',
      },
      {
        label: 'Favoris',
        value: favoriteExportCount,
        icon: 'star',
        severity: favoriteExportCount > 0 ? 'success' : 'neutral',
      },
      {
        label: 'Restore',
        value: 'Confirmé',
        icon: 'shield-check',
        severity: 'success',
      },
    ];

    if (!profileReadyForBackup) {
      return {
        severity: 'attention' as const,
        statusLabel: 'Préparation requise',
        title: 'La sauvegarde serait trop pauvre pour restaurer un espace utile',
        description:
          'Complétez au moins le profil ou la stack avant de créer un point de restauration.',
        evidence,
        primaryActionLabel: 'Compléter le profil',
        primaryActionIcon: 'user',
      };
    }

    return {
      severity: 'success' as const,
      statusLabel: 'Sauvegardable',
      title: 'Un point de restauration local peut être créé',
      description:
        'La sauvegarde capture profil, réglages, favoris et missions masquées. La restauration reste confirmée avant écriture.',
      evidence,
      primaryActionLabel: 'Créer une sauvegarde',
      primaryActionIcon: 'download',
    };
  });

  const aiStory = $derived.by(() => {
    const evidence: OperationalEvidence[] = [
      {
        label: 'Statut',
        value:
          settings.aiAvailability === 'available'
            ? 'OK'
            : settings.aiAvailability === 'after-download'
              ? 'Download'
              : 'Off',
        icon: 'cpu',
        severity:
          settings.aiAvailability === 'available'
            ? 'success'
            : settings.aiAvailability === 'after-download'
              ? 'attention'
              : 'incident',
      },
      {
        label: 'Couverture',
        value: settings.maxSemanticPerScan,
        icon: 'scan-line',
        severity: settings.maxSemanticPerScan > 0 ? 'success' : 'attention',
      },
      {
        label: 'Fallback',
        value: 'Score base',
        icon: 'shield-check',
        severity: 'success',
      },
    ];

    if (settings.aiAvailability === 'available') {
      return {
        severity: 'success' as const,
        statusLabel: 'Actif',
        title: 'Le scoring sémantique peut enrichir les décisions',
        description:
          'Pulse analysera les premières missions du scan, puis utilisera le cache pour éviter les recalculs inutiles.',
        evidence,
        primaryActionLabel: null,
        primaryActionIcon: 'play',
      };
    }

    return {
      severity:
        settings.aiAvailability === 'after-download'
          ? ('attention' as const)
          : ('incident' as const),
      statusLabel:
        settings.aiAvailability === 'after-download' ? 'Téléchargement requis' : 'Indisponible',
      title: 'Le scoring sémantique est remplacé par le scoring de base',
      description:
        'Ce n’est pas bloquant, mais les insights seront moins précis sur le fit métier et les signaux faibles.',
      evidence,
      primaryActionLabel: 'Ouvrir l’aide IA Chrome',
      primaryActionIcon: 'external-link',
    };
  });

  async function handleSettingsStoryAction() {
    if (!settings.isConnectedAccount) {
      await settings.openAccountCenter();
      return;
    }

    if (settings.connectedPendingUploads + settings.connectedPendingDownloads > 0) {
      await settings.openConnectedDashboard();
      return;
    }

    if (settings.aiAvailability !== 'available') {
      focusAiSettings();
      return;
    }

    await settings.openConnectedDashboard();
  }

  async function handleExportStoryAction() {
    if (favoriteExportCount === 0) {
      onBack?.();
      return;
    }
    await handleExportFavorites('markdown');
  }

  const settingsStory = $derived.by(() => {
    const pendingTotal = settings.connectedPendingUploads + settings.connectedPendingDownloads;
    const evidence: OperationalEvidence[] = [
      {
        label: 'Compte',
        value: settings.isConnectedAccount ? 'Connecté' : 'Local',
        icon: 'user',
        severity: settings.isConnectedAccount ? 'success' : 'attention',
      },
      {
        label: 'Sync',
        value: pendingTotal,
        icon: 'refresh-cw',
        severity: pendingTotal > 0 ? 'attention' : 'success',
      },
      {
        label: 'IA',
        value:
          settings.aiAvailability === 'available'
            ? 'OK'
            : settings.aiAvailability === 'after-download'
              ? 'À télécharger'
              : 'Off',
        icon: 'cpu',
        severity:
          settings.aiAvailability === 'available'
            ? 'success'
            : settings.aiAvailability === 'after-download'
              ? 'attention'
              : 'incident',
      },
    ];

    if (!settings.isConnectedAccount) {
      return {
        severity: 'attention' as const,
        statusLabel: 'Local uniquement',
        title: 'Pulse fonctionne, mais la synchronisation dashboard est inactive',
        description:
          'Les scans restent disponibles dans Chrome. Connectez le compte pour consolider snapshots, candidatures, CV et préférences.',
        evidence,
        primaryActionLabel: 'Connecter mon compte',
        primaryActionIcon: 'user',
      };
    }

    if (pendingTotal > 0) {
      return {
        severity: 'attention' as const,
        statusLabel: 'Sync en attente',
        title: `${pendingTotal} opération${pendingTotal > 1 ? 's' : ''} de synchronisation en file`,
        description:
          'Le dashboard connecté peut afficher un état légèrement en retard tant que la file locale n’est pas vide.',
        evidence,
        primaryActionLabel: 'Ouvrir le dashboard',
        primaryActionIcon: 'external-link',
      };
    }

    if (settings.aiAvailability !== 'available') {
      return {
        severity:
          settings.aiAvailability === 'after-download'
            ? ('attention' as const)
            : ('incident' as const),
        statusLabel: 'IA locale limitée',
        title: 'Le scoring sémantique ne couvre pas toutes les missions',
        description:
          'Pulse continue avec le scoring de base. Activez ou téléchargez Gemini Nano pour enrichir les insights.',
        evidence,
        primaryActionLabel: 'Voir les réglages IA',
        primaryActionIcon: 'cpu',
      };
    }

    return {
      severity: 'success' as const,
      statusLabel: 'Système sain',
      title: 'Configuration opérationnelle',
      description:
        'Compte, synchronisation et IA locale sont prêts. Les réglages ci-dessous servent surtout à ajuster le comportement.',
      evidence,
      primaryActionLabel: 'Ouvrir le dashboard',
      primaryActionIcon: 'external-link',
    };
  });
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

    <div class="mt-4">
      <OperationalStoryCard
        eyebrow="État système"
        title={settingsStory.title}
        description={settingsStory.description}
        severity={settingsStory.severity}
        statusLabel={settingsStory.statusLabel}
        evidence={settingsStory.evidence}
        primaryActionLabel={settingsStory.primaryActionLabel}
        primaryActionIcon={settingsStory.primaryActionIcon}
        onPrimaryAction={handleSettingsStoryAction}
      />
    </div>
    {#if isOffline}
      <div class="mt-3">
        <OfflineNotice
          description="Les réglages locaux restent accessibles. Le centre de compte, les dashboards connectés et certaines restaurations peuvent être indisponibles."
          action="Prochaine action : ajuster les alertes locales, puis vérifier le compte au retour réseau."
        />
      </div>
    {/if}
  </section>

  <section class="section-card rounded-xl p-4" aria-label="Sections de réglages">
    <div class="grid gap-2 sm:grid-cols-2">
      {#each settingsSections as section}
        <button
          type="button"
          class="flex min-h-20 items-start gap-3 rounded-lg border border-border-light bg-page-canvas p-3 text-left transition-colors hover:border-blueprint-blue/25 hover:bg-blueprint-blue/6 focus:outline-none focus:ring-2 focus:ring-blueprint-blue/30"
          onclick={() => scrollToSettingsSection(section.id)}
        >
          <span
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-light bg-surface-white text-blueprint-blue"
          >
            <Icon name={section.icon} size={14} />
          </span>
          <span class="min-w-0">
            <span
              class="block text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted"
            >
              {section.label}
            </span>
            <span class="mt-1 block text-xs font-medium text-text-primary">{section.title}</span>
            <span class="mt-1 block text-[11px] leading-4 text-text-subtle">
              {section.description}
            </span>
          </span>
        </button>
      {/each}
    </div>
  </section>

  <div class="mt-4 space-y-4">
    <section
      id="settings-sources"
      class="scroll-mt-4 space-y-4"
      aria-labelledby="settings-sources-title"
    >
      <div class="flex items-start gap-3 px-1">
        <div
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blueprint-blue/6"
        >
          <Icon name="radar" size={14} class="text-blueprint-blue" />
        </div>
        <div>
          <p class="eyebrow text-text-muted">Sources</p>
          <h3 id="settings-sources-title" class="mt-1 text-sm font-semibold text-text-primary">
            Calibrer le radar local
          </h3>
          <p class="mt-1 text-xs leading-5 text-text-subtle">
            Profil, critères et cadence de scan alimentent les résultats visibles dans le feed.
          </p>
        </div>
      </div>

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

      <ScanSettings
        autoScan={settings.autoScan}
        scanInterval={settings.scanInterval}
        notifications={settings.notifications}
        lastScanLabel={settings.lastScanLabel}
        scanHistoryLabel={settings.scanHistoryLabel}
        nextScanLabel={settings.nextScanLabel}
        scanHistoryTone={settings.scanHistoryTone}
        onToggleAutoScan={() => settings.toggleAutoScan()}
        onToggleNotifications={() => settings.toggleNotifications()}
        onScanIntervalChange={handleScanIntervalChange}
      />
    </section>

    <section
      id="settings-alerts"
      class="scroll-mt-4 space-y-4"
      aria-labelledby="settings-alerts-title"
    >
      <div class="flex items-start gap-3 px-1">
        <div
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blueprint-blue/6"
        >
          <Icon name="bell" size={14} class="text-blueprint-blue" />
        </div>
        <div>
          <p class="eyebrow text-text-muted">Alertes</p>
          <h3 id="settings-alerts-title" class="mt-1 text-sm font-semibold text-text-primary">
            Piloter le bruit utile
          </h3>
          <p class="mt-1 text-xs leading-5 text-text-subtle">
            Ajustez les conditions avant d’autoriser une notification prioritaire.
          </p>
        </div>
      </div>

      <AlertBuilderCard
        preferences={alertPreferences}
        availableStacks={settings.profileStack}
        previewMissions={alertPreviewMissions}
        seenMissionIds={alertPreviewSeenIds}
        history={alertHistory}
        isSaving={isSavingAlertPreferences}
        onSave={handleSaveAlertPreferences}
      />
    </section>

    <section
      id="settings-account"
      class="scroll-mt-4 space-y-4"
      aria-labelledby="settings-account-title"
    >
      <div class="flex items-start gap-3 px-1">
        <div
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blueprint-blue/6"
        >
          <Icon name="cpu" size={14} class="text-blueprint-blue" />
        </div>
        <div>
          <p class="eyebrow text-text-muted">Compte & IA</p>
          <h3 id="settings-account-title" class="mt-1 text-sm font-semibold text-text-primary">
            Synchroniser et enrichir
          </h3>
          <p class="mt-1 text-xs leading-5 text-text-subtle">
            Le dashboard connecté et Gemini Nano restent optionnels, mais clarifient le pilotage.
          </p>
        </div>
      </div>

      <div class="section-card rounded-xl p-5 space-y-4">
        <div class="flex items-start gap-3">
          <div
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blueprint-blue/6"
          >
            <Icon name="database" size={14} class="text-blueprint-blue" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 class="text-sm font-medium text-text-primary">Compte et synchronisation</h3>
                <p class="mt-1 text-xs leading-5 text-text-subtle">
                  Le scan reste local. Le compte MissionPulse sert à synchroniser les snapshots vers
                  le dashboard connecté.
                </p>
              </div>
              <span
                class="rounded-md border px-2 py-1 text-[10px] font-medium {settings.isConnectedAccount
                  ? 'border-blueprint-blue/25 bg-blueprint-blue/8 text-blueprint-blue'
                  : 'border-border-light bg-page-canvas text-text-subtle'}"
              >
                {settings.accountStatusLabel}
              </span>
            </div>
          </div>
        </div>

        <div class="grid gap-2 sm:grid-cols-2">
          <div class="rounded-lg border border-border-light bg-page-canvas px-3 py-2.5">
            <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">Compte</p>
            <p class="mt-1 text-xs font-medium text-text-primary">
              {settings.connectedAccountEmail ?? 'Non connecté'}
            </p>
          </div>
          <div class="rounded-lg border border-border-light bg-page-canvas px-3 py-2.5">
            <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">Plan</p>
            <p class="mt-1 text-xs font-medium text-text-primary">
              {settings.premiumEnabled ? 'Premium local actif' : 'Gratuit local'}
            </p>
          </div>
          <div class="rounded-lg border border-border-light bg-page-canvas px-3 py-2.5">
            <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">
              Appareil
            </p>
            <p class="mt-1 text-xs font-medium text-text-primary">
              {settings.connectedDeviceLabel}
            </p>
          </div>
          <div class="rounded-lg border border-border-light bg-page-canvas px-3 py-2.5">
            <p class="text-[9px] font-medium uppercase tracking-[0.15em] text-text-muted">File</p>
            <p class="mt-1 text-xs font-medium text-text-primary">
              {settings.connectedPendingUploads} upload · {settings.connectedPendingDownloads}
              download
            </p>
          </div>
        </div>

        <p
          class="rounded-lg border border-border-light bg-surface-white px-3 py-2 text-xs leading-5 text-text-subtle"
        >
          {settings.syncStatusText}
        </p>

        <div class="flex flex-wrap gap-2">
          <button
            class="inline-flex items-center gap-2 rounded-lg bg-blueprint-blue px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blueprint-blue/90"
            onclick={() => settings.openAccountCenter()}
          >
            <Icon name="user" size={13} />
            {settings.isConnectedAccount ? 'Gérer mon compte' : 'Connecter mon compte'}
          </button>
          <button
            class="inline-flex items-center gap-2 rounded-lg border border-border-light bg-surface-white px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-subtle-gray"
            onclick={() => settings.openConnectedDashboard()}
          >
            <Icon name="external-link" size={13} />
            Ouvrir le dashboard connecté
          </button>
        </div>

        <p class="text-[11px] leading-5 text-text-muted">
          Les sessions Free-Work, LeHibou, Hiway, Collective et Cherry Pick restent dans Chrome;
          seuls les résultats normalisés, les candidatures, le CV et les préférences peuvent être
          synchronisés.
        </p>
      </div>

      <div
        class="section-card rounded-xl p-5 space-y-3"
        bind:this={aiSettingsSection}
        tabindex="-1"
      >
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
        <OperationalStoryCard
          eyebrow="Scoring"
          title={aiStory.title}
          description={aiStory.description}
          severity={aiStory.severity}
          statusLabel={aiStory.statusLabel}
          evidence={aiStory.evidence}
          primaryActionLabel={aiStory.primaryActionLabel}
          primaryActionIcon={aiStory.primaryActionIcon}
          onPrimaryAction={() => settings.openAiHelp()}
        />
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
        <div class="rounded-lg border border-blueprint-blue/15 bg-blueprint-blue/5 px-3 py-3">
          <div class="flex items-start gap-2">
            <Icon name="shield-check" size={14} class="mt-0.5 shrink-0 text-blueprint-blue" />
            <div class="min-w-0">
              <p class="text-xs font-medium text-text-primary">Données utilisées par l'IA locale</p>
              <p class="mt-1 text-[11px] leading-5 text-text-subtle">
                Gemini Nano reçoit uniquement le contexte utile au score sémantique. Le résultat
                reste local avec le score et une raison courte.
              </p>
            </div>
          </div>
          <div class="mt-3 grid gap-2 sm:grid-cols-2">
            {#each aiTransparencyItems as item}
              <div class="rounded-md bg-surface-white px-2.5 py-2">
                <div class="flex items-center gap-1.5">
                  <Icon name={item.icon} size={12} class="text-blueprint-blue" />
                  <p class="text-[9px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                    {item.label}
                  </p>
                </div>
                <p class="mt-1 text-[11px] leading-4 text-text-secondary">{item.value}</p>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </section>

    <section id="settings-data" class="scroll-mt-4 space-y-4" aria-labelledby="settings-data-title">
      <div class="flex items-start gap-3 px-1">
        <div
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blueprint-blue/6"
        >
          <Icon name="database" size={14} class="text-blueprint-blue" />
        </div>
        <div>
          <p class="eyebrow text-text-muted">Données</p>
          <h3 id="settings-data-title" class="mt-1 text-sm font-semibold text-text-primary">
            Sorties, restauration et nettoyage
          </h3>
          <p class="mt-1 text-xs leading-5 text-text-subtle">
            Les actions qui modifient ou exportent l’espace local sont regroupées ici.
          </p>
        </div>
      </div>

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

      <div class="section-card rounded-xl p-5 space-y-4">
        <div>
          <h3 class="text-sm font-medium text-text-primary">Export</h3>
          <p class="mt-1 text-xs text-text-subtle">
            Préparer une shortlist partageable ou sortir les données brutes.
          </p>
        </div>
        <OperationalStoryCard
          eyebrow="Décision"
          title={exportStory.title}
          description={exportStory.description}
          severity={exportStory.severity}
          statusLabel={exportStory.statusLabel}
          evidence={exportStory.evidence}
          primaryActionLabel={exportStory.primaryActionLabel}
          primaryActionIcon={exportStory.primaryActionIcon}
          onPrimaryAction={handleExportStoryAction}
        />
        <div class="rounded-lg border border-blueprint-blue/15 bg-blueprint-blue/5 px-3 py-3">
          <div class="flex items-start gap-2">
            <Icon name="file-text" size={14} class="mt-0.5 shrink-0 text-blueprint-blue" />
            <div class="min-w-0">
              <p class="text-xs font-medium text-text-primary">Rapport shortlist</p>
              <p class="mt-1 text-[11px] leading-5 text-text-subtle">
                Le Markdown inclut synthèse, critères visibles, signaux de score, liens sources et
                rappel de confidentialité locale.
              </p>
            </div>
          </div>
          <div class="mt-3 grid grid-cols-3 gap-2 text-center">
            <div class="rounded-md bg-surface-white px-2 py-2">
              <p class="font-mono text-sm font-semibold tabular-nums text-text-primary">
                {favoriteExportCount}
              </p>
              <p class="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-text-muted">Favoris</p>
            </div>
            <div class="rounded-md bg-surface-white px-2 py-2">
              <p class="text-sm font-semibold text-text-primary">MD</p>
              <p class="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-text-muted">Rapport</p>
            </div>
            <div class="rounded-md bg-surface-white px-2 py-2">
              <p class="text-sm font-semibold text-text-primary">Local</p>
              <p class="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-text-muted">Sessions</p>
            </div>
          </div>
        </div>
        <div class="rounded-lg border border-border-light bg-page-canvas px-3 py-3">
          <p class="text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted">
            Formats secondaires
          </p>
          <div class="mt-2 flex flex-wrap gap-2">
            <button
              class="inline-flex items-center gap-2 rounded-lg border border-border-light bg-surface-white px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-subtle-gray disabled:opacity-50"
              onclick={() => handleExportFavorites('json')}
              disabled={settings.isExporting}
            >
              <Icon name="file-json" size={14} class="text-blueprint-blue" />
              JSON
            </button>
            <button
              class="inline-flex items-center gap-2 rounded-lg border border-border-light bg-surface-white px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-subtle-gray disabled:opacity-50"
              onclick={() => handleExportFavorites('csv')}
              disabled={settings.isExporting}
            >
              <Icon name="file-spreadsheet" size={14} class="text-blueprint-blue" />
              CSV
            </button>
            <button
              class="inline-flex items-center gap-2 rounded-lg border border-border-light bg-surface-white px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-subtle-gray disabled:opacity-50"
              onclick={() => handleExportFavorites('markdown')}
              disabled={settings.isExporting}
            >
              <Icon name="file-text" size={14} class="text-blueprint-blue" />
              Markdown
            </button>
          </div>
        </div>
        {#if settings.exportSuccess && settings.lastExportSummary}
          <div
            class="rounded-lg border border-blueprint-blue/20 bg-blueprint-blue/6 px-3 py-2"
            role="status"
            aria-live="polite"
          >
            <div class="flex items-start gap-2">
              <Icon name="check-circle-2" size={14} class="mt-0.5 shrink-0 text-blueprint-blue" />
              <div class="min-w-0">
                <p class="text-xs font-medium text-text-primary">Export prêt à partager</p>
                <p class="mt-0.5 text-[11px] leading-4 text-text-subtle">
                  {settings.lastExportSummary}
                </p>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <div class="section-card rounded-xl p-5 space-y-4">
        <div>
          <h3 class="text-sm font-medium text-text-primary">Sauvegarde</h3>
          <p class="mt-1 text-xs text-text-subtle">
            Sauvegarder ou restaurer vos données (profil, paramètres, favoris).
          </p>
        </div>
        <OperationalStoryCard
          eyebrow="Continuité"
          title={backupStory.title}
          description={backupStory.description}
          severity={backupStory.severity}
          statusLabel={backupStory.statusLabel}
          evidence={backupStory.evidence}
          primaryActionLabel={null}
          primaryActionIcon={backupStory.primaryActionIcon}
        />
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

      <DangerZone
        showResetConfirm={settings.showResetConfirm}
        onShowConfirm={() => {
          settings.showResetConfirm = true;
        }}
        onCancelConfirm={() => {
          settings.showResetConfirm = false;
        }}
        onConfirmReset={() => settings.resetAll()}
        onCreateBackup={handleCreateBackup}
      />
    </section>
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
