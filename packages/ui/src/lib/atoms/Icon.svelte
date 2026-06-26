<script lang="ts">
  import { type IconName } from '../../icons/paths';
  import IconBase from '../../icons/Icon.svelte';

  /**
   * Atom-level Icon component.
   * Uses the centralized icon registry from @pulse/ui/icons.
   */
  const {
    name,
    size = 16,
    class: className = '',
  }: {
    name: IconName;
    size?: number;
    class?: string;
  } = $props();
</script>

<IconBase {name} {size} class={className} />
