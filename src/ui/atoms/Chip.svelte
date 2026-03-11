<script lang="ts">
  let { label, selected = false, onclick }: {
    label: string;
    selected?: boolean;
    onclick?: () => void;
  } = $props();
</script>

<button
  class="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full transition-colors
    {selected
      ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/40'
      : 'bg-surface text-text-secondary border border-border hover:bg-surface-hover hover:text-text-primary'}"
  {onclick}
>
  {label}
</button>
