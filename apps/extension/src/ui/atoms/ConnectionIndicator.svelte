<script lang="ts">
  import { createConnectionStore } from '$lib/state/connection.svelte';
  import { Icon } from '@pulse/ui';

  const connection = createConnectionStore();

  $effect(() => {
    return () => connection.destroy();
  });

  const status = $derived(connection.status);
  const rtt = $derived(connection.rtt);
  const effectiveType = $derived(connection.effectiveType);

  // S'affiche uniquement quand offline ou slow
  const isVisible = $derived(status === 'offline' || status === 'slow');

  let showDetails = $state(false);

  // Couleurs selon le statut
  const statusConfig = $derived.by(() => {
    switch (status) {
      case 'online':
        return {
          color: 'bg-blueprint-blue',
          bgColor: 'bg-blueprint-blue/10',
          borderColor: 'border-blueprint-blue/25',
          textColor: 'text-blueprint-blue',
          icon: 'wifi',
          label: 'En ligne',
        };
      case 'slow':
        return {
          color: 'bg-blueprint-blue',
          bgColor: 'bg-blueprint-blue/10',
          borderColor: 'border-blueprint-blue/30',
          textColor: 'text-blueprint-blue',
          icon: 'wifi-slow',
          label: 'Connexion lente',
        };
      case 'offline':
        return {
          color: 'bg-status-red',
          bgColor: 'bg-status-red/8',
          borderColor: 'border-status-red/20',
          textColor: 'text-status-red',
          icon: 'wifi-off',
          label: 'Hors ligne',
        };
      default:
        return {
          color: 'bg-text-muted',
          bgColor: 'bg-page-canvas',
          borderColor: 'border-border-light',
          textColor: 'text-text-secondary',
          icon: 'wifi',
          label: 'Inconnu',
        };
    }
  });

  function toggleDetails() {
    if (status !== 'online') {
      showDetails = !showDetails;
    }
  }

  function closeDetails() {
    showDetails = false;
  }

  // Fermer les détails quand on clique ailleurs
  $effect(() => {
    if (!showDetails) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest('.connection-indicator')) {
        closeDetails();
      }
    }

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  });
</script>

{#if isVisible}
  <div class="connection-indicator relative">
    <button
      class="soft-ring flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 transition-all duration-200 {statusConfig.bgColor} {statusConfig.borderColor} {statusConfig.textColor} hover:opacity-80"
      onclick={toggleDetails}
      title={statusConfig.label}
      aria-label={statusConfig.label}
      aria-expanded={showDetails}
    >
      <span class="relative flex h-2 w-2">
        {#if status === 'offline'}
          <span
            class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 {statusConfig.color}"
          ></span>
        {/if}
        <span class="relative inline-flex h-2 w-2 rounded-full {statusConfig.color}"></span>
      </span>
      <Icon name={statusConfig.icon} size={12} />
      <span class="text-[10px] font-medium uppercase tracking-wider">{statusConfig.label}</span>
    </button>

    {#if showDetails}
      <div
        class="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-border-light bg-surface p-3 shadow-xl"
        role="dialog"
        aria-label="Détails de la connexion"
      >
        <div class="flex items-center gap-2 border-b border-border-light pb-2 mb-2">
          <span class="h-2 w-2 rounded-full {statusConfig.color}"></span>
          <span class="text-xs font-medium text-text-primary">{statusConfig.label}</span>
        </div>

        <div class="space-y-1.5 text-xs">
          {#if rtt !== undefined}
            <div class="flex justify-between">
              <span class="text-text-secondary">Latence:</span>
              <span class="text-text-primary">{rtt} ms</span>
            </div>
          {/if}

          {#if effectiveType}
            <div class="flex justify-between">
              <span class="text-text-secondary">Type:</span>
              <span class="text-text-primary uppercase">{effectiveType}</span>
            </div>
          {/if}

          {#if status === 'offline'}
            <p class="mt-2 text-text-secondary leading-relaxed">
              Mode hors ligne activé. Les données en cache sont disponibles.
            </p>
          {:else if status === 'slow'}
            <p class="mt-2 text-text-secondary leading-relaxed">
              Connexion limitée. Certaines fonctionnalités peuvent être ralenties.
            </p>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}
