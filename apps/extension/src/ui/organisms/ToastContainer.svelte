<script lang="ts">
  import { ToastStore } from '$lib/state/toast.svelte.ts';
  import { Icon, Toast } from '@pulse/ui';
  import { fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { quintOut } from 'svelte/easing';

  interface Props {
    store: ToastStore;
  }

  const { store }: Props = $props();

  function handleDismiss(id: number) {
    store.dismiss(id);
  }

  function handleAction(id: number, action: () => void) {
    action();
    store.dismiss(id);
  }
</script>

{#if store.toasts.length > 0}
  <div
    class="absolute bottom-16 left-3 right-3 z-50 flex flex-col gap-2"
    aria-live="polite"
    aria-atomic="true"
  >
    {#each store.toasts as toast (toast.id)}
      <div
        animate:flip={{ duration: 250, easing: quintOut }}
        transition:fly={{ y: 20, duration: 250, easing: quintOut }}
      >
        {#if toast.action}
          <div
            class="flex items-center gap-2 rounded-xl border border-blueprint-blue/20 bg-surface-white px-4 py-3 font-geist text-blueprint-blue shadow-subtle"
            role="alert"
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
            onDismiss={() => handleDismiss(toast.id)}
          />
        {/if}
      </div>
    {/each}
  </div>
{/if}
