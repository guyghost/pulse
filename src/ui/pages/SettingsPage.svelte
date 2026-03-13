<script lang="ts">
  import SettingsLayout from '../templates/SettingsLayout.svelte';
  import ConnectorPanel from '../organisms/ConnectorPanel.svelte';
  import Button from '../atoms/Button.svelte';
  import Icon from '../atoms/Icon.svelte';
  import type { ConnectorStatus } from '$lib/core/types/connector';
  import { getSettings, setSettings, getApiKey, setApiKey } from '$lib/shell/storage/chrome-storage';
  import { getProfile, saveProfile } from '$lib/shell/storage/db';
  import { connectorRegistry } from '$lib/shell/connectors/index';

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

  // --- Connecteurs ---
  let connectors = $state<{
    id: string;
    name: string;
    icon: string;
    status: ConnectorStatus;
    lastSync: Date | null;
    enabled: boolean;
  }[]>([]);

  // --- Reset ---
  let showResetConfirm = $state(false);

  // Chargement initial
  $effect(() => {
    loadProfile();
    loadApiKey();
    loadSettings();
  });

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

      // Construire la liste des connecteurs a partir du registre
      const detections = await Promise.allSettled(
        connectorRegistry.map(async (c) => {
          const hasSession = await c.detectSession();
          const lastSync = await c.getLastSync();
          return {
            id: c.id,
            name: c.name,
            icon: c.icon,
            status: (hasSession ? 'authenticated' : 'expired') as ConnectorStatus,
            lastSync,
            enabled: settings.enabledConnectors.includes(c.id),
          };
        }),
      );

      connectors = detections
        .filter((r): r is PromiseFulfilledResult<typeof connectors[number]> => r.status === 'fulfilled')
        .map((r) => r.value);
    } catch {
      // Hors contexte extension — fallback statique
      connectors = connectorRegistry.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        status: 'detecting' as ConnectorStatus,
        lastSync: null,
        enabled: false,
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
</script>

<SettingsLayout {onBack} content={settingsContent}>
  {#snippet settingsContent()}
    <div class="space-y-6">
      <!-- Profil -->
      <div class="section-card-strong rounded-[1.5rem] p-4 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-semibold text-text-primary">Profil</h3>
            <p class="mt-1 text-xs leading-relaxed text-text-secondary">Vos informations de freelance.</p>
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
        <div>
          <h3 class="text-sm font-semibold text-text-primary">Cle API Anthropic</h3>
          <p class="mt-1 text-xs leading-relaxed text-text-secondary">Necessaire pour enrichir l'analyse TJM locale avec le modele.</p>
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

      <!-- Intervalle de scan -->
      <div class="section-card rounded-[1.5rem] p-4 space-y-3">
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
          >
            <span class="inline-block h-5 w-5 rounded-full transition-transform duration-200 {notifications ? 'translate-x-6 bg-accent-emerald' : 'translate-x-0.5 bg-text-muted'}"></span>
          </button>
        </div>
      </div>

      <!-- Connecteurs -->
      <ConnectorPanel
        {connectors}
        onToggle={toggleConnector}
      />

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
