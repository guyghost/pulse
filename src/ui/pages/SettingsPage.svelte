<script lang="ts">
  import SettingsLayout from '../templates/SettingsLayout.svelte';
  import ConnectorPanel from '../organisms/ConnectorPanel.svelte';
  import Button from '../atoms/Button.svelte';
  import Icon from '../atoms/Icon.svelte';
  import BackupRestoreModal from '../molecules/BackupRestoreModal.svelte';
  import type { Mission } from '$lib/core/types/mission';

  /** Statuts UI d'un connecteur (settings) */
  type ConnectorStatus = 'detecting' | 'authenticated' | 'expired' | 'fetching' | 'done' | 'error';
  import type { BackupData, ValidationError } from '$lib/core/backup/backup';
  import { getSettings, setSettings, getApiKey, setApiKey, type AppSettings } from '$lib/shell/storage/chrome-storage';
  import { getProfile, saveProfile } from '$lib/shell/storage/db';
  import { getConnectorsMeta, getConnectors, type ConnectorMeta, preloadConnector } from '$lib/shell/connectors/index';
  import { getFavorites, getHidden, saveFavorites, saveHidden } from '$lib/shell/storage/favorites';
  import { exportMissionsToJSON, exportMissionsToCSV, exportMissionsToMarkdown, generateFilename, type ExportFormat } from '$lib/core/export/mission-export';
  import { downloadJSON, downloadCSV, downloadMarkdown } from '$lib/shell/export/download';
  import { createBackup, validateBackup, serializeBackup, parseBackupJson, generateBackupFilename, type Result } from '$lib/core/backup/backup';

  let { onBack }: { onBack?: () => void } = $props();

  // --- Profil ---
  let firstName = $state('');
  let jobTitle = $state('');
  let profileLocation = $state('');
  let tjmMin = $state(0);
  let tjmMax = $state(0);
  let editingProfile = $state(false);
  let profileSaved = $state(false);

  // --- API Key ---
  let apiKey = $state('');
  let apiKeySaved = $state(false);

  // --- Scan ---
  let scanInterval = $state(30);

  // --- Notifications ---
  let notifications = $state(true);

  // --- Auto-scan ---
  let autoScan = $state(true);

  // --- Connecteurs ---
  interface ConnectorUIState extends ConnectorMeta {
    status: ConnectorStatus;
    lastSync: Date | null;
    enabled: boolean;
    loading: boolean;
  }

  let connectors = $state<ConnectorUIState[]>([]);

  // --- Reset ---
  let showResetConfirm = $state(false);

  // --- Export ---
  let isExporting = $state(false);
  let exportSuccess = $state(false);

  // --- Backup/Restore ---
  let showBackupModal = $state(false);
  let pendingBackup: BackupData | null = $state(null);
  let backupError: ValidationError | null = $state(null);
  let fileInput: HTMLInputElement | null = $state(null);

  // Chargement initial (fire-and-forget, pas besoin de reactivite)
  loadProfile();
  loadApiKey();
  loadSettings();

  async function loadProfile() {
    try {
      const profile = await getProfile();
      if (profile) {
        firstName = profile.firstName ?? '';
        jobTitle = profile.jobTitle ?? '';
        profileLocation = profile.location ?? '';
        tjmMin = profile.tjmMin ?? 0;
        tjmMax = profile.tjmMax ?? 0;
      }
    } catch {
      // Hors contexte extension
    }
  }

  async function loadApiKey() {
    try {
      const key = await getApiKey();
      if (key) apiKey = key;
    } catch {
      // Hors contexte extension
    }
  }

  async function loadSettings() {
    try {
      const settings = await getSettings();
      scanInterval = settings.scanIntervalMinutes;
      notifications = settings.notifications;
      autoScan = settings.autoScan;

      // Phase 1: Afficher les connecteurs avec metadata statique (pas de chargement)
      const meta = getConnectorsMeta();
      connectors = meta.map((m) => ({
        ...m,
        status: 'detecting',
        lastSync: null,
        enabled: settings.enabledConnectors.includes(m.id),
        loading: true,
      }));

      // Phase 2: Lazy load des connecteurs actifs en priorité
      const activeIds = settings.enabledConnectors;
      const now = Date.now();
      
      if (activeIds.length > 0) {
        // Préchargement des connecteurs actifs
        activeIds.forEach((id) => preloadConnector(id));
        
        // Charger les connecteurs actifs pour la détection de session
        const activeConnectors = await getConnectors(activeIds);
        
        // Mettre à jour l'état des connecteurs actifs
        await Promise.all(
          activeConnectors.map(async (c) => {
            const sessionResult = await c.detectSession(now);
            const lastSyncResult = await c.getLastSync(now);
            
            // Gérer les erreurs
            if (!sessionResult.ok || !lastSyncResult.ok) {
              connectors = connectors.map((conn) =>
                conn.id === c.id
                  ? { ...conn, status: 'error' as ConnectorStatus, loading: false }
                  : conn
              );
              return;
            }
            
            const hasSession = sessionResult.value;
            const lastSync = lastSyncResult.value;
            
            connectors = connectors.map((conn) =>
              conn.id === c.id
                ? {
                    ...conn,
                    status: (hasSession ? 'authenticated' : 'expired') as ConnectorStatus,
                    lastSync,
                    loading: false,
                  }
                : conn
            );
          })
        );
      }

      // Phase 3: Charger les connecteurs inactifs en arrière-plan
      const inactiveIds = meta.map((m) => m.id).filter((id) => !activeIds.includes(id));
      
      // Chargement progressif des inactifs
      for (const id of inactiveIds) {
        const c = await getConnectors([id]).then((arr) => arr[0]);
        if (c) {
          const sessionResult = await c.detectSession(now);
          const lastSyncResult = await c.getLastSync(now);
          
          if (!sessionResult.ok || !lastSyncResult.ok) {
            connectors = connectors.map((conn) =>
              conn.id === c.id
                ? { ...conn, status: 'error' as ConnectorStatus, loading: false }
                : conn
            );
          } else {
            const hasSession = sessionResult.value;
            const lastSync = lastSyncResult.value;
            
            connectors = connectors.map((conn) =>
              conn.id === c.id
                ? {
                    ...conn,
                    status: (hasSession ? 'authenticated' : 'expired') as ConnectorStatus,
                    lastSync,
                    loading: false,
                  }
                : conn
            );
          }
        } else {
          // Connecteur non trouvé, marquer comme erreur
          connectors = connectors.map((conn) =>
            conn.id === id
              ? { ...conn, status: 'error' as ConnectorStatus, loading: false }
              : conn
          );
        }
      }
    } catch {
      // Hors contexte extension — fallback statique
      const meta = getConnectorsMeta();
      connectors = meta.map((m) => ({
        ...m,
        status: 'detecting' as ConnectorStatus,
        lastSync: null,
        enabled: false,
        loading: false,
      }));
    }
  }

  async function handleSaveProfile() {
    try {
      const current = await getProfile();
      await saveProfile({
        firstName,
        jobTitle,
        location: profileLocation,
        tjmMin,
        tjmMax,
        stack: current?.stack ?? [],
        remote: current?.remote ?? 'any',
        seniority: current?.seniority ?? 'senior',
      });
      editingProfile = false;
      profileSaved = true;
      setTimeout(() => { profileSaved = false; }, 2000);
    } catch {
      // Hors contexte extension
    }
  }

  async function handleSaveApiKey() {
    if (!apiKey.trim()) return;
    try {
      await setApiKey(apiKey);
      apiKeySaved = true;
      setTimeout(() => { apiKeySaved = false; }, 2000);
    } catch {
      // Hors contexte extension
    }
  }

  async function handleScanIntervalChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    scanInterval = value;
    try {
      const settings = await getSettings();
      await setSettings({ ...settings, scanIntervalMinutes: value });
    } catch {
      // Hors contexte extension
    }
  }

  async function handleToggleNotifications() {
    notifications = !notifications;
    try {
      const settings = await getSettings();
      await setSettings({ ...settings, notifications });
    } catch {
      // Hors contexte extension
    }
  }

  async function handleToggleAutoScan() {
    autoScan = !autoScan;
    try {
      const settings = await getSettings();
      await setSettings({ ...settings, autoScan });
    } catch {
      // Hors contexte extension
    }
  }

  async function toggleConnector(id: string) {
    connectors = connectors.map(c =>
      c.id === id ? { ...c, enabled: !c.enabled } : c
    );
    try {
      const settings = await getSettings();
      const enabledConnectors = connectors.filter(c => c.enabled).map(c => c.id);
      await setSettings({ ...settings, enabledConnectors });
    } catch {
      // Hors contexte extension
    }
  }

  async function toggleAllConnectors(enabled: boolean) {
    connectors = connectors.map(c => ({ ...c, enabled }));
    try {
      const settings = await getSettings();
      const enabledConnectors = enabled ? connectors.map(c => c.id) : [];
      await setSettings({ ...settings, enabledConnectors });
    } catch {
      // Hors contexte extension
    }
  }

  async function handleResetAll() {
    try {
      await chrome.storage.local.clear();
      const databases = await indexedDB.databases();
      for (const db of databases) {
        if (db.name) indexedDB.deleteDatabase(db.name);
      }
      showResetConfirm = false;
      // Recharger la page
      window.location.reload();
    } catch {
      // Hors contexte extension
    }
  }

  // --- Export handlers ---
  async function handleExportFavorites(format: ExportFormat) {
    try {
      isExporting = true;
      const favorites = await getFavorites();
      const favoriteIds = Object.keys(favorites);

      if (favoriteIds.length === 0) {
        alert('Aucune mission favorite à exporter');
        isExporting = false;
        return;
      }

      // Récupérer les missions depuis IndexedDB
      const { getMissions } = await import('$lib/shell/storage/db');
      const allMissions = await getMissions();
      const favoriteMissions = allMissions.filter(m => favoriteIds.includes(m.id));

      const now = new Date();
      const filename = generateFilename('favoris', format);

      switch (format) {
        case 'json':
          downloadJSON(exportMissionsToJSON(favoriteMissions, { format, includeDescription: true }, now), filename);
          break;
        case 'csv':
          downloadCSV(exportMissionsToCSV(favoriteMissions, { format, includeDescription: false }, now), filename);
          break;
        case 'markdown':
          downloadMarkdown(exportMissionsToMarkdown(favoriteMissions, { format, includeDescription: true }, now), filename);
          break;
      }

      exportSuccess = true;
      setTimeout(() => { exportSuccess = false; }, 2000);
    } catch (e) {
      console.error('Erreur lors de l\'export:', e);
      alert('Erreur lors de l\'export des favoris');
    } finally {
      isExporting = false;
    }
  }

  // --- Backup handlers ---
  async function handleCreateBackup() {
    try {
      const [profile, settings, favorites, hidden] = await Promise.all([
        getProfile(),
        getSettings(),
        getFavorites(),
        getHidden(),
      ]);

      if (!profile) {
        alert('Veuillez configurer votre profil avant de créer un backup');
        return;
      }

      const backup = createBackup(profile, settings, favorites, hidden, Date.now());
      const json = serializeBackup(backup);
      const filename = generateBackupFilename(backup.timestamp);

      downloadJSON(json, filename);
    } catch (e) {
      console.error('Erreur lors de la création du backup:', e);
      alert('Erreur lors de la création du backup');
    }
  }

  async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parseResult = parseBackupJson(text);

      if (!parseResult.ok) {
        backupError = parseResult.error;
        pendingBackup = null;
        showBackupModal = true;
        return;
      }

      const validateResult = validateBackup(parseResult.value);

      if (!validateResult.ok) {
        backupError = validateResult.error;
        pendingBackup = null;
      } else {
        backupError = null;
        pendingBackup = validateResult.value;
      }

      showBackupModal = true;
    } catch (e) {
      backupError = { type: 'INVALID_JSON', message: 'Impossible de lire le fichier' };
      pendingBackup = null;
      showBackupModal = true;
    } finally {
      // Reset input
      if (fileInput) fileInput.value = '';
    }
  }

  async function handleRestoreBackup() {
    if (!pendingBackup) return;

    try {
      const { profile, settings, favorites, hidden } = pendingBackup;

      await Promise.all([
        saveProfile(profile),
        setSettings(settings),
        saveFavorites(favorites),
        saveHidden(hidden),
      ]);

      showBackupModal = false;
      pendingBackup = null;
      backupError = null;

      // Recharger pour refléter les changements
      window.location.reload();
    } catch (e) {
      console.error('Erreur lors de la restauration:', e);
      alert('Erreur lors de la restauration du backup');
    }
  }

  function handleCancelRestore() {
    showBackupModal = false;
    pendingBackup = null;
    backupError = null;
  }

  function triggerFileSelect() {
    fileInput?.click();
  }
</script>

<SettingsLayout {onBack} content={settingsContent}>
  {#snippet settingsContent()}
    <div class="space-y-6">
      <!-- Profil -->
      <div class="section-card-strong rounded-[1.5rem] p-4 space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Icon name="edit-2" size={12} class="text-accent-blue/60" />
            <div>
              <h3 class="text-sm font-semibold text-text-primary">Profil</h3>
              <p class="mt-1 text-xs leading-relaxed text-text-secondary">Vos informations de freelance.</p>
            </div>
          </div>
          <button
            class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-text-secondary transition-colors hover:bg-white/[0.08] hover:text-text-primary"
            onclick={() => { editingProfile = !editingProfile; }}
            title={editingProfile ? 'Annuler' : 'Modifier'}
          >
            <Icon name={editingProfile ? 'x' : 'edit-2'} size={14} />
          </button>
        </div>

        {#if editingProfile}
          <div class="space-y-2">
            <input
              type="text"
              placeholder="Prenom"
              class="soft-ring w-full rounded-[1.1rem] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue/30 focus:ring-2 focus:ring-accent-blue/15"
              bind:value={firstName}
            />
            <input
              type="text"
              placeholder="Poste (ex: Developpeur React Senior)"
              class="soft-ring w-full rounded-[1.1rem] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue/30 focus:ring-2 focus:ring-accent-blue/15"
              bind:value={jobTitle}
            />
            <input
              type="text"
              placeholder="Localisation"
              class="soft-ring w-full rounded-[1.1rem] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue/30 focus:ring-2 focus:ring-accent-blue/15"
              bind:value={profileLocation}
            />
            <div class="flex gap-2">
              <input
                type="number"
                placeholder="TJM min"
                class="soft-ring flex-1 rounded-[1.1rem] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue/30 focus:ring-2 focus:ring-accent-blue/15"
                bind:value={tjmMin}
              />
              <input
                type="number"
                placeholder="TJM max"
                class="soft-ring flex-1 rounded-[1.1rem] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-blue/30 focus:ring-2 focus:ring-accent-blue/15"
                bind:value={tjmMax}
              />
            </div>
            <Button variant="secondary" onclick={handleSaveProfile}>
              {#snippet children()}{profileSaved ? 'Sauvegarde !' : 'Enregistrer le profil'}{/snippet}
            </Button>
          </div>
        {:else}
          <div class="space-y-1 text-sm">
            <p class="text-text-primary">{firstName || 'Non renseigne'} {jobTitle ? `— ${jobTitle}` : ''}</p>
            <p class="text-text-secondary">{profileLocation || 'Localisation non renseignee'}</p>
            {#if tjmMin > 0 || tjmMax > 0}
              <p class="text-text-secondary">TJM : {tjmMin} - {tjmMax} EUR/jour</p>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Cle API -->
      <div class="section-card-strong rounded-[1.5rem] p-4 space-y-3">
        <div class="flex items-center gap-2">
          <Icon name="edit-2" size={12} class="text-accent-blue/60" />
          <div>
            <h3 class="text-sm font-semibold text-text-primary">Cle API Anthropic</h3>
            <p class="mt-1 text-xs leading-relaxed text-text-secondary">Necessaire pour enrichir l'analyse TJM locale avec le modele.</p>
          </div>
        </div>
        <div class="flex gap-2">
          <input
            type="password"
            placeholder="sk-ant-..."
            class="soft-ring flex-1 rounded-[1.1rem] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-mono text-text-primary focus:outline-none focus:border-accent-blue/30 focus:ring-2 focus:ring-accent-blue/15"
            bind:value={apiKey}
          />
          <Button variant="secondary" onclick={handleSaveApiKey}>
            {#snippet children()}{apiKeySaved ? 'Sauve !' : 'Sauver'}{/snippet}
          </Button>
        </div>
      </div>

      <!-- Scan automatique -->
      <div class="section-card rounded-[1.5rem] p-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-semibold text-text-primary">Scan automatique</h3>
            <p class="mt-1 text-xs leading-relaxed text-text-secondary">Scanner les plateformes en arriere-plan automatiquement.</p>
          </div>
          <button
            class="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200 {autoScan ? 'border-accent-emerald/30 bg-accent-emerald/20' : 'border-white/10 bg-white/[0.05]'}"
            onclick={handleToggleAutoScan}
            role="switch"
            aria-checked={autoScan}
            aria-label="Activer le scan automatique"
          >
            <span class="inline-block h-5 w-5 rounded-full transition-transform duration-200 {autoScan ? 'translate-x-6 bg-accent-emerald' : 'translate-x-0.5 bg-text-muted'}"></span>
          </button>
        </div>
      </div>

      <!-- Intervalle de scan -->
      <div class="section-card rounded-[1.5rem] p-4 space-y-3 transition-opacity duration-200" class:opacity-40={!autoScan} class:pointer-events-none={!autoScan}>
        <div>
          <h3 class="text-sm font-semibold text-text-primary">Frequence de scan</h3>
          <p class="mt-1 text-xs leading-relaxed text-text-secondary">Scanner les plateformes toutes les {scanInterval} minutes.</p>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs text-text-muted">5 min</span>
          <input
            type="range"
            min="5"
            max="120"
            step="5"
            value={scanInterval}
            onchange={handleScanIntervalChange}
            class="flex-1 accent-accent-blue"
          />
          <span class="text-xs text-text-muted">120 min</span>
        </div>
        <p class="text-center text-sm font-semibold text-accent-blue">{scanInterval} min</p>
        {#if !autoScan}
          <p class="text-center text-[11px] text-text-muted">Activez le scan automatique pour configurer la frequence.</p>
        {/if}
      </div>

      <!-- Notifications -->
      <div class="section-card rounded-[1.5rem] p-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-semibold text-text-primary">Notifications</h3>
            <p class="mt-1 text-xs leading-relaxed text-text-secondary">Recevoir une alerte quand de nouvelles missions arrivent.</p>
          </div>
          <button
            class="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200 {notifications ? 'border-accent-emerald/30 bg-accent-emerald/20' : 'border-white/10 bg-white/[0.05]'}"
            onclick={handleToggleNotifications}
            role="switch"
            aria-checked={notifications}
            aria-label="Activer les notifications"
          >
            <span class="inline-block h-5 w-5 rounded-full transition-transform duration-200 {notifications ? 'translate-x-6 bg-accent-emerald' : 'translate-x-0.5 bg-text-muted'}"></span>
          </button>
        </div>
      </div>

      <!-- Connecteurs -->
      <ConnectorPanel
        {connectors}
        onToggle={toggleConnector}
        onToggleAll={toggleAllConnectors}
      />

      <!-- Export -->
      <div class="section-card rounded-[1.5rem] p-4 space-y-4">
        <div>
          <h3 class="text-sm font-semibold text-text-primary">Export</h3>
          <p class="mt-1 text-xs leading-relaxed text-text-secondary">Exporter vos missions favorites dans différents formats.</p>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            class="inline-flex items-center gap-2 rounded-[1rem] border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-medium text-text-primary transition-all hover:bg-white/[0.1] disabled:opacity-50"
            onclick={() => handleExportFavorites('json')}
            disabled={isExporting}
          >
            <Icon name="file-json" size={16} class="text-accent-blue" />
            JSON
          </button>
          <button
            class="inline-flex items-center gap-2 rounded-[1rem] border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-medium text-text-primary transition-all hover:bg-white/[0.1] disabled:opacity-50"
            onclick={() => handleExportFavorites('csv')}
            disabled={isExporting}
          >
            <Icon name="file-spreadsheet" size={16} class="text-accent-emerald" />
            CSV
          </button>
          <button
            class="inline-flex items-center gap-2 rounded-[1rem] border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-medium text-text-primary transition-all hover:bg-white/[0.1] disabled:opacity-50"
            onclick={() => handleExportFavorites('markdown')}
            disabled={isExporting}
          >
            <Icon name="file-text" size={16} class="text-accent-amber" />
            Markdown
          </button>
        </div>

        {#if exportSuccess}
          <p class="text-xs text-accent-emerald">Export réussi !</p>
        {/if}
      </div>

      <!-- Sauvegarde et restauration -->
      <div class="section-card rounded-[1.5rem] p-4 space-y-4">
        <div>
          <h3 class="text-sm font-semibold text-text-primary">Sauvegarde</h3>
          <p class="mt-1 text-xs leading-relaxed text-text-secondary">Sauvegarder ou restaurer vos données (profil, paramètres, favoris).</p>
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
            bind:this={fileInput}
          />

          <Button variant="ghost" onclick={triggerFileSelect}>
            {#snippet children()}
              <Icon name="upload" size={16} class="mr-1" />
              Restaurer depuis une sauvegarde
            {/snippet}
          </Button>
        </div>
      </div>

      <!-- Zone de danger -->
      <div class="section-card rounded-[1.5rem] border border-red-500/20 p-4 space-y-3">
        <div>
          <h3 class="text-sm font-semibold text-red-400">Zone dangereuse</h3>
          <p class="mt-1 text-xs leading-relaxed text-text-secondary">Supprimer toutes les donnees locales (profil, missions, cache).</p>
        </div>
        {#if showResetConfirm}
          <div class="flex gap-2">
            <Button variant="ghost" onclick={() => { showResetConfirm = false; }}>
              {#snippet children()}Annuler{/snippet}
            </Button>
            <button
              class="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[1rem] border border-red-500/30 bg-red-500/20 px-4 py-2.5 text-sm font-semibold text-red-400 transition-all duration-200 hover:bg-red-500/30"
              onclick={handleResetAll}
            >
              Confirmer la suppression
            </button>
          </div>
        {:else}
          <button
            class="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[1rem] border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-400 transition-all duration-200 hover:bg-red-500/20"
            onclick={() => { showResetConfirm = true; }}
          >
            <Icon name="trash-2" size={14} />
            Reinitialiser tout
          </button>
        {/if}
      </div>
    </div>
  {/snippet}
</SettingsLayout>

{#if showBackupModal}
  <BackupRestoreModal
    backup={pendingBackup}
    error={backupError}
    onConfirm={handleRestoreBackup}
    onCancel={handleCancelRestore}
  />
{/if}
