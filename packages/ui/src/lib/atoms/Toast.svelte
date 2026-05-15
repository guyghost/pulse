<script lang="ts">
  import Icon from './Icon.svelte';
  import { fly } from 'svelte/transition';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  type ToastType = 'info' | 'error' | 'success' | 'warning';

  const {
    message,
    type = 'info',
    class: className = '',
    dismissLabel = 'Fermer la notification',
    onDismiss,
  }: {
    message: string;
    type?: ToastType;
    class?: string;
    dismissLabel?: string;
    onDismiss?: () => void;
  } = $props();

  const iconMap = {
    info: 'info',
    error: 'alert-circle',
    success: 'check-circle',
    warning: 'alert-circle',
  } as const;

  const colorClasses = {
    info: 'border-blueprint-blue/20 bg-surface-white text-blueprint-blue',
    error: 'border-status-red/20 bg-surface-white text-status-red',
    success: 'border-accent-green/20 bg-surface-white text-accent-green',
    warning: 'border-status-orange/20 bg-surface-white text-status-orange',
  } as const;
</script>

<div
  class="flex items-center gap-2 rounded-xl border px-4 py-3 font-geist shadow-subtle {colorClasses[
    type
  ]} {className}"
  transition:fly={{ y: 20, duration: 250 }}
  role="alert"
>
  <Icon name={iconMap[type]} size={16} />
  <p class="flex-1 text-xs font-medium">{message}</p>
  {#if onDismiss}
    <button
      type="button"
      class="rounded-md p-0.5 opacity-60 transition-opacity hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
      onclick={onDismiss as HTMLButtonAttributes['onclick']}
      aria-label={dismissLabel}
    >
      <Icon name="x" size={14} />
    </button>
  {/if}
</div>
