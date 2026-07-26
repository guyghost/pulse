<script lang="ts">
  import { Icon, type IconName } from '@pulse/ui';

  type Theme = 'light' | 'dark' | 'system';

  const {
    theme,
    busy = false,
    onSelect,
  }: {
    theme: Theme;
    busy?: boolean;
    onSelect?: (theme: Theme) => void;
  } = $props();

  const options: Array<{ id: Theme; label: string; icon: IconName }> = [
    { id: 'light', label: 'Clair', icon: 'sun' },
    { id: 'dark', label: 'Sombre', icon: 'moon' },
    { id: 'system', label: 'Système', icon: 'monitor' },
  ];
</script>

<div class="flex gap-2" role="group" aria-label="Apparence" aria-busy={busy}>
  {#each options as option (option.id)}
    <button
      type="button"
      class="flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-wait disabled:opacity-60
        {theme === option.id
        ? 'border-blueprint-blue bg-blueprint-blue/10 text-blueprint-blue'
        : 'border-border-light bg-page-canvas text-text-primary hover:bg-subtle-gray'}"
      onclick={() => onSelect?.(option.id)}
      aria-pressed={theme === option.id}
      disabled={busy}
    >
      <Icon name={option.icon} size={14} />
      {option.label}
    </button>
  {/each}
</div>
