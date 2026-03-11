<script lang="ts">
  type BadgeVariant = 'tech' | 'status' | 'source';

  let { label, variant = 'tech' }: {
    label: string;
    variant?: BadgeVariant;
  } = $props();

  let classes = $derived(
    variant === 'tech'
      ? 'bg-navy-700 text-accent-blue font-mono text-[11px]'
      : variant === 'status'
      ? 'bg-accent-emerald/20 text-accent-emerald text-[11px]'
      : 'bg-navy-600 text-text-secondary text-[11px]'
  );
</script>

<span class="inline-flex items-center px-1.5 py-0.5 rounded-full {classes}">
  {label}
</span>
