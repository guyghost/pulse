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
          <Button variant="secondary" onclick={saveApiKey}>
            {#snippet children()}{apiKeySaved ? 'Sauvé !' : 'Sauver'}{/snippet}
          </Button>
        </div>
      </div>

      <ConnectorPanel
        {connectors}
        onToggle={toggleConnector}
      />
    </div>
  {/snippet}
</SettingsLayout>
