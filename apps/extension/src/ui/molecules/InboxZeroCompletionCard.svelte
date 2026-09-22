<script lang="ts">
  import { Icon } from '@pulse/ui';

  const {
    favoritesCount = 0,
    totalCount = 0,
    onReviewAll = () => {},
    onTriggerScan = () => {},
  }: {
    favoritesCount?: number;
    totalCount?: number;
    onReviewAll?: () => void;
    onTriggerScan?: () => void;
  } = $props();
</script>

<section
  class="section-card-strong my-4 flex flex-col items-center rounded-2xl border border-accent-green/25 bg-surface-white p-6 text-center shadow-subtle-2"
  aria-label="Veille à jour"
  data-testid="inbox-zero-completion"
>
  <div
    class="flex h-12 w-12 items-center justify-center rounded-full bg-accent-green/12 text-accent-green"
    aria-hidden="true"
  >
    <Icon name="check-circle" size={24} />
  </div>

  <h3 class="mt-3.5 text-heading-md font-semibold text-text-primary">Veille à jour !</h3>

  <p class="mt-1 max-w-sm text-body leading-relaxed text-text-subtle">
    Vous avez qualifié toutes les opportunités du marché ({totalCount} mission{totalCount > 1
      ? 's'
      : ''}). Aucune opportunité laissée au hasard.
  </p>

  {#if favoritesCount > 0}
    <div
      class="mt-4 inline-flex items-center gap-2 rounded-xl border border-border-light bg-page-canvas px-3.5 py-2 text-caption font-medium text-text-secondary"
      data-testid="inbox-zero-favorites-recap"
    >
      <Icon name="star" size={13} class="fill-blueprint-blue text-blueprint-blue" />
      <span>
        {favoritesCount} opportunité{favoritesCount > 1 ? 's' : ''} mise{favoritesCount > 1
          ? 's'
          : ''} de côté dans vos favoris
      </span>
    </div>
  {/if}

  <div class="mt-5 flex flex-wrap items-center justify-center gap-2.5">
    <button
      type="button"
      class="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-blueprint-blue-strong px-4 text-caption font-semibold text-white shadow-subtle-2 transition-colors hover:bg-blueprint-blue-strong/90 active:translate-y-px"
      onclick={onReviewAll}
      data-testid="review-all-feed-btn"
    >
      <Icon name="rotate-ccw" size={13} />
      <span>Revoir tout le feed</span>
    </button>
    <button
      type="button"
      class="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border-light bg-page-canvas px-3.5 text-caption font-medium text-text-secondary transition-colors hover:bg-subtle-gray hover:text-text-primary active:translate-y-px"
      onclick={onTriggerScan}
      data-testid="refresh-scan-btn"
    >
      <Icon name="refresh-cw" size={13} />
      <span>Actualiser les missions</span>
    </button>
  </div>
</section>
