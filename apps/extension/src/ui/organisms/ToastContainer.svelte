<script lang="ts">
  import { ToastStore } from '$lib/state/toast.svelte.ts';
  import { Toast } from '@pulse/ui';
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
        <Toast
          message={toast.message}
          type={toast.toastType}
          onDismiss={() => handleDismiss(toast.id)}
        />
      </div>
    {/each}
  </div>
{/if}
