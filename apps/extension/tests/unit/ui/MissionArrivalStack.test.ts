import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick } from 'svelte';
import type { Mission } from '$lib/core/types/mission';
import MissionArrivalStack from '../../../src/ui/organisms/MissionArrivalStack.svelte';

function makeMission(index: number): Mission {
  return {
    id: `pending-${index}`,
    title: `Mission ${index}`,
    client: `Client ${index}`,
    description: `Description ${index}`,
    stack: ['TypeScript'],
    tjm: 650 + index * 10,
    location: 'Paris',
    remote: index % 2 === 0 ? 'full' : 'hybrid',
    duration: '6 mois',
    startDate: null,
    publishedAt: null,
    url: `https://example.com/${index}`,
    source: 'free-work',
    scrapedAt: new Date(`2026-07-${String(index).padStart(2, '0')}T12:00:00.000Z`),
    seniority: 'senior',
    scoreBreakdown: null,
    score: 90 - index,
    semanticScore: null,
    semanticReason: null,
  };
}

function mountStack(props: Record<string, unknown>) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(MissionArrivalStack, { target, props });
  return target;
}

describe('MissionArrivalStack', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a bounded collapsed stack with an accessible count', async () => {
    const onOpen = vi.fn();
    const target = mountStack({
      count: 8,
      missions: Array.from({ length: 4 }, (_, index) => makeMission(index + 1)),
      state: 'collapsed',
      onOpen,
    });
    await tick();

    expect(target.querySelector('[data-testid="mission-arrival-stack"]')).not.toBeNull();
    expect(target.querySelectorAll('[data-testid="arrival-stack-layer"]')).toHaveLength(3);
    expect(target.textContent).toContain('Nouvelles arrivées');
    expect(target.textContent).toContain('+8');

    const trigger = target.querySelector(
      'button[aria-label="Ouvrir les 8 nouvelles missions arrivées"]'
    ) as HTMLButtonElement;
    expect(trigger).not.toBeNull();
    trigger.click();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('shows at most three previews and refreshes explicitly from the open drawer', async () => {
    const onRefresh = vi.fn();
    const target = mountStack({
      count: 8,
      missions: Array.from({ length: 4 }, (_, index) => makeMission(index + 1)),
      state: 'open',
      onRefresh,
    });
    await tick();

    expect(target.querySelectorAll('[data-testid="arrival-preview"]')).toHaveLength(3);
    expect(target.textContent).toContain('Mission 1');
    expect(target.textContent).toContain('Actualiser la file avec les 8 missions');
    expect(document.activeElement).toBe(
      target.querySelector('[data-testid="arrival-drawer-heading"]')
    );

    const refresh = target.querySelector(
      'button[aria-label="Actualiser la file avec les 8 missions"]'
    ) as HTMLButtonElement;
    refresh.click();
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('closes on Escape and exposes refresh errors without losing previews', async () => {
    const onClose = vi.fn();
    const target = mountStack({
      count: 2,
      missions: [makeMission(1), makeMission(2)],
      state: 'refresh-error',
      errorMessage: 'Impossible d’actualiser la file. Réessayer.',
      onClose,
    });
    await tick();

    expect(target.textContent).toContain('Impossible d’actualiser la file. Réessayer.');
    expect(target.querySelectorAll('[data-testid="arrival-preview"]')).toHaveLength(2);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('disables refresh while pending missions are being applied', async () => {
    const onClose = vi.fn();
    const target = mountStack({
      count: 3,
      missions: [makeMission(1)],
      state: 'refreshing',
      onClose,
    });
    await tick();

    const refresh = target.querySelector(
      'button[aria-label="Actualisation de la file en cours"]'
    ) as HTMLButtonElement;
    expect(refresh.disabled).toBe(true);
    expect(refresh.textContent).toContain('Actualisation…');

    const closeButton = target.querySelector(
      'button[aria-label="Fermer les nouvelles arrivées"]'
    ) as HTMLButtonElement;
    expect(closeButton.disabled).toBe(true);
    closeButton.click();
    expect(onClose).not.toHaveBeenCalled();
  });
});
