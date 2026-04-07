<script lang="ts">
  let { label, selected = false, onclick }: {
    label: string;
    selected?: boolean;
    onclick?: () => void;
  } = $props();
</script>

<button
  class="inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition-colors
    {selected
      ? 'border border-accent-blue/25 bg-accent-blue/14 text-accent-blue'
      : 'border border-white/8 bg-white/[0.04] text-text-secondary hover:bg-white/[0.08] hover:text-text-primary'}"
  {onclick}
>
  {label}
</button>
