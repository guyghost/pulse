<script lang="ts">
  import Icon from './Icon.svelte';
  import { fly } from 'svelte/transition';

  const {
    message,
    type = 'info',
    onDismiss,
  }: {
    message: string;
    type?: 'info' | 'error' | 'success';
    onDismiss?: () => void;
  } = $props();

  const iconMap = {
    info: 'info',
    error: 'alert-circle',
    success: 'check-circle',
  } as const;

  const colorClasses = {
    info: 'border-accent-blue/20 bg-accent-blue/10 text-accent-blue',
    error: 'border-accent-red/20 bg-accent-red/10 text-accent-red',
    success: 'border-accent-emerald/20 bg-accent-emerald/10 text-accent-emerald',
  } as const;
</script>

<div
  class="flex items-center gap-2 rounded-2xl border px-4 py-3 shadow-lg {colorClasses[type]}"
  transition:fly={{ y: 20, duration: 250 }}
>
  <Icon name={iconMap[type]} size={16} />
  <p class="flex-1 text-xs font-medium">{message}</p>
  <button class="opacity-60 transition-opacity hover:opacity-100" onclick={() => onDismiss?.()}>
    <Icon name="x" size={14} />
  </button>
</div>
