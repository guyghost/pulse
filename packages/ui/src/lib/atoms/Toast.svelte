<script lang="ts">
  import Icon from './Icon.svelte';
  import { fly } from 'svelte/transition';

  type ToastType = 'info' | 'error' | 'success' | 'warning';

  const {
    message,
    type = 'info',
    class: className = '',
    onDismiss,
  }: {
    message: string;
    type?: ToastType;
    class?: string;
    onDismiss?: () => void;
  } = $props();

  const iconMap = {
    info: 'info',
    error: 'alert-circle',
    success: 'check-circle',
    warning: 'alert-circle',
  } as const;

  const colorClasses = {
    info: 'border-blueprint-blue/20 bg-blueprint-blue/10 text-blueprint-blue',
    error: 'border-status-red/20 bg-status-red/10 text-status-red',
    success: 'border-accent-green/20 bg-accent-green/10 text-accent-green',
    warning: 'border-status-orange/20 bg-status-orange/10 text-status-orange',
  } as const;
</script>

<div
  class="flex items-center gap-2 rounded-2xl border px-4 py-3 shadow-lg {colorClasses[type]} {className}"
  transition:fly={{ y: 20, duration: 250 }}
  role="alert"
>
  <Icon name={iconMap[type]} size={16} />
  <p class="flex-1 text-xs font-medium">{message}</p>
  {#if onDismiss}
    <button class="opacity-60 transition-opacity hover:opacity-100" onclick={onDismiss} aria-label="Fermer">
      <Icon name="x" size={14} />
    </button>
  {/if}
</div>
