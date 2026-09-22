import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick } from 'svelte';
import InboxZeroCompletionCard from '../../../src/ui/molecules/InboxZeroCompletionCard.svelte';

describe('InboxZeroCompletionCard', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders celebratory title and mission count', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    mount(InboxZeroCompletionCard, {
      target,
      props: {
        totalCount: 15,
        favoritesCount: 4,
      },
    });
    await tick();

    expect(target.textContent).toContain('Veille à jour !');
    expect(target.textContent).toContain('15 missions');
    expect(target.textContent).toContain('4 opportunités mises de côté dans vos favoris');
  });

  it('triggers onReviewAll when clicking Revoir tout le feed', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const onReviewAll = vi.fn();

    mount(InboxZeroCompletionCard, {
      target,
      props: {
        totalCount: 5,
        favoritesCount: 2,
        onReviewAll,
      },
    });
    await tick();

    const reviewBtn = target.querySelector<HTMLButtonElement>(
      '[data-testid="review-all-feed-btn"]'
    );
    expect(reviewBtn).not.toBeNull();
    reviewBtn!.click();
    expect(onReviewAll).toHaveBeenCalledTimes(1);
  });

  it('triggers onTriggerScan when clicking Actualiser les missions', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const onTriggerScan = vi.fn();

    mount(InboxZeroCompletionCard, {
      target,
      props: {
        totalCount: 5,
        favoritesCount: 2,
        onTriggerScan,
      },
    });
    await tick();

    const scanBtn = target.querySelector<HTMLButtonElement>('[data-testid="refresh-scan-btn"]');
    expect(scanBtn).not.toBeNull();
    scanBtn!.click();
    expect(onTriggerScan).toHaveBeenCalledTimes(1);
  });
});
