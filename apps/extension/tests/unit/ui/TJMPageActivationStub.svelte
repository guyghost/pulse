<script lang="ts">
  import TJMPage from '../../../src/ui/pages/TJMPage.svelte';

  let active = $state(true);

  export function setActive(value: boolean): void {
    active = value;
  }
</script>

<TJMPage {active} />
