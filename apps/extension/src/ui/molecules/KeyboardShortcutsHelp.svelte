<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity';
  import { Icon } from '@pulse/ui';
  import {
    getRegisteredShortcuts,
    formatShortcut,
    type ShortcutConfig,
  } from '$lib/shell/utils/keyboard-shortcuts';

  let { isOpen = $bindable(false) }: { isOpen?: boolean } = $props();
  let dialogElement = $state<HTMLDivElement | undefined>(undefined);
  let closeButton = $state<HTMLButtonElement | undefined>(undefined);

  // Group shortcuts by category. $derived.by evaluates the function so the
  // value is the grouped array (reactive to any $state/$derived read inside),
  // rather than storing the function itself.
  const shortcutsByCategory = $derived.by(() => {
    const shortcuts = getRegisteredShortcuts();
    const grouped = new SvelteMap<string, ShortcutConfig[]>();

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
    e.stopPropagation();

    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
      return;
    }

    if (e.key !== 'Tab' || !dialogElement) {
      return;
    }

    const focusableElements = Array.from(
      dialogElement.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements.at(-1);

    if (!firstFocusable || !lastFocusable) {
      return;
    }

    if (e.shiftKey && document.activeElement === firstFocusable) {
      e.preventDefault();
      lastFocusable.focus();
    } else if (!e.shiftKey && document.activeElement === lastFocusable) {
      e.preventDefault();
      firstFocusable.focus();
    }
  }

  $effect(() => {
    if (isOpen) {
      closeButton?.focus();
    }
  });
</script>

{#if isOpen}
  <div class="absolute inset-0 z-50 flex items-center justify-center p-3">
    <button
      type="button"
      class="absolute inset-0 bg-black/45 backdrop-blur-sm"
      data-testid="shortcuts-help-scrim"
      onclick={closeModal}
      aria-label="Fermer l'aide des raccourcis"
    ></button>

    <div
      bind:this={dialogElement}
      class="relative flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border-light bg-surface-white shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      aria-describedby="shortcuts-description"
      tabindex="-1"
      onkeydown={handleKeydown}
    >
      <!-- Header -->
      <header class="shrink-0 border-b border-border-light px-4 py-4">
        <div class="flex items-start justify-between gap-3">
          <div class="flex min-w-0 items-center gap-3">
            <div
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blueprint-blue/15 bg-blueprint-blue/8"
              aria-hidden="true"
            >
              <Icon name="keyboard" size={17} class="text-blueprint-blue" />
            </div>
            <div class="min-w-0">
              <p class="text-[10px] font-semibold uppercase tracking-[0.15em] text-blueprint-blue">
                Navigation rapide
              </p>
              <h2 id="shortcuts-title" class="mt-0.5 text-heading font-semibold text-text-primary">
                Raccourcis clavier
              </h2>
              <p id="shortcuts-description" class="mt-1 text-[12px] leading-5 text-text-subtle">
                Repérez l'action, puis sa touche associée.
              </p>
            </div>
          </div>
          <button
            bind:this={closeButton}
            type="button"
            class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-light text-text-muted transition-colors hover:bg-page-canvas hover:text-text-primary"
            onclick={closeModal}
            aria-label="Fermer"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      </header>

      <!-- Shortcuts list -->
      <div class="flex-1 overflow-y-auto bg-page-canvas px-4 py-4">
        <div class="space-y-4">
          {#each shortcutsByCategory as [category, shortcuts] (category)}
            <section aria-labelledby={`shortcut-category-${category}`}>
              <h3
                id={`shortcut-category-${category}`}
                class="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted"
              >
                {category}
              </h3>
              <div
                class="overflow-hidden rounded-xl border border-border-light bg-surface-white shadow-subtle-2"
              >
                {#each shortcuts as shortcut, index (index)}
                  <div
                    class="flex min-h-12 items-center justify-between gap-3 px-3 py-2.5 {index > 0
                      ? 'border-t border-border-light'
                      : ''}"
                  >
                    <span class="min-w-0 text-[13px] font-medium leading-5 text-text-secondary">
                      {shortcut.description}
                    </span>
                    <kbd
                      class="inline-flex shrink-0 items-center justify-center rounded-lg border border-border-light bg-subtle-gray px-2.5 py-1 text-[12px] font-mono font-semibold leading-none text-text-primary shadow-subtle-2"
                    >
                      {formatShortcut(shortcut)}
                    </kbd>
                  </div>
                {/each}
              </div>
            </section>
          {/each}
        </div>
      </div>

      <!-- Footer -->
      <footer class="shrink-0 border-t border-border-light bg-surface-white px-4 py-3">
        <div class="flex items-center justify-between gap-3">
          <p class="text-[11px] leading-4 text-text-subtle">Désactivés pendant la saisie</p>
          <button
            type="button"
            class="shrink-0 rounded-lg bg-blueprint-blue px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-blueprint-blue/90"
            onclick={closeModal}
          >
            J'ai compris
          </button>
        </div>
      </footer>
    </div>
  </div>
{/if}
