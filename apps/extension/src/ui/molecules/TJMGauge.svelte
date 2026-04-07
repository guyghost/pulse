<script lang="ts">
  import type { TJMRange } from '$lib/core/types/tjm';

  let { missionTjm, range }: {
    missionTjm: number;
    range: TJMRange;
  } = $props();

  // Calculate position of the mission TJM on the gauge (0-100%)
  let gaugeMin = $derived(Math.max(0, range.min - 100));
  let gaugeMax = $derived(range.max + 100);
  let gaugeRange = $derived(gaugeMax - gaugeMin);

  let position = $derived(
    Math.max(0, Math.min(100, ((missionTjm - gaugeMin) / gaugeRange) * 100))
  );

  let rangeStart = $derived(((range.min - gaugeMin) / gaugeRange) * 100);
  let rangeEnd = $derived(((range.max - gaugeMin) / gaugeRange) * 100);

  let status = $derived(
    missionTjm < range.min ? 'below' : missionTjm > range.max ? 'above' : 'within'
  );

  let statusColor = $derived(
    status === 'within' ? 'bg-accent-emerald' : status === 'below' ? 'bg-accent-amber' : 'bg-accent-blue'
  );

  let statusText = $derived(
    status === 'within' ? 'Dans le march\u00e9' : status === 'below' ? 'Sous le march\u00e9' : 'Au-dessus du march\u00e9'
  );
</script>

<div class="space-y-1">
  <div class="flex justify-between text-[10px] text-text-muted font-mono">
    <span>{range.min}\u20ac</span>
    <span class="text-text-secondary">{statusText}</span>
    <span>{range.max}\u20ac</span>
  </div>
  <div class="relative h-2 bg-navy-700 rounded-full overflow-hidden">
    <!-- Market range band -->
    <div
      class="absolute h-full bg-navy-600 rounded-full"
      style:left="{rangeStart}%"
      style:width="{rangeEnd - rangeStart}%"
    ></div>
    <!-- Mission TJM marker -->
    <div
      class="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full {statusColor} border-2 border-navy-900 shadow-sm"
      style:left="calc({position}% - 6px)"
    ></div>
  </div>
  <div class="text-center">
    <span class="text-xs font-mono font-bold text-text-primary">{missionTjm}\u20ac/j</span>
  </div>
</div>
