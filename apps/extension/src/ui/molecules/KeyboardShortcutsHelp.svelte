<script lang="ts">
  import Icon from '../atoms/Icon.svelte';
  import {
    getRegisteredShortcuts,
    formatShortcut,
    type ShortcutConfig,
  } from '$lib/shell/utils/keyboard-shortcuts';

  let { isOpen = $bindable(false) }: { isOpen?: boolean } = $props();

  // Group shortcuts by category
  const shortcutsByCategory = $derived(() => {
    const shortcuts = getRegisteredShortcuts();
    const grouped = new Map<string, ShortcutConfig[]>();

    for (const shortcut of shortcuts) {
      const category = shortcut.category || 'Autres';
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(shortcut);
    }

    // Sort categories in preferred order
    const categoryOrder = ['Navigation', 'Actions', 'Recherche', 'Filtres', 'Aide', 'Autres'];
    return Array.from(grouped.entries()).sort((a, b) => {
      const indexA = categoryOrder.indexOf(a[0]);
      const indexB = categoryOrder.indexOf(b[0]);
      if (indexA === -1 && indexB === -1) {
        return a[0].localeCompare(b[0]);
      }
      if (indexA === -1) {
        return 1;
      }
      if (indexB === -1) {
        return -1;
      }
      return indexA - indexB;
    });
  });

  function closeModal() {
    isOpen = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      closeModal();
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      closeModal();
    }
  }
</script>

{#if isOpen}
  <div
    class="absolute inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="shortcuts-title"
    tabindex="-1"
  >
    <!-- Header -->
    <div class="shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/10">
      <div class="flex items-center gap-2.5">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-blue/15">
          <Icon name="keyboard" size={16} class="text-accent-blue" />
        </div>
        <div>
          <h2 id="shortcuts-title" class="text-sm font-semibold text-text-primary">
            Raccourcis clavier
          </h2>
          <p class="text-[11px] text-text-secondary">Gagnez du temps avec ces raccourcis</p>
        </div>
      </div>
      <button
        class="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary"
        onclick={closeModal}
        aria-label="Fermer"
      >
        <Icon name="x" size={16} />
      </button>
    </div>

    <!-- Shortcuts list -->
    <div class="flex-1 overflow-y-auto px-4 py-3 space-y-4">
      {#each shortcutsByCategory() as [category, shortcuts]}
        <section>
          <h3 class="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">
            {category}
          </h3>
          <div class="space-y-1">
            {#each shortcuts as shortcut}
              <div class="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                <span class="text-[13px] text-text-secondary">
                  {shortcut.description}
                </span>
                <kbd
                  class="inline-flex shrink-0 min-w-[1.75rem] items-center justify-center rounded-md border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[11px] font-mono font-medium text-text-primary ml-3"
                >
                  {formatShortcut(shortcut)}
                </kbd>
              </div>
            {/each}
          </div>
        </section>
      {/each}
    </div>

    <!-- Footer -->
    <div class="shrink-0 flex items-center justify-between border-t border-white/10 px-4 py-3">
      <p class="text-[11px] text-text-muted">Désactivés pendant la saisie</p>
      <button
        class="rounded-lg bg-accent-blue/15 px-3.5 py-1.5 text-[13px] font-medium text-accent-blue transition-colors hover:bg-accent-blue/25"
        onclick={closeModal}
      >
        J'ai compris
      </button>
    </div>
  </div>
{/if}
