<script lang="ts">
    import Icon from '../atoms/Icon.svelte';
    import { 
        getRegisteredShortcuts, 
        formatShortcut,
        type ShortcutConfig 
    } from '$lib/shell/utils/keyboard-shortcuts';

    let { isOpen = $bindable(false) }: { isOpen?: boolean } = $props();

    // Group shortcuts by category
    let shortcutsByCategory = $derived(() => {
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
            if (indexA === -1 && indexB === -1) return a[0].localeCompare(b[0]);
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
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
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div 
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onclick={handleBackdropClick}
    >
        <div 
            class="w-full max-w-lg rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
            tabindex="-1"
            onkeydown={handleKeydown}
        >
            <!-- Header -->
            <div class="flex items-center justify-between mb-6">
                <div class="flex items-center gap-3">
                    <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-blue/15">
                        <Icon name="keyboard" size={20} class="text-accent-blue" />
                    </div>
                    <div>
                        <h2 
                            id="shortcuts-title" 
                            class="text-lg font-semibold text-text-primary"
                        >
                            Raccourcis clavier
                        </h2>
                        <p class="text-sm text-text-secondary">
                            Gagnez du temps avec ces raccourcis
                        </p>
                    </div>
                </div>
                <button
                    class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary"
                    onclick={closeModal}
                    aria-label="Fermer"
                >
                    <Icon name="x" size={18} />
                </button>
            </div>

            <!-- Shortcuts list -->
            <div class="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
                {#each shortcutsByCategory() as [category, shortcuts]}
                    <section>
                        <h3 class="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">
                            {category}
                        </h3>
                        <div class="space-y-2">
                            {#each shortcuts as shortcut}
                                <div class="flex items-center justify-between rounded-lg bg-white/[0.03] px-4 py-3">
                                    <span class="text-sm text-text-secondary">
                                        {shortcut.description}
                                    </span>
                                    <kbd 
                                        class="inline-flex min-w-[2rem] items-center justify-center rounded-md border border-white/10 bg-white/[0.06] px-2 py-1 text-xs font-mono font-medium text-text-primary"
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
            <div class="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
                <p class="text-xs text-text-muted">
                    Les raccourcis sont désactivés lors de la saisie dans un champ.
                </p>
                <button
                    class="rounded-lg bg-accent-blue/15 px-4 py-2 text-sm font-medium text-accent-blue transition-colors hover:bg-accent-blue/25"
                    onclick={closeModal}
                >
                    J'ai compris
                </button>
            </div>
        </div>
    </div>
{/if}
