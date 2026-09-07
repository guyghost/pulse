<script lang="ts">
  /**
   * Welcome hero (outcome-led). First screen of the onboarding flow.
   * One primary action ("Commencer"), a discrete "Passer" link, no form.
   * Pure presentational: reports intent via callbacks (the page maps them to
   * flow-machine events). The model decides transitions, not this component.
   */
  import { Icon, type IconName } from '@pulse/ui';

  const {
    onStart,
    onSkip,
  }: {
    onStart: () => void;
    onSkip: () => void;
  } = $props();

  const pillars: { icon: IconName; title: string; detail: string }[] = [
    {
      icon: 'briefcase',
      title: 'Centralisé',
      detail: 'Vos sources freelance, un seul feed.',
    },
    {
      icon: 'star',
      title: 'Scoré',
      detail: 'Les missions à traiter en premier.',
    },
    {
      icon: 'check',
      title: 'Local',
      detail: '100% sur votre navigateur.',
    },
  ];
</script>

<section class="flex h-full flex-col">
  <div class="flex-1">
    <p class="eyebrow text-blueprint-blue/80">MissionPulse</p>

    <h1 class="mt-4 text-[28px] font-semibold leading-[1.1] tracking-tight text-text-primary">
      Toutes vos missions freelance,<br />centralisées et scorées.
    </h1>

    <p class="mt-4 text-body-lg leading-relaxed text-text-secondary">
      Connectez vos plateformes existantes. Pulse récupère, déduplique et classe les missions pour
      ne rien rater de ce qui compte.
    </p>

    <ul class="mt-8 space-y-3">
      {#each pillars as p (p.title)}
        <li class="flex items-center gap-3">
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-blueprint-blue/20 bg-blueprint-blue/8 text-blueprint-blue"
          >
            <Icon name={p.icon} class="h-4 w-4" />
          </span>
          <div>
            <p class="text-sm font-semibold text-text-primary">{p.title}</p>
            <p class="text-xs text-text-muted">{p.detail}</p>
          </div>
        </li>
      {/each}
    </ul>
  </div>

  <div
    class="sticky bottom-0 -mx-4 mt-6 border-t border-border-light bg-page-canvas/95 px-4 pb-4 pt-3 backdrop-blur"
  >
    <button
      type="button"
      onclick={onStart}
      class="h-12 w-full rounded-2xl bg-blueprint-blue text-sm font-semibold text-white transition-transform duration-150 ease-out hover:brightness-105 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blueprint-blue"
    >
      Commencer
    </button>
    <button
      type="button"
      onclick={onSkip}
      class="mt-2 h-9 w-full text-xs font-medium text-text-muted transition-colors hover:text-text-secondary"
    >
      Passer pour l'instant
    </button>
  </div>
</section>
