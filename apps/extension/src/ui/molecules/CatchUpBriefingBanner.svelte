<script lang="ts">
  import type { CatchUpBriefing } from '$lib/core/feed/catch-up-briefing';
  import { Icon } from '@pulse/ui';

  const {
    briefing = null,
    waveActive = false,
    onShowWave = () => {},
    onExitWave = () => {},
  }: {
    briefing?: CatchUpBriefing | null;
    /** True once the one-click wave filter is applied to the feed. */
    waveActive?: boolean;
    onShowWave?: () => void;
    onExitWave?: () => void;
  } = $props();

  function pluralized(n: number, singular: string, plural: string): string {
    return n > 1 ? plural : singular;
  }

  const headline = $derived(
    briefing
      ? `${briefing.count} ${pluralized(briefing.count, 'nouvelle mission', 'nouvelles missions')} depuis votre dernière visite`
      : ''
  );

  const details = $derived.by(() => {
    if (!briefing) {
      return null;
    }
    const parts: string[] = [];
    if (briefing.gradeA > 0) {
      parts.push(`${briefing.gradeA} ${pluralized(briefing.gradeA, 'pépite', 'pépites')}`);
    }
    if (typeof briefing.meanTjm === 'number') {
      parts.push(`TJM moyen ${briefing.meanTjm} €/j`);
    }
    if (briefing.topMission?.title) {
      parts.push(`Top : ${briefing.topMission.title}`);
    }
    return parts;
  });
</script>

{#if briefing}
  <section
    class="mb-3 flex items-start justify-between gap-3 rounded-xl border border-blueprint-blue/20 bg-surface-white px-3.5 py-3 shadow-[0_1px_4px_-2px_rgba(11,100,233,0.08)]"
    aria-label="Quoi de neuf"
    data-testid="catch-up-briefing"
  >
    <div class="min-w-0">
      <p class="eyebrow eyebrow--strong eyebrow--blue flex items-center gap-1.5">
        <Icon name="sparkles" size={12} />
        <span>Quoi de neuf</span>
      </p>
      <p class="mt-1 text-body font-medium leading-snug text-text-primary">{headline}</p>
      {#if details}
        <p class="mt-0.5 line-clamp-2 text-meta leading-5 text-text-subtle">
          {details.join(' · ')}
        </p>
      {/if}
    </div>
    {#if waveActive}
      <button
        type="button"
        class="shrink-0 rounded-lg border border-border-light bg-page-canvas px-3 py-1.5 text-caption font-medium text-text-secondary transition-colors hover:border-disabled-gray hover:bg-subtle-gray hover:text-text-primary"
        onclick={onExitWave}
      >
        Tout le feed
      </button>
    {:else}
      <button
        type="button"
        class="shrink-0 rounded-lg bg-blueprint-blue-strong px-3 py-1.5 text-caption font-medium text-white shadow-subtle-2 transition-colors hover:bg-blueprint-blue-strong/90"
        onclick={onShowWave}
      >
        Voir la nouvelle vague
      </button>
    {/if}
  </section>
{/if}
