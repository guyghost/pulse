<script lang="ts">
  let { status }: {
    status: 'online' | 'offline' | 'error';
  } = $props();

  let colorClass = $derived(
    status === 'online'
      ? 'bg-accent-emerald'
      : status === 'error'
      ? 'bg-accent-red'
      : 'bg-navy-600'
  );
</script>

<span class="inline-block w-2 h-2 rounded-full {colorClass}"></span>
