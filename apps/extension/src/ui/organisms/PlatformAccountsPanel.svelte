<script lang="ts">
  import { Icon } from '@pulse/ui';
  import type { PlatformAccountBinding } from '@pulse/domain';
  import {
    PLATFORM_ACCOUNT_CONNECTORS,
    type PlatformAccountConnectorId,
    type PlatformAccountOperationError,
  } from '$lib/shell/account/platform-accounts';
  import {
    addPlatformAccount,
    getPlatformAccounts,
    switchPlatformAccount,
  } from '$lib/shell/facades/platform-accounts.facade';
  import { showToast } from '$lib/shell/notifications/toast-service';

  let bindings = $state<PlatformAccountBinding[]>([]);
  let connectorId = $state<PlatformAccountConnectorId>('free-work');
  let displayLabel = $state('');
  let confirmed = $state(false);
  let busy = $state(false);
  let error = $state<PlatformAccountOperationError | null>(null);

  const errorLabels: Record<PlatformAccountOperationError, string> = {
    ACCOUNT_REQUIRED: 'Connectez d’abord cette extension à votre compte MissionPulse.',
    PREMIUM_REQUIRED: 'Le deuxième compte par plateforme nécessite Premium.',
    LIMIT_REACHED: 'Le quota multi-compte configuré sur le serveur est atteint.',
    SESSION_REQUIRED: 'Connectez-vous d’abord au compte ciblé sur la plateforme.',
    CONFIRMATION_REQUIRED: 'Confirmez que la session active correspond au libellé saisi.',
    SESSION_MISMATCH:
      'La session active ne correspond pas à ce compte. Reconnectez-vous sur la plateforme puis réessayez.',
    BINDING_NOT_FOUND: 'Ce compte enregistré n’existe plus.',
    SERVER_ERROR: 'Le compte plateforme n’a pas pu être enregistré. Réessayez.',
  };

  const groupedBindings = $derived.by(() =>
    PLATFORM_ACCOUNT_CONNECTORS.map((connector) => ({
      ...connector,
      bindings: bindings.filter((binding) => binding.connectorId === connector.id),
    })).filter((connector) => connector.bindings.length > 0)
  );

  async function reload(): Promise<void> {
    bindings = await getPlatformAccounts();
  }

  async function addCurrent(): Promise<void> {
    busy = true;
    error = null;
    try {
      const result = await addPlatformAccount({
        connectorId,
        displayLabel,
        confirmed,
      });
      if (!result.ok) {
        error = result.error;
        return;
      }
      displayLabel = '';
      confirmed = false;
      await reload();
      await showToast('Compte plateforme enregistré', 'success');
    } finally {
      busy = false;
    }
  }

  async function activate(bindingId: string): Promise<void> {
    busy = true;
    error = null;
    try {
      const result = await switchPlatformAccount(bindingId);
      if (!result.ok) {
        error = result.error;
        return;
      }
      await reload();
      await showToast('Compte plateforme actif mis à jour', 'success');
    } finally {
      busy = false;
    }
  }

  void reload();
</script>

<section
  class="mt-4 rounded-xl border border-border-light bg-page-canvas p-4"
  aria-labelledby="platform-accounts-title"
>
  <div class="flex items-start justify-between gap-3">
    <div>
      <p class="eyebrow eyebrow--strong eyebrow--blue">Multi-compte</p>
      <h3 id="platform-accounts-title" class="mt-1 text-sm font-semibold text-text-primary">
        Comptes plateforme
      </h3>
      <p class="mt-1 text-[11px] leading-5 text-text-subtle">
        Le premier compte par plateforme est gratuit. Premium autorise plusieurs identités sous le
        même compte Pulse. Les cookies restent dans Chrome; seul un hash de session est enregistré.
      </p>
    </div>
    <Icon name="users" size={16} class="shrink-0 text-blueprint-blue" />
  </div>

  <div class="mt-3 grid gap-2 sm:grid-cols-2">
    <label class="text-[11px] text-text-subtle">
      Plateforme
      <select
        class="mt-1 w-full rounded-lg border border-border-light bg-surface-white px-3 py-2 text-xs text-text-primary"
        bind:value={connectorId}
      >
        {#each PLATFORM_ACCOUNT_CONNECTORS as connector (connector.id)}
          <option value={connector.id}>{connector.label}</option>
        {/each}
      </select>
    </label>
    <label class="text-[11px] text-text-subtle">
      Libellé du compte
      <input
        class="mt-1 w-full rounded-lg border border-border-light bg-surface-white px-3 py-2 text-xs text-text-primary"
        maxlength="80"
        placeholder="Ex. Compte personnel"
        bind:value={displayLabel}
      />
    </label>
  </div>
  <label class="mt-3 flex items-start gap-2 text-[11px] leading-5 text-text-subtle">
    <input type="checkbox" class="mt-0.5" bind:checked={confirmed} />
    Je confirme être connecté au compte correspondant dans l’onglet plateforme.
  </label>
  <button
    type="button"
    class="mt-3 rounded-lg bg-blueprint-blue px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
    disabled={busy || !confirmed || displayLabel.trim().length === 0}
    onclick={addCurrent}
  >
    Enregistrer la session active
  </button>

  {#if error}
    <p
      class="mt-3 rounded-lg border border-status-red/25 bg-status-red/5 p-3 text-xs text-status-red"
      role="alert"
    >
      {errorLabels[error]}
    </p>
  {/if}

  {#if groupedBindings.length > 0}
    <div class="mt-4 space-y-3">
      {#each groupedBindings as group (group.id)}
        <div>
          <p class="eyebrow eyebrow--strong">
            {group.label}
          </p>
          <div class="mt-1 space-y-1.5">
            {#each group.bindings as binding (binding.id)}
              <div
                class="flex items-center justify-between gap-3 rounded-lg border border-border-light bg-surface-white px-3 py-2"
              >
                <div>
                  <p class="text-xs font-medium text-text-primary">{binding.displayLabel}</p>
                  <p class="text-[10px] text-text-muted">
                    {binding.isActive
                      ? 'Session active'
                      : binding.status === 'locked_by_entitlement'
                        ? 'Verrouillé sans Premium'
                        : 'Reconnectez ce compte avant de l’activer'}
                  </p>
                </div>
                {#if !binding.isActive}
                  <button
                    type="button"
                    class="rounded-md border border-border-light px-2 py-1 text-[10px] font-medium text-text-primary disabled:opacity-50"
                    disabled={busy || binding.status === 'locked_by_entitlement'}
                    onclick={() => activate(binding.id)}
                  >
                    Activer
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>
