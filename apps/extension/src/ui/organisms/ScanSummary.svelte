<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { Icon, type IconName } from '@pulse/ui';
  import type { ScanSummary, ScanSummaryEvidenceTone } from '$lib/core/scan/scan-summary';

  const {
    summary,
    onDismiss,
  }: {
    summary: ScanSummary;
    onDismiss: () => void;
  } = $props();

  // Reduced-motion honored per token contract; Svelte transitions are JS-driven
  // so the global CSS rule does not cover them — we shorten durations here.
  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const enterMs = $derived(reduceMotion ? 0 : 180);
  const leaveMs = $derived(reduceMotion ? 0 : 150);

  // Calm icon vocabulary: green/muted check for success & quiet, blue
  // circle-alert (never red) for partial. Red is reserved for the "sources à
  // vérifier" evidence number — color is never the only signal.
  const iconName = $derived<IconName>(summary.tone === 'partial' ? 'circle-alert' : 'check-circle');

  const chipClass = $derived(
    summary.tone === 'nominal'
      ? 'bg-accent-green/10 text-accent-green'
      : summary.tone === 'partial'
        ? 'bg-blueprint-blue/10 text-blueprint-blue'
        : 'bg-subtle-gray text-text-muted'
  );

  function valueClass(tone: ScanSummaryEvidenceTone): string {
    if (tone === 'success') {
      return 'text-accent-green';
    }
    if (tone === 'critical') {
      return 'text-status-red';
    }
    return 'text-blueprint-blue';
  }
</script>

<div
  class="scan-summary flex flex-wrap items-center gap-3 rounded-xl border border-border-light bg-surface-white px-3.5 py-3 shadow-[0_1px_2px_rgba(12,10,9,0.04)]"
  role="status"
  aria-live="polite"
  in:fly={{ y: 4, duration: enterMs }}
  out:fade={{ duration: leaveMs }}
>
  <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg {chipClass}">
    <Icon name={iconName} size={16} />
  </span>

  <div class="min-w-0 flex-1">
    <p class="text-meta font-semibold leading-tight text-text-primary">{summary.headline}</p>
    <p class="mt-0.5 text-caption leading-snug text-text-secondary">{summary.caption}</p>
  </div>

  {#if summary.evidence.length > 0}
    <dl class="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
      {#each summary.evidence as row (row.label)}
        <div class="rounded-lg bg-page-canvas px-2 py-1 text-center">
          <dt class="eyebrow">{row.label}</dt>
          <dd class="mt-0.5 text-meta font-semibold tabular-nums font-mono {valueClass(row.tone)}">
            {row.value}
          </dd>
        </div>
      {/each}
    </dl>
  {/if}

  <button
    type="button"
    class="soft-ring -m-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-subtle-gray hover:text-text-primary"
    aria-label="Masquer le résumé du scan"
    onclick={onDismiss}
  >
    <Icon name="x" size={14} />
  </button>
</div>
