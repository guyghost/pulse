<script lang="ts">
  import { createClock } from '../../../../src/lib/state/clock.svelte';

  const clock = createClock();
</script>

<span data-testid="clock-now">{clock.now}</span>
