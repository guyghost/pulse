<script lang="ts">
  import { ToastStore } from '$lib/state/toast.svelte';
  import { modalFeedback } from '$lib/shell/ui/modal-focus';
  import { mount, unmount } from 'svelte';
  import ToastCollection from './ToastCollection.svelte';

  interface Props {
    store: ToastStore;
  }

  const { store }: Props = $props();

  function activateFeedbackRenderer(renderer: HTMLElement): () => void {
    const collection = mount(ToastCollection, {
      target: renderer,
      props: { store, renderer },
    });
    return () => {
      void unmount(collection, { outro: false });
    };
  }
</script>

<div
  data-feedback-application-host
  use:modalFeedback={{ onAccepted: activateFeedbackRenderer }}
></div>
