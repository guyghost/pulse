<script lang="ts">
  import SettingsLayout from '../templates/SettingsLayout.svelte';
  import ConnectorPanel from '../organisms/ConnectorPanel.svelte';
  import Button from '../atoms/Button.svelte';
  import type { ConnectorStatus } from '$lib/core/types/connector';

  let { onBack }: { onBack?: () => void } = $props();

  let apiKey = $state('');
  let apiKeySaved = $state(false);

  // Connector info (would be populated from service worker in real usage)
  let connectors = $state([
    { id: 'free-work', name: 'Free-Work', icon: 'briefcase', status: 'detecting' as ConnectorStatus, lastSync: null as Date | null, enabled: true },
    { id: 'malt', name: 'Malt', icon: 'briefcase', status: 'detecting' as ConnectorStatus, lastSync: null as Date | null, enabled: false },
  ]);

  async function saveApiKey() {
    if (!apiKey.trim()) return;
    try {
      await chrome.storage.local.set({ apiKey });
      apiKeySaved = true;
      setTimeout(() => { apiKeySaved = false; }, 2000);
    } catch {
      // Outside extension context
    }
  }

  function toggleConnector(id: string) {
    connectors = connectors.map(c =>
      c.id === id ? { ...c, enabled: !c.enabled } : c
    );
  }
</script>

<SettingsLayout {onBack} content={settingsContent}>
  {#snippet settingsContent()}
    <div class="space-y-6">
      <!-- API Key section -->
      <div class="space-y-2">
        <h3 class="text-sm font-semibold text-text-primary">Clé API Anthropic</h3>
        <p class="text-xs text-text-secondary">Nécessaire pour l'analyse TJM par IA</p>
        <div class="flex gap-2">
          <input
            type="password"
            placeholder="sk-ant-..."
            class="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-blue"
            bind:value={apiKey}
          />
          <Button variant="secondary" onclick={saveApiKey}>
            {#snippet children()}{apiKeySaved ? 'Sauvé !' : 'Sauver'}{/snippet}
          </Button>
        </div>
      </div>

      <!-- Connectors section -->
      <ConnectorPanel
        {connectors}
        onToggle={toggleConnector}
      />
    </div>
  {/snippet}
</SettingsLayout>
