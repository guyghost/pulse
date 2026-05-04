<script lang="ts">
  import type { Mission } from '$lib/core/types/mission';
  import type { ExportFormat } from '$lib/core/export/mission-export';
  import { Icon } from '@pulse/ui';

  interface Props {
    missions: Mission[];
    onExport: (format: ExportFormat, content: string) => void;
    label?: string;
  }

  const { missions, onExport, label = 'Exporter' }: Props = $props();

  let isOpen = $state(false);
  let includeDescription = $state(true);
  let dateFormat: 'iso' | 'locale' | 'relative' = $state('locale');

  const formats: { id: ExportFormat; label: string; icon: string }[] = [
    { id: 'json', label: 'JSON', icon: 'file-json' },
    { id: 'csv', label: 'CSV', icon: 'file-spreadsheet' },
    { id: 'markdown', label: 'Markdown', icon: 'file-text' },
  ];

  function handleFormatSelect(format: ExportFormat) {
    // Import dynamique du Core pour garder le composant léger
    import('$lib/core/export/mission-export').then((module) => {
      const now = new Date();
      const content = module.exportMissions(
        missions,
        {
          format,
          includeDescription,
          dateFormat,
        },
        now
      );
      onExport(format, content);
      isOpen = false;
    });
  }

  function toggleMenu() {
    isOpen = !isOpen;
  }

  // Fermer le menu quand on clique en dehors
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.export-menu')) {
      isOpen = false;
    }
  }

  $effect(() => {
    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  });
</script>

<div class="export-menu relative inline-block">
  <button
    class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border-light bg-subtle-gray px-4 py-2.5 text-sm font-semibold text-text-primary transition-all duration-200 hover:bg-subtle-gray"
    onclick={toggleMenu}
    aria-haspopup="true"
    aria-expanded={isOpen}
  >
    <Icon name="download" size={16} />
    <span>{label}</span>
    <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} />
  </button>

  {#if isOpen}
    <div
      class="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-border-light bg-surface-white p-2 shadow-xl"
      role="menu"
    >
      <!-- Options -->
      <div class="space-y-3 border-b border-border-light p-3">
        <label class="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            class="accent-blueprint-blue"
            checked={includeDescription}
            onchange={() => {
              includeDescription = !includeDescription;
            }}
          />
          <span>Inclure les descriptions</span>
        </label>

        <div class="space-y-1">
          <span class="text-xs text-text-muted">Format de date</span>
          <select
            class="w-full rounded-md border border-border-light bg-page-canvas px-3 py-2 text-sm text-text-primary focus:border-blueprint-blue/30 focus:outline-none"
            value={dateFormat}
            onchange={(e) => {
              dateFormat = e.currentTarget.value as typeof dateFormat;
            }}
          >
            <option value="locale">Locale (FR)</option>
            <option value="iso">ISO 8601</option>
            <option value="relative">Relative</option>
          </select>
        </div>
      </div>

      <!-- Formats -->
      <div class="p-1 pt-2">
        {#each formats as format}
          <button
            class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-text-primary transition-colors hover:bg-subtle-gray"
            onclick={() => handleFormatSelect(format.id)}
            role="menuitem"
          >
            <Icon name={format.icon} size={18} class="text-blueprint-blue/70" />
            <span>{format.label}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>
