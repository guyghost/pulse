<script lang="ts">
  type BadgeVariant = 'tech' | 'status' | 'source';

  const {
    label,
    variant = 'tech',
  }: {
    label: string;
    variant?: BadgeVariant;
  } = $props();

  const classes = $derived(
    variant === 'tech'
      ? 'border border-accent-blue/18 bg-accent-blue/12 text-accent-blue font-mono text-[11px]'
      : variant === 'status'
        ? 'border border-accent-emerald/18 bg-accent-emerald/14 text-accent-emerald text-[11px]'
        : 'border border-white/8 bg-white/[0.04] text-text-secondary text-[11px]'
  );
</script>

<span class="inline-flex items-center rounded-full px-2 py-1 {classes}">
  {label}
</span>
