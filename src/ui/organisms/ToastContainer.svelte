<script lang="ts">
  import type { ActorRefFrom } from 'xstate';
  import { toastMachine } from '../../machines/toast.machine';
  import Toast from '../atoms/Toast.svelte';
  import { fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { quintOut } from 'svelte/easing';

  interface Props {
    actor: ActorRefFrom<typeof toastMachine>;
  }

  let { actor }: Props = $props();

  // Use a function to avoid Svelte's static analysis flagging prop capture
  const getInitial = () => actor.getSnapshot();
  let snapshot = $state.raw(getInitial());

  $effect(() => {
    snapshot = actor.getSnapshot();
    const sub = actor.subscribe((s) => {
      snapshot = s;
    });
    return () => sub.unsubscribe();
  });

  let toasts = $derived(snapshot.context.toasts);

  function handleDismiss(id: number) {
    actor.send({ type: 'DISMISS', id });
  }
</script>

{#if toasts.length > 0}
  <div 
    class="absolute bottom-16 left-3 right-3 z-50 flex flex-col gap-2"
    aria-live="polite"
    aria-atomic="true"
  >
    {#each toasts as toast (toast.id)}
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
