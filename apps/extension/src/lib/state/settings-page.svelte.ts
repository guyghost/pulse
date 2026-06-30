import type { BackupData, Result, ValidationError } from '$lib/core/backup/backup';
import {
  createBackup,
  generateBackupFilename,
  parseBackupJson,
  serializeBackup,
  validateBackup,
} from '$lib/core/backup/backup';
import type { AppSettings } from '$lib/core/types/app-settings';
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
import {
  getSettings,
  setSettings,
  getProfile,
  saveProfile,
} from '$lib/shell/facades/settings.facade';
import {
  getConnectorStatuses,
  getMissions,
  openExternalUrl,
} from '$lib/shell/facades/feed-data.facade';
import { sendMessage, subscribeMessages } from '$lib/shell/messaging/bridge';
import { showToast } from '$lib/shell/notifications/toast-service';
import { buildDiagnosticFilename } from '$lib/core/diagnostics/diagnostic-report';
import type { UserProfile } from '$lib/core/types/profile';
import { clearFeedTourSeen, clearOnboardingCompleted } from '$lib/shell/facades/app-flags.facade';
import { getPremium } from '$lib/shell/facades/premium.facade';
import {
  appendUniqueNormalized,
  normalizeDailyRate,
  normalizeProfileDraft,
  normalizeTextInput,
  withProfileDefaults,
} from '$lib/core/profile/normalize-profile';
import { profileMachine, type ProfileStatus } from '$lib/shell/machines/profile.machine';
import { createSvelteActor } from '$lib/shell/state/xstate.svelte';

interface SettingsPageControllerOptions {
  onNavigateToOnboarding?: () => void;
}

/**
 * Default settings used to fill missing fields when restoring old backups
 * that predate the `theme` field addition.
 */
const DEFAULT_SETTINGS: AppSettings = {
  scanIntervalMinutes: 30,
  enabledConnectors: ['free-work', 'lehibou', 'hiway', 'collective', 'cherry-pick'],
  notifications: true,
  autoScan: true,
  maxSemanticPerScan: 10,
  notificationScoreThreshold: 70,
  respectRateLimits: true,
  customDelayMs: 0,
  theme: 'system',
};

const formatBackupDateKey = (timestamp: number): string =>
  new Date(timestamp).toISOString().split('T')[0] ?? 'backup';

const scanDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const exportFormatLabels: Record<ExportFormat, string> = {
  json: 'JSON',
  csv: 'CSV',
  markdown: 'Rapport Markdown',
};

export class SettingsPageController {
  private readonly unsubscribeProfileMessages = this.subscribeProfileMessages();

  private readonly profileActor = createSvelteActor(profileMachine, {
    input: {
      deps: {
        loadProfile: getProfile,
        saveProfile: async (profile) => {
          await saveProfile(profile);
          return profile;
        },
      },
    },
  });

  firstName = $state('');
  jobTitle = $state('');
  profileLocation = $state('');
  profileRemote = $state<UserProfile['remote']>('any');
  seniority = $state<UserProfile['seniority']>('senior');
  tjmMin = $state(0);
  tjmMax = $state(0);
  profileStack = $state<string[]>([]);
  stackInput = $state('');
  searchKeywords = $state<string[]>([]);
  keywordInput = $state('');
  editingProfile = $state(false);
  profileSaved = $state(false);
  profileError = $state<string | null>(null);

  aiAvailability = $state<AiAvailability>('no');
  maxSemanticPerScan = $state(10);

  scanInterval = $state(30);
  notifications = $state(true);
  autoScan = $state(true);
  theme = $state<'light' | 'dark' | 'system'>('system');
  lastScanAt = $state<number | null>(null);
  scanHistorySourceCount = $state(0);
  scanHistoryMissionCount = $state(0);
  scanHistoryErrorCount = $state(0);

  premiumEnabled = $state(false);
  connectedAccountEmail = $state<string | null>(null);
  connectedDeviceLabel = $state('Extension Chrome locale');
  connectedLastSyncAt = $state<string | null>(null);
  connectedPendingUploads = $state(0);
  connectedPendingDownloads = $state(0);
  connectedSyncError = $state<string | null>(null);

  showResetConfirm = $state(false);
  resetError = $state<string | null>(null);

  isExporting = $state(false);
  exportSuccess = $state(false);
  lastExportSummary = $state<string | null>(null);

  showBackupModal = $state(false);
  pendingBackup: BackupData | null = $state(null);
  backupError: ValidationError | null = $state(null);
  fileInput: HTMLInputElement | null = $state(null);

  constructor(private readonly options: SettingsPageControllerOptions = {}) {}

  private subscribeProfileMessages(): () => void {
    try {
      return subscribeMessages((message) => {
        if (message.type === 'PROFILE_UPDATED') {
          this.applyProfile(message.payload);
        }
      });
    } catch {
      return () => {};
    }
  }

  destroy(): void {
    this.unsubscribeProfileMessages();
  }

  get profileStatus(): ProfileStatus {
    return String(this.profileActor.snapshot.value) as ProfileStatus;
  }

  get currentProfile(): UserProfile | null {
    return this.profileActor.snapshot.context.current;
  }

  get draftProfile(): UserProfile | null {
    return this.profileActor.snapshot.context.draft;
  }

  get isSavingProfile(): boolean {
    return this.profileActor.snapshot.matches('saving');
  }

  async load(): Promise<void> {
    await Promise.all([
      this.loadProfile(),
      this.loadAiAvailability(),
      this.loadSettings(),
      this.loadConnectedAccount(),
      this.loadScanHistory(),
    ]);
  }

  async loadProfile(): Promise<void> {
    try {
      const profile = await getProfile();
      if (!profile) {
        return;
      }

      this.applyProfile(profile);
    } catch {
      // Hors contexte extension
    }
  }

  private applyProfile(profile: UserProfile): void {
    this.firstName = profile.firstName ?? '';
    this.jobTitle = profile.jobTitle ?? '';
    this.profileLocation = profile.location ?? '';
    this.profileRemote = profile.remote ?? 'any';
    this.seniority = profile.seniority ?? 'senior';
    this.tjmMin = profile.tjmMin ?? 0;
    this.tjmMax = profile.tjmMax ?? 0;
    this.profileStack = profile.stack ?? [];
    this.searchKeywords = profile.searchKeywords ?? [];
    this.profileActor.send({ type: 'PROFILE_UPDATED', profile });
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
      this.theme = settings.theme;
    } catch {
      // Hors contexte extension
    }
  }

  async loadConnectedAccount(): Promise<void> {
    try {
      this.premiumEnabled = await getPremium();
      if (import.meta.env.DEV && this.premiumEnabled) {
        this.connectedAccountEmail = 'demo@missionpulse.app';
        this.connectedLastSyncAt = "à l'instant";
        this.connectedPendingUploads = 0;
        this.connectedPendingDownloads = 0;
      }
    } catch {
      this.premiumEnabled = false;
      this.connectedAccountEmail = null;
      this.connectedLastSyncAt = null;
      this.connectedPendingUploads = 0;
      this.connectedPendingDownloads = 0;
    }
  }

  async loadScanHistory(): Promise<void> {
    try {
      const statuses = await getConnectorStatuses();
      this.scanHistorySourceCount = statuses.length;
      this.scanHistoryMissionCount = statuses.reduce(
        (total, status) => total + status.missionsCount,
        0
      );
      this.scanHistoryErrorCount = statuses.filter((status) => status.lastState === 'error').length;
      this.lastScanAt = statuses.reduce<number | null>((latest, status) => {
        if (status.lastSyncAt && (latest === null || status.lastSyncAt > latest)) {
          return status.lastSyncAt;
        }
        return latest;
      }, null);
    } catch {
      this.scanHistorySourceCount = 0;
      this.scanHistoryMissionCount = 0;
      this.scanHistoryErrorCount = 0;
      this.lastScanAt = null;
    }
  }

  get isConnectedAccount(): boolean {
    return Boolean(this.connectedAccountEmail);
  }

  get accountStatusLabel(): string {
    if (this.connectedSyncError) {
      return 'Action requise';
    }
    return this.isConnectedAccount ? 'Connecté' : 'Local uniquement';
  }

  get syncStatusText(): string {
    if (this.connectedSyncError) {
      return this.connectedSyncError;
    }
    if (this.isConnectedAccount) {
      return this.connectedLastSyncAt
        ? `Dernière synchro ${this.connectedLastSyncAt}`
        : 'Compte connecté, première synchronisation en attente.';
    }
    return "Vos scans, favoris, CV et candidatures restent dans l'extension tant qu'aucun compte n'est connecté.";
  }

  get lastScanLabel(): string {
    if (!this.lastScanAt) {
      return 'Aucun scan enregistré';
    }
    return `Dernier déclenchement ${scanDateFormatter.format(new Date(this.lastScanAt))}`;
  }

  get scanHistoryLabel(): string {
    if (this.scanHistorySourceCount === 0) {
      return 'Aucun historique par source';
    }
    const errorSuffix =
      this.scanHistoryErrorCount > 0
        ? ` · ${this.scanHistoryErrorCount} source${this.scanHistoryErrorCount > 1 ? 's' : ''} à corriger`
        : '';
    return `${this.scanHistorySourceCount} source${this.scanHistorySourceCount > 1 ? 's' : ''} · ${this.scanHistoryMissionCount} mission${this.scanHistoryMissionCount > 1 ? 's' : ''}${errorSuffix}`;
  }

  get nextScanLabel(): string {
    if (!this.autoScan) {
      return 'Scan automatique désactivé';
    }
    if (!this.lastScanAt) {
      return `Premier scan automatique toutes les ${this.scanInterval} min`;
    }

    const nextScanAt = this.lastScanAt + this.scanInterval * 60_000;
    if (nextScanAt <= Date.now()) {
      return 'Prochain scan dès que Chrome déclenche l’alarme';
    }
    return `Prochain déclenchement vers ${scanDateFormatter.format(new Date(nextScanAt))}`;
  }

  get scanHistoryTone(): 'success' | 'attention' | 'neutral' {
    if (this.scanHistorySourceCount === 0) {
      return 'neutral';
    }
    return this.scanHistoryErrorCount > 0 ? 'attention' : 'success';
  }

  async openAccountCenter(): Promise<void> {
    await openExternalUrl('https://missionpulse.app/dashboard');
  }

  async openConnectedDashboard(): Promise<void> {
    await openExternalUrl('https://missionpulse.app/dashboard');
  }

  async openAiHelp(): Promise<void> {
    await openExternalUrl('https://developer.chrome.com/docs/ai/prompt-api');
  }

  toggleProfileEditing(): void {
    this.editingProfile = !this.editingProfile;
  }

  addStack(): void {
    const trimmed = normalizeTextInput(this.stackInput);
    if (!trimmed || this.profileStack.includes(trimmed)) {
      return;
    }

    this.profileStack = [...this.profileStack, trimmed];
    this.stackInput = '';
  }

  removeStack(item: string): void {
    this.profileStack = this.profileStack.filter((s) => s !== item);
  }

  addKeyword(): void {
    const trimmed = normalizeTextInput(this.keywordInput);
    if (!trimmed || this.searchKeywords.includes(trimmed)) {
      return;
    }

    this.searchKeywords = [...this.searchKeywords, trimmed];
    this.keywordInput = '';
  }

  removeKeyword(item: string): void {
    this.searchKeywords = this.searchKeywords.filter((keyword) => keyword !== item);
  }

  async saveProfile(): Promise<void> {
    this.profileError = null;
    this.profileSaved = false;

    try {
      const current = await getProfile();
      const nextStack = appendUniqueNormalized(this.profileStack, this.stackInput);
      const nextSearchKeywords = appendUniqueNormalized(this.searchKeywords, this.keywordInput);
      const nextTjmMin = normalizeDailyRate(this.tjmMin);
      const nextTjmMax = normalizeDailyRate(this.tjmMax);

      if (nextTjmMax > 0 && nextTjmMin > nextTjmMax) {
        this.profileError = 'Le TJM maximum doit être supérieur ou égal au TJM minimum';
        return;
      }

      const normalized = normalizeProfileDraft({
        firstName: normalizeTextInput(this.firstName),
        jobTitle: normalizeTextInput(this.jobTitle),
        location: normalizeTextInput(this.profileLocation),
        tjmMin: nextTjmMin,
        tjmMax: nextTjmMax,
        stack: nextStack,
        remote: this.profileRemote,
        seniority: this.seniority,
        scoringWeights: current?.scoringWeights,
        searchKeywords: nextSearchKeywords,
      });

      if (!normalized.ok || !normalized.profile) {
        this.profileError = normalized.error ?? 'Profil invalide';
        return;
      }

      const nextProfile = normalized.profile;

      await this.submitProfile(nextProfile);
      this.firstName = nextProfile.firstName;
      this.jobTitle = nextProfile.jobTitle;
      this.profileLocation = nextProfile.location;
      this.tjmMin = nextProfile.tjmMin;
      this.tjmMax = nextProfile.tjmMax;
      this.profileStack = nextProfile.stack;
      this.stackInput = '';
      this.searchKeywords = nextProfile.searchKeywords;
      this.keywordInput = '';
      this.editingProfile = false;
      this.profileSaved = true;
      setTimeout(() => {
        this.profileSaved = false;
      }, 2000);
    } catch (err) {
      this.profileError = err instanceof Error ? err.message : 'Erreur lors de la sauvegarde';
    }
  }

  private submitProfile(profile: UserProfile): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let sawSaving = this.profileActor.snapshot.matches('saving');
      const unsubscribe = this.profileActor.subscribe((snapshot) => {
        if (settled) {
          return;
        }
        if (snapshot.matches('saving')) {
          sawSaving = true;
        }
        if (sawSaving && snapshot.matches('ready') && snapshot.context.current) {
          settled = true;
          unsubscribe();
          resolve();
        }
        if (snapshot.matches('error')) {
          settled = true;
          const message = snapshot.context.error ?? 'Erreur lors de la sauvegarde';
          unsubscribe();
          reject(new Error(message));
        }
      });

      this.profileActor.send({ type: 'SUBMIT_PROFILE', profile });
    });
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

  async updateTheme(value: 'light' | 'dark' | 'system'): Promise<void> {
    this.theme = value;
    window.dispatchEvent(new CustomEvent('mp:theme-changed', { detail: value }));
    try {
      const settings = await getSettings();
      await setSettings({ ...settings, theme: value });
    } catch {
      // Hors contexte extension
    }
  }

  async replayFeedTour(): Promise<void> {
    await clearFeedTourSeen();
    window.dispatchEvent(new CustomEvent('feed-tour:open'));
  }

  async restartOnboarding(): Promise<void> {
    await clearOnboardingCompleted();
    this.options.onNavigateToOnboarding?.();
  }

  async resetAll(): Promise<void> {
    this.resetError = null;
    try {
      const response = await sendMessage({ type: 'RESET_LOCAL_DATA' });
      if (response.type !== 'LOCAL_DATA_RESET' || !response.payload.reset) {
        throw new Error(
          response.type === 'LOCAL_DATA_RESET'
            ? (response.payload.reason ?? 'Reset local impossible')
            : 'Réponse reset local invalide'
        );
      }
      this.showResetConfirm = false;
      this.options.onNavigateToOnboarding?.();
    } catch (err) {
      // Surface the failure instead of swallowing it: keep the confirmation
      // gate open so the user stays in control, expose the error, and notify.
      const message = err instanceof Error ? err.message : 'Réinitialisation impossible';
      this.resetError = message;
      this.showResetConfirm = true;
      await showToast(message, 'error');
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
      const exportedCount = favoriteMissions.length;

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

      this.lastExportSummary = `${exportFormatLabels[format]} généré · ${exportedCount} mission${exportedCount > 1 ? 's' : ''} favorite${exportedCount > 1 ? 's' : ''} · sessions plateforme conservées localement`;
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
      const filename = generateBackupFilename(backup.timestamp, formatBackupDateKey);
      downloadJSON(json, filename);

      return { ok: true, value: undefined };
    } catch {
      return { ok: false, error: 'Erreur lors de la création du backup' };
    }
  }

  async handleFileSelect(file: File | null | undefined): Promise<void> {
    if (!file) {
      return;
    }

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
      if (this.fileInput) {
        this.fileInput.value = '';
      }
    }
  }

  async restoreBackup(): Promise<Result<void, string>> {
    if (!this.pendingBackup) {
      return { ok: false, error: 'Aucune sauvegarde à restaurer' };
    }

    try {
      const { profile, settings, favorites, hidden } = this.pendingBackup;

      // Merge with defaults to fill fields missing from old backups (e.g. theme)
      const restoredSettings: AppSettings = { ...DEFAULT_SETTINGS, ...settings };

      await Promise.all([
        saveProfile(withProfileDefaults(profile)),
        setSettings(restoredSettings),
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

  async exportDiagnostic(): Promise<Result<void, string>> {
    try {
      const response = await sendMessage({ type: 'GET_DIAGNOSTIC_EXPORT' });
      if (response.type !== 'DIAGNOSTIC_EXPORT_RESULT') {
        return { ok: false, error: 'Réponse diagnostic inattendue' };
      }

      const exportedAt = new Date(response.payload.exportedAt);
      downloadJSON(response.payload, buildDiagnosticFilename(exportedAt));
      return { ok: true, value: undefined };
    } catch {
      return { ok: false, error: "Impossible d'exporter le diagnostic" };
    }
  }
}
