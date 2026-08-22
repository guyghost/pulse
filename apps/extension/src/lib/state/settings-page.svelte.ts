import type { Result } from '$lib/core/backup/backup';
import { SvelteDate } from 'svelte/reactivity';
import { createBackup, generateBackupFilename, serializeBackup } from '$lib/core/backup/backup';
import { features } from '$lib/state/features.svelte';
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
import { getFavorites, getHidden } from '$lib/shell/facades/feed-data.facade';
import {
  getSettings,
  setSettingsConfirmed,
  getProfile,
  saveProfile,
} from '$lib/shell/facades/settings.facade';
import { subscribeSettingsReleaseSnapshots } from '$lib/shell/facades/settings-release.facade';
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
import {
  getExtensionAccount,
  pollExtensionAccountLink,
  refreshExtensionEntitlement,
  startExtensionAccountLink,
  unlinkExtensionAccount,
} from '$lib/shell/facades/premium.facade';
import type { ExtensionAccountLinkState } from '$lib/shell/account/account-connection';
import { canUsePremiumFeature } from '@pulse/domain';
import {
  getConnectorsMeta,
  type ConnectorId,
  type ConnectorMeta,
} from '$lib/shell/connectors/meta';
import {
  appendUniqueNormalized,
  normalizeDailyRate,
  normalizeProfileDraft,
  normalizeTextInput,
} from '$lib/core/profile/normalize-profile';
import { createProfileStore, type ProfileStatus } from '$lib/state/profile.svelte';
import {
  LOCAL_DATA_RESET_RUNTIME_AVAILABILITY,
  type LocalDataResetRuntimeAvailability,
} from '../../models/local-data-reset-availability.contract';

interface SettingsPageControllerOptions {
  onNavigateToOnboarding?: () => void;
  connectorCatalog?: readonly ConnectorMeta[];
  resetAvailability?: LocalDataResetRuntimeAvailability;
}

export interface SettingsConnectorSource {
  id: ConnectorId;
  name: string;
  icon: string;
  url: string;
  enabled: boolean;
}

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
  private readonly shippedConnectorCatalog: readonly ConnectorMeta[];
  private readonly resetAvailability: LocalDataResetRuntimeAvailability;
  private readonly unsubscribeProfileMessages = this.subscribeProfileMessages();
  private readonly unsubscribeFormAssistMessages = this.subscribeFormAssistMessages();
  private readonly unsubscribeSettingsSnapshots: () => void;

  private readonly profileActor = createProfileStore({
    loadProfile: getProfile,
    saveProfile: async (profile) => {
      await saveProfile(profile);
      return profile;
    },
  });

  firstName = $state('');
  jobTitle = $state('');
  profileLocation = $state('');
  profileRemote = $state<UserProfile['remote']>('any');
  seniority = $state<UserProfile['seniority']>('senior');
  tjmMin = $state(0);
  tjmMax = $state(0);
  profileKeywords = $state<string[]>([]);
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
  enabledConnectorIds = $state<ConnectorId[]>([]);
  isSavingSettings = $state(false);
  settingsError = $state<string | null>(null);
  lastScanAt = $state<number | null>(null);
  scanHistorySourceCount = $state(0);
  scanHistoryMissionCount = $state(0);
  scanHistoryErrorCount = $state(0);

  premiumEnabled = $state(false);
  extensionAccountState = $state<ExtensionAccountLinkState>('unlinked');
  connectedAccountEmail = $state<string | null>(null);
  connectedDeviceLabel = $state('Extension Chrome locale');
  connectedLastSyncAt = $state<string | null>(null);
  connectedPendingUploads = $state(0);
  connectedPendingDownloads = $state(0);
  connectedSyncError = $state<string | null>(null);

  /**
   * Form Assistant activation (Machine D — src/models/form-assistant.model.md).
   * Miroir de l'état persisté dans le SW (chrome.storage.local). Le toggle ne
   * écrit JAMAIS directement en storage : il émet FORM_ASSIST_ENABLE via bridge.
   */
  formAssistEnabled = $state(false);
  formAssistStatus = $state<'loading' | 'ready' | 'error'>('loading');

  showResetConfirm = $state(false);
  resetError = $state<string | null>(null);

  isExporting = $state(false);
  exportSuccess = $state(false);
  lastExportSummary = $state<string | null>(null);

  constructor(private readonly options: SettingsPageControllerOptions = {}) {
    this.shippedConnectorCatalog = (options.connectorCatalog ?? getConnectorsMeta()).map(
      (connector) => ({
        ...connector,
        hostPermissions: [...connector.hostPermissions],
      })
    );
    this.resetAvailability = options.resetAvailability ?? LOCAL_DATA_RESET_RUNTIME_AVAILABILITY;
    this.unsubscribeSettingsSnapshots = subscribeSettingsReleaseSnapshots((snapshot) => {
      this.applyConfirmedSettings(snapshot.settings);
    });
  }

  get localDataResetAvailability(): LocalDataResetRuntimeAvailability {
    return this.resetAvailability;
  }

  get connectorSources(): SettingsConnectorSource[] {
    return this.shippedConnectorCatalog.map((connector) => ({
      id: connector.id,
      name: connector.name,
      icon: connector.icon,
      url: connector.url,
      enabled: this.enabledConnectorIds.includes(connector.id),
    }));
  }

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

  /**
   * Racolement Machine D : le SW diffuse FORM_ASSIST_ENABLED après toute
   * mutation persistée. Le panel est un miroir, jamais la source primaire.
   */
  private subscribeFormAssistMessages(): () => void {
    try {
      return subscribeMessages((message) => {
        if (message.type === 'FORM_ASSIST_ENABLED') {
          this.formAssistEnabled = Boolean(message.payload.enabled);
          this.formAssistStatus = 'ready';
        }
      });
    } catch {
      return () => {};
    }
  }

  destroy(): void {
    this.unsubscribeProfileMessages();
    this.unsubscribeFormAssistMessages();
    this.unsubscribeSettingsSnapshots();
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
      // Surface flag: no account/sync I/O when the connected feature is off.
      features.isFeatureEnabled('connected') ? this.loadConnectedAccount() : Promise.resolve(),
      this.loadScanHistory(),
      this.loadFormAssist(),
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
    this.profileKeywords = profile.keywords ?? [];
    this.profileActor.send({ type: 'PROFILE_UPDATED', profile });
  }

  async loadAiAvailability(): Promise<void> {
    try {
      this.aiAvailability = await isPromptApiAvailable();
    } catch {
      this.aiAvailability = 'no';
    }
  }

  /**
   * Lit l'état persisté du Form Assistant auprès du SW (Machine D — INIT).
   * Échec (SW injoignable) → état `error` mais la page reste utilisable.
   */
  async loadFormAssist(): Promise<void> {
    this.formAssistStatus = 'loading';
    try {
      const result = (await sendMessage({ type: 'FORM_ASSIST_STATUS' })) as
        { type: 'FORM_ASSIST_STATUS_RESULT'; payload: { enabled: boolean } } | undefined;
      this.formAssistEnabled = Boolean(result?.payload.enabled);
      this.formAssistStatus = 'ready';
    } catch {
      this.formAssistStatus = 'error';
    }
  }

  /**
   * Bascule l'activation du Form Assistant. Le SW persiste et diffuse
   * FORM_ASSIST_ENABLED (racolement). L'UI reste optimiste : on met à jour
   * immédiatement pour la réactivité, et le message SW confirme/rétablit.
   */
  async toggleFormAssist(): Promise<void> {
    if (this.formAssistStatus === 'loading') {
      return;
    }
    const next = !this.formAssistEnabled;
    const previous = this.formAssistEnabled;
    this.formAssistEnabled = next;
    this.formAssistStatus = 'loading';
    try {
      const result = (await sendMessage({
        type: 'FORM_ASSIST_ENABLE',
        payload: { enabled: next },
      })) as { type: 'FORM_ASSIST_ENABLED'; payload: { enabled: boolean } } | undefined;
      // La réponse du SW est la source de vérité (elle peut différer de
      // l'optimisme en cas d'erreur persistée côté SW).
      this.formAssistEnabled = Boolean(result?.payload.enabled);
      this.formAssistStatus = 'ready';
    } catch {
      this.formAssistEnabled = previous;
      this.formAssistStatus = 'error';
      await showToast("Impossible d'activer l'assistant de candidature", 'error');
    }
  }

  async loadSettings(): Promise<void> {
    try {
      const settings = await getSettings();
      this.applyConfirmedSettings(settings);
    } catch {
      // Hors contexte extension
    }
  }

  private applyConfirmedSettings(settings: AppSettings): void {
    this.scanInterval = settings.scanIntervalMinutes;
    this.notifications = settings.notifications;
    this.autoScan = settings.autoScan;
    this.maxSemanticPerScan = settings.maxSemanticPerScan;
    this.theme = settings.theme;
    const shippedIds = this.shippedConnectorCatalog.map((connector) => connector.id);
    this.enabledConnectorIds = settings.enabledConnectors.filter((id): id is ConnectorId =>
      shippedIds.includes(id as ConnectorId)
    );
  }

  async loadConnectedAccount(): Promise<void> {
    try {
      const local = await getExtensionAccount();
      const projection = local.state === 'linked' ? await refreshExtensionEntitlement() : local;
      this.applyExtensionAccountProjection(projection);
    } catch {
      this.premiumEnabled = false;
      this.extensionAccountState = 'error';
      this.connectedAccountEmail = null;
      this.connectedLastSyncAt = null;
      this.connectedPendingUploads = 0;
      this.connectedPendingDownloads = 0;
    }
  }

  private applyExtensionAccountProjection(
    projection: Awaited<ReturnType<typeof getExtensionAccount>>
  ): void {
    this.extensionAccountState = projection.state;
    this.connectedAccountEmail =
      projection.accountId === null ? null : `Compte ${projection.accountId.slice(0, 8)}`;
    this.connectedSyncError = projection.lastError;
    this.premiumEnabled = canUsePremiumFeature({
      snapshot: projection.entitlement,
      accountState: projection.accountId === null ? 'anonymous' : 'active',
      accountId: projection.accountId,
      feature: 'multi_account',
      nowMs: Date.now(),
    });
    this.connectedLastSyncAt = projection.state === 'linked' ? "à l'instant" : null;
    this.connectedPendingUploads = 0;
    this.connectedPendingDownloads = 0;
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
    if (this.extensionAccountState === 'awaiting_user_approval') {
      return 'Autorisation en attente';
    }
    return this.isConnectedAccount ? 'Connecté' : 'Local uniquement';
  }

  get syncStatusText(): string {
    if (this.connectedSyncError) {
      return this.connectedSyncError;
    }
    if (this.isConnectedAccount) {
      return this.connectedLastSyncAt
        ? `Dernière synchronisation ${this.connectedLastSyncAt}`
        : 'Compte connecté, première synchronisation en attente.';
    }
    if (this.extensionAccountState === 'awaiting_user_approval') {
      return "Autorisez cette installation dans l'onglet MissionPulse, puis vérifiez la connexion.";
    }
    return "Vos scans, favoris, CV et candidatures restent dans l'extension tant qu'aucun compte n'est connecté.";
  }

  get lastScanLabel(): string {
    if (!this.lastScanAt) {
      return 'Aucun scan enregistré';
    }
    return `Dernier déclenchement ${scanDateFormatter.format(new SvelteDate(this.lastScanAt))}`;
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
    return `Prochain déclenchement vers ${scanDateFormatter.format(new SvelteDate(nextScanAt))}`;
  }

  get scanHistoryTone(): 'success' | 'attention' | 'neutral' {
    if (this.scanHistorySourceCount === 0) {
      return 'neutral';
    }
    return this.scanHistoryErrorCount > 0 ? 'attention' : 'success';
  }

  async openAccountCenter(): Promise<void> {
    if (this.isConnectedAccount) {
      await openExternalUrl('https://missionpulse.app/dashboard');
      return;
    }
    if (this.extensionAccountState === 'awaiting_user_approval') {
      this.applyExtensionAccountProjection(await pollExtensionAccountLink());
      return;
    }
    const result = await startExtensionAccountLink();
    this.applyExtensionAccountProjection(result.projection);
  }

  async disconnectExtensionAccount(): Promise<void> {
    this.applyExtensionAccountProjection(await unlinkExtensionAccount());
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

  addKeyword(): void {
    const trimmed = normalizeTextInput(this.keywordInput);
    if (!trimmed || this.profileKeywords.includes(trimmed)) {
      return;
    }

    this.profileKeywords = [...this.profileKeywords, trimmed];
    this.keywordInput = '';
  }

  removeKeyword(item: string): void {
    this.profileKeywords = this.profileKeywords.filter((keyword) => keyword !== item);
  }

  async saveProfile(): Promise<void> {
    this.profileError = null;
    this.profileSaved = false;

    try {
      const current = await getProfile();
      const nextKeywords = appendUniqueNormalized(this.profileKeywords, this.keywordInput);
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
        keywords: nextKeywords,
        remote: this.profileRemote,
        seniority: this.seniority,
        scoringWeights: current?.scoringWeights,
        experiences: current?.experiences,
        availability: current?.availability,
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
      this.profileKeywords = nextProfile.keywords;
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
    await this.persistSettings((settings) => ({ ...settings, scanIntervalMinutes: value }));
  }

  async toggleNotifications(): Promise<void> {
    await this.persistSettings((settings) => ({
      ...settings,
      notifications: !settings.notifications,
    }));
  }

  async toggleAutoScan(): Promise<void> {
    await this.persistSettings((settings) => ({ ...settings, autoScan: !settings.autoScan }));
  }

  async updateTheme(value: 'light' | 'dark' | 'system'): Promise<void> {
    await this.persistSettings((settings) => ({ ...settings, theme: value }));
  }

  async toggleConnector(connectorId: ConnectorId): Promise<void> {
    if (!this.shippedConnectorCatalog.some((connector) => connector.id === connectorId)) {
      return;
    }

    await this.persistSettings((settings) => {
      const wasEnabled = settings.enabledConnectors.some((id) => id === connectorId);
      const nextConnectorIds = this.shippedConnectorCatalog
        .map((connector) => connector.id)
        .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
        .filter((id) => {
          if (id === connectorId) {
            return !wasEnabled;
          }
          return settings.enabledConnectors.some((enabledId) => enabledId === id);
        });
      return { ...settings, enabledConnectors: nextConnectorIds };
    });
  }

  private async persistSettings(
    buildCandidate: (settings: AppSettings) => AppSettings
  ): Promise<void> {
    if (this.isSavingSettings) {
      return;
    }

    this.isSavingSettings = true;
    this.settingsError = null;
    try {
      const settings = await getSettings();
      const confirmed = await setSettingsConfirmed(buildCandidate(settings));
      this.applyConfirmedSettings(confirmed);
    } catch {
      const message = 'Impossible d’enregistrer les réglages';
      this.settingsError = message;
      await showToast(message, 'error');
    } finally {
      this.isSavingSettings = false;
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
    if (this.resetAvailability.status === 'unavailable') {
      this.resetError = this.resetAvailability.reason;
      return;
    }
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
      const now = new SvelteDate();
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

  async exportDiagnostic(): Promise<Result<void, string>> {
    try {
      const response = await sendMessage({ type: 'GET_DIAGNOSTIC_EXPORT' });
      if (response.type !== 'DIAGNOSTIC_EXPORT_RESULT') {
        return { ok: false, error: 'Réponse diagnostic inattendue' };
      }

      const exportedAt = new SvelteDate(response.payload.exportedAt);
      downloadJSON(response.payload, buildDiagnosticFilename(exportedAt));
      return { ok: true, value: undefined };
    } catch {
      return { ok: false, error: "Impossible d'exporter le diagnostic" };
    }
  }
}
