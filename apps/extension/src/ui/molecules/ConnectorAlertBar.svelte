<script lang="ts">
  import { Icon } from '@pulse/ui';

  interface BrokenConnectorAlert {
    connectorId: string;
    connectorName: string;
    isEnabled: boolean;
  }

  const {
    brokenConnectors,
    onRecheck,
    onEnableAndScan,
  }: {
    brokenConnectors: BrokenConnectorAlert[];
    onRecheck: (connectorId: string) => void;
    onEnableAndScan: (connectorId: string) => void;
  } = $props();
</script>

{#if brokenConnectors.length > 0}
  <div class="mx-4 mb-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3">
    <div class="flex items-start gap-3">
      <div
        class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-500/15"
      >
        <Icon name="alert-circle" size={16} class="text-red-400" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-[12px] font-semibold text-text-primary">Santé des connecteurs</p>
        <p class="mt-1 text-[11px] text-text-secondary">
          {brokenConnectors.length === 1
            ? `${brokenConnectors[0]?.connectorName} rencontre des erreurs répétées.`
            : `${brokenConnectors.length} connecteurs rencontrent des erreurs répétées.`}
        </p>

        <div class="mt-3 flex flex-col gap-2">
          {#each brokenConnectors as connector (connector.connectorId)}
            <div
              class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-light bg-page-canvas px-3 py-2"
            >
              <div>
                <p class="text-[11px] font-medium text-text-primary">{connector.connectorName}</p>
                <p class="text-[10px] text-text-muted">
                  {connector.isEnabled
                    ? 'Re-vérifiez ce connecteur maintenant.'
                    : 'Ce connecteur est désactivé.'}
                </p>
              </div>
              <div class="flex items-center gap-2">
                {#if connector.isEnabled}
                  <button
                    class="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-1.5 text-[11px] font-medium text-red-300 transition-colors hover:bg-red-400/20"
                    onclick={() => onRecheck(connector.connectorId)}
                  >
                    Re-check
                  </button>
                {:else}
                  <button
                    class="rounded-lg border border-blueprint-blue/25 bg-blueprint-blue/15 px-3 py-1.5 text-[11px] font-medium text-blueprint-blue transition-colors hover:bg-blueprint-blue/25"
                    onclick={() => onEnableAndScan(connector.connectorId)}
                  >
                    Activer &amp; scan
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>
{/if}
