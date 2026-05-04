<script lang="ts">
  import { Icon } from '@pulse/ui';

  export type FeedTourStepId = 'score' | 'filters' | 'expand' | 'seen';

  export interface FeedTourStep {
    id: FeedTourStepId;
    title: string;
    description: string;
  }

  const {
    step,
    stepIndex,
    totalSteps,
    onNext,
    onSkip,
  }: {
    step: FeedTourStep;
    stepIndex: number;
    totalSteps: number;
    onNext: () => void;
    onSkip: () => void;
  } = $props();
</script>

<div class="pointer-events-none fixed inset-x-4 bottom-4 z-50">
  <div
    class="pointer-events-auto section-card-strong rounded-xl border border-blueprint-blue/25 p-4 shadow-[0_18px_40px_rgba(1,7,12,0.42)] backdrop-blur-md"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-start gap-3">
        <div
          class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-blueprint-blue/15 text-blueprint-blue"
        >
          <Icon name="star" size={16} />
        </div>
        <div>
          <p class="text-[11px] uppercase tracking-[0.18em] text-blueprint-blue/80">
            Tour du feed · {stepIndex + 1}/{totalSteps}
          </p>
          <h3 class="mt-1 text-sm font-semibold text-text-primary">{step.title}</h3>
          <p class="mt-1 text-xs leading-relaxed text-text-secondary">{step.description}</p>
        </div>
      </div>
      <button
        class="rounded-lg px-2 py-1 text-[11px] text-text-muted transition-colors hover:bg-subtle-gray hover:text-text-primary"
        onclick={onSkip}
      >
        Passer
      </button>
    </div>

    <div class="mt-4 flex items-center justify-between gap-3">
      <div class="flex items-center gap-1.5">
        {#each Array(totalSteps) as _, index}
          <span
            class="h-1.5 rounded-full transition-all duration-200 {index === stepIndex
              ? 'w-6 bg-blueprint-blue'
              : 'w-1.5 bg-border-light'}"
          ></span>
        {/each}
      </div>
      <button
        class="inline-flex items-center gap-2 rounded-lg border border-blueprint-blue/25 bg-blueprint-blue/88 px-4 py-2 text-xs font-semibold text-text-900 transition-all duration-200 hover:brightness-105"
        onclick={onNext}
      >
        {stepIndex + 1 === totalSteps ? 'Terminer' : 'Suivant'}
        <Icon name="arrow-right" size={14} />
      </button>
    </div>
  </div>
</div>
