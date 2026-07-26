<script lang="ts">
  import { ToastStore } from '$lib/state/toast.svelte';
  import { invalidateModalFeedbackFocus } from '$lib/shell/ui/modal-focus';
  import { Icon, Toast } from '@pulse/ui';
  import { flip } from 'svelte/animate';
  import { quintOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';

  interface Props {
    store: ToastStore;
    renderer: HTMLElement;
  }

  const { store, renderer }: Props = $props();

  function captureFocusedControl(): HTMLElement | null {
    const active = renderer.ownerDocument.activeElement;
    return active instanceof HTMLElement && renderer.contains(active) ? active : null;
  }

  function handleDismiss(id: number): void {
    const focusedControl = captureFocusedControl();
    store.dismiss(id);
    if (focusedControl) {
      invalidateModalFeedbackFocus(focusedControl);
    }
  }

  function handleAction(id: number, action: () => void): void {
    const focusedControl = captureFocusedControl();
    action();
    store.dismiss(id);
    if (focusedControl) {
      invalidateModalFeedbackFocus(focusedControl);
    }
  }
</script>

{#if store.toasts.length > 0}
  <div
    class="absolute bottom-[var(--toast-bottom-offset,4rem)] left-3 right-3 z-50 flex flex-col gap-2 transition-[bottom] duration-200"
  >
    {#each store.toasts as toast (toast.id)}
      <div
        animate:flip={{ duration: 250, easing: quintOut }}
        transition:fly={{ y: 20, duration: 250, easing: quintOut }}
      >
        {#if toast.action}
          <div
            class="flex items-center gap-2 rounded-xl border border-blueprint-blue/20 bg-surface-white px-4 py-3 font-geist text-blueprint-blue shadow-subtle"
          >
            <p class="flex-1 text-xs font-medium">{toast.message}</p>
            <button
              type="button"
              class="rounded-md px-2 py-1 text-[11px] font-semibold text-blueprint-blue transition-colors hover:bg-blueprint-blue/8"
              onclick={() => handleAction(toast.id, toast.action!.onClick)}
            >
              {toast.action.label}
            </button>
            <button
              type="button"
              class="rounded-md p-0.5 opacity-60 transition-opacity hover:opacity-100"
              onclick={() => handleDismiss(toast.id)}
              aria-label="Fermer la notification"
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        {:else}
          <Toast
            message={toast.message}
            type={toast.toastType}
            announce={false}
            onDismiss={() => handleDismiss(toast.id)}
          />
        {/if}
      </div>
    {/each}
  </div>
{/if}
