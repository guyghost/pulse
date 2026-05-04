<script lang="ts">
  import type { Snippet } from 'svelte';

  const {
    content,
  }: {
    content: Snippet;
  } = $props();
</script>

<div class="relative flex h-full flex-col px-4 py-6 overflow-y-auto">
  <div
    class="pointer-events-none absolute left-1/2 top-12 h-28 w-28 -translate-x-1/2 rounded-full bg-blueprint-blue/14 blur-3xl"
  ></div>
  <div class="section-card-strong relative w-full overflow-visible rounded-2xl p-5 my-auto">
    <div
      class="pointer-events-none absolute -right-10 top-0 h-24 w-24 rounded-full bg-blueprint-blue/12 blur-3xl"
    ></div>
    <div class="relative">
      <div class="mb-6">
        <p class="eyebrow text-blueprint-blue/80">MissionPulse</p>
        <h1 class="mt-3 text-xl font-semibold leading-tight text-text-primary">Affinez votre radar</h1>
        <p class="mt-3 text-sm leading-relaxed text-text-secondary">
          Vos premières missions peuvent déjà être visibles. Ajoutez maintenant votre profil pour
          personnaliser le scoring, ou revenez plus tard.
        </p>
      </div>

      <div class="mb-6 grid grid-cols-3 gap-2">
        <div class="rounded-lg border border-border-light bg-surface-white px-3 py-3">
          <p class="text-[11px] uppercase tracking-[0.18em] text-text-muted">Scan</p>
          <p class="mt-2 text-sm font-semibold text-text-primary">Multi-source</p>
        </div>
        <div class="rounded-lg border border-border-light bg-surface-white px-3 py-3">
          <p class="text-[11px] uppercase tracking-[0.18em] text-text-muted">Score</p>
          <p class="mt-2 text-sm font-semibold text-text-primary">Pertinence</p>
        </div>
        <div class="rounded-lg border border-border-light bg-surface-white px-3 py-3">
          <p class="text-[11px] uppercase tracking-[0.18em] text-text-muted">TJM</p>
          <p class="mt-2 text-sm font-semibold text-text-primary">Ajuste</p>
        </div>
      </div>

      {@render content()}
    </div>
  </div>
</div>
