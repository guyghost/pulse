import type { BackupData, Result, ValidationError } from '$lib/core/backup/backup';
import {
  createBackup,
  generateBackupFilename,
  parseBackupJson,
  serializeBackup,
  validateBackup,
} from '$lib/core/backup/backup';
import {
  exportMissionsToCSV,
  exportMissionsToJSON,
  exportMissionsToMarkdown,
  generateFilename,
  type ExportFormat,
} from '$lib/core/export/mission-export';
import { isPromptApiAvailable, type AiAvailability } from '$lib/shell/ai/capabilities';
import { downloadCSV, downloadJSON, downloadMarkdown } from '$lib/shell/export/download';
import {
  getFavorites,
  getHidden,
  saveFavorites,
  saveHidden,
} from '$lib/shell/facades/feed-data.facade';
import { getProfile, getSettings, saveProfile, setSettings } from '$lib/shell/facades/settings.facade';
import { getMissions } from '$lib/shell/storage/db';
import type { UserProfile } from '$lib/core/types/profile';

interface SettingsPageControllerOptions {
  onNavigateToOnboarding?: () => void;
}

const withProfileDefaults = (profile: Partial<UserProfile>): UserProfile => ({
  firstName: profile.firstName ?? '',
  stack: profile.stack ?? [],
  tjmMin: profile.tjmMin ?? 0,
  tjmMax: profile.tjmMax ?? 0,
  location: profile.location ?? '',
  remote: profile.remote ?? 'any',
  seniority: profile.seniority ?? 'senior',
  jobTitle: profile.jobTitle ?? '',
  scoringWeights: profile.scoringWeights,
  searchKeywords: profile.searchKeywords ?? [],
});

export class SettingsPageController {
  firstName = $state('');
  jobTitle = $state('');
  profileLocation = $state('');
  tjmMin = $state(0);
  tjmMax = $state(0);
  profileStack = $state<string[]>([]);
  stackInput = $state('');
  editingProfile = $state(false);
  profileSaved = $state(false);
  profileError = $state<string | null>(null);

  aiAvailability = $state<AiAvailability>('no');
  maxSemanticPerScan = $state(10);

  scanInterval = $state(30);
  notifications = $state(true);
  autoScan = $state(true);

  showResetConfirm = $state(false);

  isExporting = $state(false);
  exportSuccess = $state(false);

  showBackupModal = $state(false);
  pendingBackup: BackupData | null = $state(null);
  backupError: ValidationError | null = $state(null);
  fileInput: HTMLInputElement | null = $state(null);

  constructor(private readonly options: SettingsPageControllerOptions = {}) {}

  async load(): Promise<void> {
    await Promise.all([this.loadProfile(), this.loadAiAvailability(), this.loadSettings()]);
  }

  async loadProfile(): Promise<void> {
    try {
      const profile = await getProfile();
      if (!profile) return;

      this.firstName = profile.firstName ?? '';
      this.jobTitle = profile.jobTitle ?? '';
      this.profileLocation = profile.location ?? '';
      this.tjmMin = profile.tjmMin ?? 0;
      this.tjmMax = profile.tjmMax ?? 0;
      this.profileStack = profile.stack ?? [];
    } catch {
      // Hors contexte extension
    }
  }

  async loadAiAvailability(): Promise<void> {
    try {
      this.aiAvailability = await isPromptApiAvailable();
    } catch {
      this.aiAvailability = 'no';
    }
  }

  async loadSettings(): Promise<void> {
    try {
      const settings = await getSettings();
      this.scanInterval = settings.scanIntervalMinutes;
      this.notifications = settings.notifications;
      this.autoScan = settings.autoScan;
      this.maxSemanticPerScan = settings.maxSemanticPerScan;
    } catch {
      // Hors contexte extension
    }
  }

  toggleProfileEditing(): void {
    this.editingProfile = !this.editingProfile;
  }

  addStack(): void {
    const trimmed = this.stackInput.trim();
    if (!trimmed || this.profileStack.includes(trimmed)) return;

    this.profileStack = [...this.profileStack, trimmed];
    this.stackInput = '';
  }

  removeStack(item: string): void {
    this.profileStack = this.profileStack.filter((s) => s !== item);
  }

  async saveProfile(): Promise<void> {
    this.profileError = null;

    try {
      const current = await getProfile();
      await saveProfile(
        withProfileDefaults({
          firstName: this.firstName,
          jobTitle: this.jobTitle,
          location: this.profileLocation,
          tjmMin: this.tjmMin,
          tjmMax: this.tjmMax,
          stack: [...this.profileStack],
          remote: current?.remote ?? 'any',
          seniority: current?.seniority ?? 'senior',
          scoringWeights: current?.scoringWeights,
          searchKeywords: current?.searchKeywords ?? [],
        })
      );

      this.editingProfile = false;
      this.profileSaved = true;
      setTimeout(() => {
        this.profileSaved = false;
      }, 2000);
    } catch (err) {
      this.profileError = err instanceof Error ? err.message : 'Erreur lors de la sauvegarde';
    }
  }

  async updateScanInterval(value: number): Promise<void> {
    this.scanInterval = value;
    try {
      const settings = await getSettings();
      await setSettings({ ...settings, scanIntervalMinutes: value });
    } catch {
      // Hors contexte extension
    }
  }

  async toggleNotifications(): Promise<void> {
    this.notifications = !this.notifications;
    try {
      const settings = await getSettings();
      await setSettings({ ...settings, notifications: this.notifications });
    } catch {
      // Hors contexte extension
    }
  }

  async toggleAutoScan(): Promise<void> {
    this.autoScan = !this.autoScan;
    try {
      const settings = await getSettings();
      await setSettings({ ...settings, autoScan: this.autoScan });
    } catch {
      // Hors contexte extension
    }
  }

  async resetAll(): Promise<void> {
    try {
      await chrome.storage.local.clear();
      const databases = await indexedDB.databases();
      for (const db of databases) {
        if (db.name) indexedDB.deleteDatabase(db.name);
      }
      this.showResetConfirm = false;
      this.options.onNavigateToOnboarding?.();
    } catch {
      // Hors contexte extension
    }
  }

  async exportFavorites(format: ExportFormat): Promise<Result<void, string>> {
    try {
      this.isExporting = true;
      const favorites = await getFavorites();
      const favoriteIds = Object.keys(favorites);

      if (favoriteIds.length === 0) {
        return { ok: false, error: 'Aucune mission favorite à exporter' };
      }

      const allMissions = await getMissions();
      const favoriteMissions = allMissions.filter((m) => favoriteIds.includes(m.id));
      const now = new Date();
      const filename = generateFilename('favoris', format, now);

      switch (format) {
        case 'json':
          downloadJSON(
            exportMissionsToJSON(favoriteMissions, { format, includeDescription: true }, now),
            filename
          );
          break;
        case 'csv':
          downloadCSV(
            exportMissionsToCSV(favoriteMissions, { format, includeDescription: false }, now),
            filename
          );
          break;
        case 'markdown':
          downloadMarkdown(
            exportMissionsToMarkdown(favoriteMissions, { format, includeDescription: true }, now),
            filename
          );
          break;
      }

      this.exportSuccess = true;
      setTimeout(() => {
        this.exportSuccess = false;
      }, 2000);

      return { ok: true, value: undefined };
    } catch {
      return { ok: false, error: "Erreur lors de l'export des favoris" };
    } finally {
      this.isExporting = false;
    }
  }

  async createBackupFile(): Promise<Result<void, string>> {
    try {
      const [profile, settings, favorites, hidden] = await Promise.all([
        getProfile(),
        getSettings(),
        getFavorites(),
        getHidden(),
      ]);

      if (!profile) {
        return { ok: false, error: 'Veuillez configurer votre profil avant de créer un backup' };
      }

      const backup = createBackup(profile, settings, favorites, hidden, Date.now());
      const json = serializeBackup(backup);
      const filename = generateBackupFilename(backup.timestamp);
      downloadJSON(json, filename);

      return { ok: true, value: undefined };
    } catch {
      return { ok: false, error: 'Erreur lors de la création du backup' };
    }
  }

  async handleFileSelect(file: File | null | undefined): Promise<void> {
    if (!file) return;

    try {
      const text = await file.text();
      const parseResult = parseBackupJson(text);

      if (!parseResult.ok) {
        this.backupError = parseResult.error;
        this.pendingBackup = null;
        this.showBackupModal = true;
        return;
      }

      const validateResult = validateBackup(parseResult.value);

      if (!validateResult.ok) {
        this.backupError = validateResult.error;
        this.pendingBackup = null;
      } else {
        this.backupError = null;
        this.pendingBackup = validateResult.value;
      }

      this.showBackupModal = true;
    } catch {
      this.backupError = { type: 'INVALID_JSON', message: 'Impossible de lire le fichier' };
      this.pendingBackup = null;
      this.showBackupModal = true;
    } finally {
      if (this.fileInput) this.fileInput.value = '';
    }
  }

  async restoreBackup(): Promise<Result<void, string>> {
    if (!this.pendingBackup) {
      return { ok: false, error: 'Aucune sauvegarde à restaurer' };
    }

    try {
      const { profile, settings, favorites, hidden } = this.pendingBackup;

      await Promise.all([
        saveProfile(withProfileDefaults(profile)),
        setSettings(settings),
        saveFavorites(favorites),
        saveHidden(hidden),
      ]);

      this.showBackupModal = false;
      this.pendingBackup = null;
      this.backupError = null;

      return { ok: true, value: undefined };
    } catch {
      return { ok: false, error: 'Erreur lors de la restauration du backup' };
    }
  }

  cancelRestore(): void {
    this.showBackupModal = false;
    this.pendingBackup = null;
    this.backupError = null;
  }

  triggerFileSelect(): void {
    this.fileInput?.click();
  }
}
